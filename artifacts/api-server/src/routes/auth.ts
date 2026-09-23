import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as c from '@workspace/api-zod';
import { db, users, suppliers } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { HttpError, mapUser, respond, toNum } from '../http.js';

export const authRouter = Router();
export const meRouter = Router();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The caller's OWN supplier row id, or null.
 *
 * The session payload reports this so the client knows whether the signed-in
 * account has a SELLER surface at all: the seller routes are gated on the row
 * (an admin that owns one sells, an admin that owns none is refused), so the
 * answer has to travel with the session. Null means "no shop" — never 0, never
 * someone else's row.
 */
async function supplierIdOf(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.userId, userId))
    .limit(1);
  return row ? toNum(row.id) : null;
}

/** POST /api/auth/register — 409 {error:'email_taken'} on duplicate email. */
authRouter.post('/register', async (req, res) => {
  const input = c.zRegisterInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const { name, email, password, role, company, country, lang } = input.data;
  const normalized = normalizeEmail(email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (existing.length > 0) throw new HttpError(409, { error: 'email_taken' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const [inserted] = await db
    .insert(users)
    .values({
      name,
      email: normalized,
      passwordHash,
      role,
      company: company ?? null,
      country: country ?? null,
      lang,
    })
    .returning();

  // Suppliers get an empty directory profile automatically so they can
  // immediately receive RFQs and submit quotations.
  if (role === 'supplier') {
    await db.insert(suppliers).values({
      userId: inserted.id,
      companyName: company ?? name,
      country: country ?? '',
      city: null,
      description: null,
      verifiedLevel: 0,
      rating: '0',
      inspectionsCount: 0,
      fulfillmentRate: '0',
      tags: [],
      since: null,
    });
  }

  const user = mapUser({ ...inserted, supplierId: await supplierIdOf(toNum(inserted.id)) });
  res.status(201);
  respond(res, c.zAuthResponse, { token: signToken(user.id, inserted.tokenVersion ?? 0), user });
});

/** POST /api/auth/login — 401 {error:'invalid_credentials'} on bad email/password. */
authRouter.post('/login', async (req, res) => {
  const input = c.zLoginInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const { email, password } = input.data;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) {
    throw new HttpError(401, { error: 'invalid_credentials' });
  }

  respond(
    res,
    c.zAuthResponse,
    {
      token: signToken(toNum(row.id), toNum(row.tokenVersion)),
      user: mapUser({ ...row, supplierId: await supplierIdOf(toNum(row.id)) }),
    },
  );
});

/** GET /api/me — auth required, returns the current user (with its own supplierId). */
meRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row) throw new HttpError(401, { error: 'auth_required' });
  // The session payload is where the client learns whether it can SELL: the
  // seller surface is gated on the caller's own supplier row, not on the role
  // name, so an admin that owns a shop must see that row id here — and an admin
  // that owns none reads `null` instead of a value we would have had to invent.
  respond(res, c.zUser, mapUser({ ...row, supplierId: await supplierIdOf(uid) }));
});

/**
 * PATCH /api/me — the caller edits their OWN profile.
 *
 * Deliberately limited to self-service fields (name, company, country, lang).
 * `role`, `tokenVersion`, `emailVerified`, `trustScore` and the email address
 * are NOT patchable here: role/tokenVersion are privilege and session-revocation
 * state, and emailVerified/trustScore are verification outcomes granted by an
 * admin flow, never self-asserted.
 */
const zUpdateMeInput = z
  .object({
    name: z.string().min(2).max(80).optional(),
    company: z.string().max(120).nullable().optional(),
    country: z.string().max(60).nullable().optional(),
    lang: z.string().min(2).max(8).optional(),
  })
  .strict();

meRouter.patch('/', requireAuth, async (req, res) => {
  const input = zUpdateMeInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const patch: Record<string, unknown> = {};
  if (input.data.name !== undefined) patch.name = input.data.name;
  if (input.data.company !== undefined) patch.company = input.data.company;
  if (input.data.lang !== undefined) patch.lang = input.data.lang;

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, uid));
  }

  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row) throw new HttpError(401, { error: 'auth_required' });
  respond(res, c.zUser, mapUser({ ...row, supplierId: await supplierIdOf(uid) }));
});

/**
 * POST /api/me/become-supplier — anyone may start selling.
 *
 * The owner's requirement is that any account can list stock, so a buyer needs a
 * way up. This is the ONLY endpoint that changes a role, and it moves one way
 * only: buyer -> supplier. `role` is deliberately NOT writable through PATCH
 * /api/me, which would otherwise let a buyer self-assign 'admin'.
 *
 * Idempotent: calling it twice leaves one supplier profile, not two.
 */
meRouter.post('/become-supplier', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const [me] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!me) throw new HttpError(401, { error: 'auth_required' });

  if (me.role !== 'supplier' && me.role !== 'admin') {
    await db.update(users).set({ role: 'supplier' }).where(eq(users.id, uid));
  }

  // Listings hang off a supplier profile; create it once, exactly as register
  // does for a signup that chose the supplier role.
  const [existing] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.userId, uid))
    .limit(1);
  if (!existing) {
    await db.insert(suppliers).values({
      userId: uid,
      companyName: me.company ?? me.name,
      country: me.country ?? '',
      city: null,
      description: null,
      verifiedLevel: 0,
      rating: '0',
      inspectionsCount: 0,
      fulfillmentRate: '0',
      tags: [],
      since: null,
      // A real account created it; the directory profile is not demo data.
      dataSource: 'platform',
    });
  }

  const [fresh] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!fresh) throw new HttpError(401, { error: 'auth_required' });
  respond(res, c.zUser, mapUser({ ...fresh, supplierId: await supplierIdOf(uid) }));
});
