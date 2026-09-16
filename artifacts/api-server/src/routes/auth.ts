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

  const user = mapUser(inserted);
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

  respond(res, c.zAuthResponse, { token: signToken(toNum(row.id), toNum(row.tokenVersion)), user: mapUser(row) });
});

/** GET /api/me — auth required, returns the current user. */
meRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });
  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row) throw new HttpError(401, { error: 'auth_required' });
  respond(res, c.zUser, mapUser(row));
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
  if (input.data.country !== undefined) patch.country = input.data.country;
  if (input.data.lang !== undefined) patch.lang = input.data.lang;

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, uid));
  }

  const [row] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!row) throw new HttpError(401, { error: 'auth_required' });
  respond(res, c.zUser, mapUser(row));
});
