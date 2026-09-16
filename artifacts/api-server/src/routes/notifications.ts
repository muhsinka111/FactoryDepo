/**
 * routes/notifications.ts — the caller's in-app notification feed.
 *
 * Access rules: authenticated and strictly self-scoped. Every query is filtered
 * on `notifications.userId = caller`, so no user can read or mark another
 * user's notifications read. `unread` in the response is a real COUNT over the
 * caller's unread rows, not an estimate.
 */
import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as c from '@workspace/api-zod';
import { db, notifications } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, mapNotification, respond, toNum } from '../http.js';

export const notificationsRouter = Router();

/** Body of POST /api/notifications/read — omitted ids means "mark all read". */
const zMarkReadInput = z.object({
  ids: z.array(z.number().int().positive()).max(500).optional(),
});

/** GET /api/notifications — own feed, newest first, with a real unread count. */
notificationsRouter.get('/', requireAuth, async (req, res) => {
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, uid))
    .orderBy(desc(notifications.id));

  const [unreadRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, uid), eq(notifications.read, false)));

  respond(res, c.zNotificationList, {
    items: rows.map(mapNotification),
    total: rows.length,
    unread: toNum(unreadRow?.n),
  });
});

/**
 * POST /api/notifications/read — mark the given ids read, or every notification
 * when `ids` is omitted. Ids belonging to another user are ignored by the
 * `userId` filter rather than rejected. → 204
 */
notificationsRouter.post('/read', requireAuth, async (req, res) => {
  const input = zMarkReadInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const ids = input.data.ids;
  const where =
    ids && ids.length > 0
      ? and(eq(notifications.userId, uid), inArray(notifications.id, ids))
      : eq(notifications.userId, uid);

  await db.update(notifications).set({ read: true }).where(where);
  res.status(204).end();
});
