import { Router } from 'express';
import { sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db } from '../db.js';
import { respond } from '../http.js';

export const healthRouter = Router();

/** GET /api/healthz — never throws; db:'down' when the database is unreachable. */
healthRouter.get('/', async (_req, res) => {
  let dbUp = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbUp = true;
  } catch (err) {
    console.warn('[health] db check failed:', err instanceof Error ? err.message : String(err));
  }
  const body: c.Health = {
    status: 'ok',
    db: dbUp ? 'up' : 'down',
    time: new Date().toISOString(),
  };
  respond(res, c.zHealth, body);
});
