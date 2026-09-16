/**
 * routes/messages.ts — buyer↔supplier conversations.
 *
 * Access rules
 *  - GET  /api/threads              : only threads the caller is a party to —
 *                                     as the buyer, or as the OWN supplier row
 *                                     of the thread (admins see all).
 *  - POST /api/threads              : buyer-initiated. The supplierId in the body
 *                                     must be a real supplier row; the buyer is
 *                                     the caller. An existing thread for the same
 *                                     buyer+supplier+product is reused instead of
 *                                     duplicated.
 *  - GET  /api/threads/:id          : 404 when unknown, 403 when the caller is
 *                                     not a party. Marks the other party's
 *                                     messages read, and reports real
 *                                     messageCount / unreadCount.
 *  - POST /api/threads/:id/messages : party-only; appends the message and bumps
 *                                     threads.lastMessageAt.
 * `zThread.dataSource` is null for a thread that is not about a specific lot.
 */
import { Router } from 'express';
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, messages, products, suppliers, threads, users } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapMessage, mapThread, parseId, respond, toNum } from '../http.js';
import { callerContext, notify, queueEmail } from '../helpers.js';

export const messagesRouter = Router();

/**
 * One row per thread with a cheap per-thread aggregate (sub-selects rather than
 * GROUP BY, so the column list stays flat and readable).
 */
function threadCols(viewerId: number) {
  return {
    id: threads.id,
    buyerId: threads.buyerId,
    buyerName: users.name,
    supplierId: threads.supplierId,
    supplierName: suppliers.companyName,
    supplierUserId: suppliers.userId,
    productId: threads.productId,
    productName: products.name,
    subject: threads.subject,
    lastMessageAt: threads.lastMessageAt,
    messageCount: sql<number>`(SELECT count(*) FROM ${messages} m WHERE m."threadId" = ${threads.id})`.as('messageCount'),
    // Unread = written by the other party and not yet read. Own messages never
    // count toward the caller's badge.
    unreadCount:
      sql<number>`(SELECT count(*) FROM ${messages} m WHERE m."threadId" = ${threads.id} AND m."readAt" IS NULL AND m."senderId" <> ${viewerId})`.as(
        'unreadCount',
      ),
    dataSource: products.dataSource,
    createdAt: threads.createdAt,
  };
}

/** GET /api/threads — threads the caller is party to, most recently active first. */
messagesRouter.get('/', requireAuth, async (req, res) => {
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const where = ctx.isAdmin
    ? undefined
    : ctx.supplierId != null
      ? or(eq(threads.buyerId, ctx.userId), eq(threads.supplierId, ctx.supplierId))
      : eq(threads.buyerId, ctx.userId);

  const base = db
    .select(threadCols(ctx.userId))
    .from(threads)
    .innerJoin(users, eq(threads.buyerId, users.id))
    .innerJoin(suppliers, eq(threads.supplierId, suppliers.id))
    .leftJoin(products, eq(threads.productId, products.id));

  const rows = await (where ? base.where(where) : base).orderBy(
    desc(sql`COALESCE(${threads.lastMessageAt}, ${threads.createdAt})`),
    desc(threads.id),
  );

  const items = rows.map(mapThread);
  respond(res, c.zThreadList, { items, total: items.length });
});

/**
 * POST /api/threads — open (or reuse) a conversation with a supplier.
 * `supplierId` is the directory id of the counterparty, validated to exist; the
 * buyer side is always the caller.
 */
messagesRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zThreadCreateInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const { supplierId, productId, subject } = input.data;

  const [supplier] = await db
    .select({ id: suppliers.id, userId: suppliers.userId, companyName: suppliers.companyName, email: users.email })
    .from(suppliers)
    .innerJoin(users, eq(suppliers.userId, users.id))
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) throw new HttpError(404, { error: 'supplier_not_found' });
  if (toNum(supplier.userId) === ctx.userId) {
    throw new HttpError(400, { error: 'own_supplier', details: 'You cannot message your own supplier profile.' });
  }

  if (productId != null) {
    const [product] = await db
      .select({ id: products.id, supplierId: products.supplierId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw new HttpError(404, { error: 'product_not_found' });
    if (toNum(product.supplierId) !== supplierId) {
      throw new HttpError(400, { error: 'product_supplier_mismatch' });
    }
  }

  // Reuse: same buyer + supplier + product (a null product compares as its own
  // "general enquiry" bucket) never spawns a second thread.
  const [existing] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(
      and(
        eq(threads.buyerId, ctx.userId),
        eq(threads.supplierId, supplierId),
        productId == null ? isNull(threads.productId) : eq(threads.productId, productId),
      ),
    )
    .orderBy(desc(threads.id))
    .limit(1);

  let threadId = existing ? toNum(existing.id) : 0;
  if (!existing) {
    const [inserted] = await db
      .insert(threads)
      .values({ buyerId: ctx.userId, supplierId, productId: productId ?? null, subject: subject ?? null })
      .returning({ id: threads.id });
    threadId = toNum(inserted?.id);
    await notify(
      {
        userId: toNum(supplier.userId),
        role: 'supplier',
        text: `New enquiry from ${ctx.name}.`,
        type: 'thread',
        link: '/supplier/messages',
      },
    );
    await queueEmail({
      toEmail: supplier.email,
      subject: subject ?? 'New enquiry',
      template: 'thread_created',
      payload: { threadId, buyerId: ctx.userId, productId: productId ?? null, subject: subject ?? null },
    });
  }

  const [row] = await db
    .select(threadCols(ctx.userId))
    .from(threads)
    .innerJoin(users, eq(threads.buyerId, users.id))
    .innerJoin(suppliers, eq(threads.supplierId, suppliers.id))
    .leftJoin(products, eq(threads.productId, products.id))
    .where(eq(threads.id, threadId))
    .limit(1);

  res.status(existing ? 200 : 201);
  respond(res, c.zThread, mapThread(row));
});

/** GET /api/threads/:id — party-only; 403 for a non-party, 404 when unknown. */
messagesRouter.get('/:id', requireAuth, async (req, res) => {
  const id = parseId(req);
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const [row] = await db
    .select(threadCols(ctx.userId))
    .from(threads)
    .innerJoin(users, eq(threads.buyerId, users.id))
    .innerJoin(suppliers, eq(threads.supplierId, suppliers.id))
    .leftJoin(products, eq(threads.productId, products.id))
    .where(eq(threads.id, id))
    .limit(1);

  if (!row) throw new HttpError(404, { error: 'not_found' });
  const isParty =
    ctx.isAdmin || row.buyerId === ctx.userId || (ctx.supplierId != null && row.supplierId === ctx.supplierId);
  if (!isParty) throw new HttpError(403, { error: 'forbidden' });

  const rows = await db
    .select({
      id: messages.id,
      threadId: messages.threadId,
      senderId: messages.senderId,
      senderName: users.name,
      body: messages.body,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.threadId, id))
    .orderBy(asc(messages.id));

  // Read receipt: opening the thread marks everything the other party wrote as
  // read (timestamp kept, not just a flag). Best-effort — never fail the read.
  try {
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.threadId, id), isNull(messages.readAt), ne(messages.senderId, ctx.userId)));
  } catch (err) {
    console.error('[messages] read-receipt update failed (ignored):', err instanceof Error ? err.message : String(err));
  }

  respond(res, c.zThreadDetail, { thread: mapThread(row), messages: rows.map(mapMessage) });
});

/** POST /api/threads/:id/messages — party-only append + lastMessageAt bump. */
messagesRouter.post('/:id/messages', requireAuth, async (req, res) => {
  const id = parseId(req);
  const input = c.zSendMessageInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });

  const [thread] = await db
    .select({
      id: threads.id,
      buyerId: threads.buyerId,
      supplierId: threads.supplierId,
      supplierUserId: suppliers.userId,
    })
    .from(threads)
    .innerJoin(suppliers, eq(threads.supplierId, suppliers.id))
    .where(eq(threads.id, id))
    .limit(1);

  if (!thread) throw new HttpError(404, { error: 'not_found' });
  const isParty =
    ctx.isAdmin || thread.buyerId === ctx.userId || (ctx.supplierId != null && thread.supplierId === ctx.supplierId);
  if (!isParty) throw new HttpError(403, { error: 'forbidden' });

  const [inserted] = await db
    .insert(messages)
    .values({ threadId: id, senderId: ctx.userId, body: input.data.body })
    .returning({ id: messages.id });

  await db.update(threads).set({ lastMessageAt: new Date() }).where(eq(threads.id, id));

  // Tell the other side there is something to read.
  const otherUserId = ctx.userId === toNum(thread.buyerId) ? toNum(thread.supplierUserId) : toNum(thread.buyerId);
  const otherEmail = (
    await db.select({ email: users.email }).from(users).where(eq(users.id, otherUserId)).limit(1)
  )[0]?.email;
  await notify(
    { userId: otherUserId, text: `New message from ${ctx.name}.`, type: 'message', link: `/threads/${id}` },
  );
  await queueEmail({
    toEmail: otherEmail,
    subject: 'New message',
    template: 'message_received',
    payload: { threadId: id, messageId: toNum(inserted?.id), senderId: ctx.userId },
  });

  const [msgRow] = await db
    .select({
      id: messages.id,
      threadId: messages.threadId,
      senderId: messages.senderId,
      senderName: users.name,
      body: messages.body,
      readAt: messages.readAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(eq(messages.id, toNum(inserted?.id)))
    .limit(1);

  res.status(201);
  respond(res, c.zMessage, mapMessage(msgRow));
});
