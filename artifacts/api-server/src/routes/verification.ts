/**
 * routes/verification.ts — the supplier's own verification-desk documents.
 *
 * Access rules
 *  - GET  /api/supplier/docs : supplier only, and only the docs belonging to the
 *                              caller's OWN supplier row (`supplierId` is taken
 *                              from the token, never from the request).
 *  - POST /api/supplier/docs : supplier only; upserts one (docType) row for the
 *                              caller's own supplier row to status 'submitted'.
 *                              Review (approve/reject) is admin-only and lives in
 *                              routes/admin.ts — a supplier can never approve
 *                              their own documents.
 */
import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
import { db, supplierDocs } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, mapSupplierDoc, respond } from '../http.js';
import { callerContext } from '../helpers.js';

export const verificationRouter = Router();

/** GET /api/supplier/docs — own checklist only. */
verificationRouter.get('/docs', requireAuth, requireRole('supplier'), async (req, res) => {
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });
  if (ctx.supplierId == null) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile.' });

  const rows = await db
    .select()
    .from(supplierDocs)
    .where(eq(supplierDocs.supplierId, ctx.supplierId))
    .orderBy(asc(supplierDocs.id));

  respond(res, c.zSupplierDocList, { items: rows.map(mapSupplierDoc), total: rows.length });
});

/**
 * POST /api/supplier/docs — submit (or resubmit) one document type.
 * Upsert: a supplier has at most one row per docType, and submitting always
 * clears the previous review (reviewedBy/reviewedAt/note reset) so a resubmitted
 * document cannot keep an earlier "approved" decision.
 */
verificationRouter.post('/docs', requireAuth, requireRole('supplier'), async (req, res) => {
  const input = c.zSubmitDocInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const ctx = await callerContext(req.userId);
  if (!ctx) throw new HttpError(401, { error: 'auth_required' });
  if (ctx.supplierId == null) throw new HttpError(403, { error: 'forbidden', details: 'No supplier profile.' });

  const { docType, fileKey, note } = input.data;

  const [existing] = await db
    .select({ id: supplierDocs.id })
    .from(supplierDocs)
    .where(and(eq(supplierDocs.supplierId, ctx.supplierId), eq(supplierDocs.docType, docType)))
    .limit(1);

  let docId: number;
  if (existing) {
    const [updated] = await db
      .update(supplierDocs)
      .set({
        status: 'submitted',
        fileKey: fileKey ?? null,
        note: note ?? null,
        reviewedBy: null,
        reviewedAt: null,
      })
      .where(and(eq(supplierDocs.id, existing.id), eq(supplierDocs.supplierId, ctx.supplierId)))
      .returning({ id: supplierDocs.id });
    docId = Number(updated?.id);
  } else {
    const [inserted] = await db
      .insert(supplierDocs)
      .values({
        supplierId: ctx.supplierId,
        docType,
        status: 'submitted',
        fileKey: fileKey ?? null,
        note: note ?? null,
      })
      .returning({ id: supplierDocs.id });
    docId = Number(inserted?.id);
  }

  const [row] = await db.select().from(supplierDocs).where(eq(supplierDocs.id, docId)).limit(1);
  res.status(existing ? 200 : 201);
  respond(res, c.zSupplierDoc, mapSupplierDoc(row));
});
