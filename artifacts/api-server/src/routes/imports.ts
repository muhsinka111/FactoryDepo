/**
 * routes/imports.ts — titles for listings an operator sources from elsewhere.
 *
 * POST /api/imports/title — supplier or admin. Auth is NOT optional here: the
 * call reaches a paid provider the moment a key is configured (a buyer must get
 * a 403), and the answer is a catalogue-visible string, so it is a seller-side
 * action. The body is validated with the shared contract schema and the answer
 * is validated against `zGeneratedTitle` on the way out, so the client can never
 * be shown a shape the contract does not describe.
 *
 * The engine selection (AI vs the deterministic composer), the title rules and
 * the catalogue-uniqueness check all live in src/ai/title.ts. This route only
 * authenticates, validates, delegates and reports — it never throws for a
 * provider problem, because a missing key or a dead provider must still answer.
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import * as c from '@workspace/api-zod';
import { requireAuth } from '../auth.js';
import { HttpError, respond } from '../http.js';
import { callerContext } from '../helpers.js';
import { generateTitle } from '../ai/title.js';

export const importsRouter = Router();

/**
 * requireRole()'s two-role sibling. `requireRole` takes a single role, and this
 * endpoint is deliberately open to the supplier AND the oversight plane (an
 * admin importing supply on FactoryDepo's own account); everyone else — buyers,
 * inspectors, lab, logistics — gets the same 403 a role mismatch would produce.
 */
async function requireSupplierOrAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const ctx = await callerContext(req.userId);
    if (!ctx) {
      next(new HttpError(401, { error: 'auth_required' }));
      return;
    }
    if (!ctx.isAdmin && ctx.role !== 'supplier') {
      next(new HttpError(403, { error: 'forbidden', details: 'Generating an imported listing title is a supplier or admin action.' }));
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

importsRouter.post('/title', requireAuth, requireSupplierOrAdmin, async (req, res) => {
  const input = c.zGeneratedTitleInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  // Never throws: an unavailable provider, a missing key or an unusable model
  // answer all come back as a composed title plus a note saying exactly why.
  const result = await generateTitle(input.data);
  respond(res, c.zGeneratedTitle, result);
});
