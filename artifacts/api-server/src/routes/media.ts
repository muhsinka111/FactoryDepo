/**
 * routes/media.ts — durable image uploads (migration 022) and their public read.
 *
 * Why the bytes live in Postgres: the API runs as one Railway container whose
 * filesystem is reset on every deploy, so a file written to disk disappears with
 * the next release (and a second replica would serve 404s for it anyway). A
 * `media` row survives both. The trade-off is deliberate — this is a gallery of
 * listing photos capped at 2 MB each, not a CDN.
 *
 *  - POST /api/media      : any signed-in caller uploads ONE image. Bytes travel
 *                           base64 in JSON (no multipart dependency). The route
 *                           enforces an image/* allow-list and a 2 MB decoded
 *                           size cap, and refuses an empty decode.
 *  - GET  /api/media/:id  : PUBLIC — streams the stored bytes with the stored
 *                           content type and an immutable cache header, so a
 *                           listing photo is fetched once per browser.
 *
 * The file is content-addressed only by id: nothing here accepts a caller-named
 * path, so an upload can never overwrite another file or escape a directory.
 */
import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import * as c from '@workspace/api-zod';
// The media tables are re-exported by the schema package. `src/db.ts` (the
// usual seam) is not one of this task's files, so the table is imported from
// the schema package directly rather than adding a re-export there.
import { media } from '@workspace/db';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError, parseId, respond, toNum } from '../http.js';

export const mediaRouter = Router();

/** Decoded-bytes cap for one upload (2 MB). Base64 inflates ~4/3, so the JSON
 *  body limit for this route is raised in index.ts to let the cap be reached. */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Per-account upload ceiling. Cheap to enforce (one COUNT) and it bounds how
 * much a single account can write into the database — an upload has no other
 * quota, and a stuck client retrying in a loop would otherwise grow the table
 * without limit. Detaching a photo from a listing does not refund the quota:
 * the row still exists for reuse (see the detach route in products.ts).
 */
export const MEDIA_MAX_PER_USER = 50;

/** Content types this route stores: images only, so a listing photo can be
 *  rendered by a browser and an HTML/script payload can never be served. */
const CONTENT_TYPE_PREFIX = 'image/';

/**
 * The public shape of one stored media row. The URL is built here and nowhere
 * else, so the gallery, the shop logo and the upload response all point at the
 * same endpoint.
 */
export function mediaRef(m: Record<string, unknown>): c.MediaRef {
  const id = toNum(m.id);
  return {
    id,
    filename: String(m.filename ?? ''),
    contentType: String(m.contentType ?? 'application/octet-stream'),
    sizeBytes: toNum(m.sizeBytes),
    url: `/api/media/${id}`,
  };
}

/** Columns of `media` that never include the bytes (list/attach responses). */
export const mediaColumnsNoBytes = {
  id: media.id,
  ownerUserId: media.ownerUserId,
  filename: media.filename,
  contentType: media.contentType,
  sizeBytes: media.sizeBytes,
};

/**
 * Decode a base64 upload body. A leading `data:image/png;base64,` prefix is
 * tolerated (some clients paste the whole data URL) and whitespace is stripped;
 * anything that is not base64 → null, so the caller can 400 it instead of
 * storing whatever Buffer.from() silently salvaged.
 *
 * An empty string / a decode that yields no bytes also returns an empty buffer,
 * which the route rejects as `invalid_image`.
 */
export function decodeBase64(raw: string): Buffer | null {
  const comma = raw.indexOf(',');
  const payload = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
  const cleaned = payload.replace(/\s+/g, '');
  if (!cleaned) return Buffer.alloc(0);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  return Buffer.from(cleaned, 'base64');
}

/**
 * POST /api/media — upload one image, get back {id, url}.
 *
 * Ownership is the token's user: the row is stamped with `ownerUserId = caller`,
 * and only that account (or an admin) may later attach the photo to a listing.
 * `ownerUserId` is never read from the body.
 */
mediaRouter.post('/', requireAuth, async (req, res) => {
  const input = c.zCreateMediaInput.safeParse(req.body ?? {});
  if (!input.success) {
    throw new HttpError(400, { error: 'validation_error', details: input.error.message });
  }
  const uid = req.userId;
  if (uid == null) throw new HttpError(401, { error: 'auth_required' });

  const contentType = input.data.contentType.trim().toLowerCase();
  if (!contentType.startsWith(CONTENT_TYPE_PREFIX)) {
    throw new HttpError(415, {
      error: 'unsupported_media_type',
      details: `Only ${CONTENT_TYPE_PREFIX}* uploads are stored (got "${input.data.contentType}").`,
    });
  }

  const bytes = decodeBase64(input.data.dataBase64);
  if (!bytes) {
    throw new HttpError(400, { error: 'invalid_image', details: 'dataBase64 is not valid base64.' });
  }
  if (bytes.length === 0) {
    throw new HttpError(400, { error: 'invalid_image', details: 'dataBase64 decoded to zero bytes.' });
  }
  if (bytes.length > MEDIA_MAX_BYTES) {
    throw new HttpError(413, {
      error: 'payload_too_large',
      details: `Decoded image is ${bytes.length} bytes; the cap is ${MEDIA_MAX_BYTES}.`,
    });
  }

  const [countRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(media)
    .where(eq(media.ownerUserId, uid));
  if (toNum(countRow?.n) >= MEDIA_MAX_PER_USER) {
    throw new HttpError(429, {
      error: 'media_limit_reached',
      details: `An account may store at most ${MEDIA_MAX_PER_USER} uploads.`,
    });
  }

  const [row] = await db
    .insert(media)
    .values({
      ownerUserId: uid,
      filename: input.data.filename,
      contentType,
      sizeBytes: bytes.length,
      bytes,
    })
    .returning(mediaColumnsNoBytes);

  res.status(201);
  respond(res, c.zMediaRef, mediaRef(row));
});

/**
 * GET /api/media/:id — PUBLIC. Streams the stored bytes with their own content
 * type. A photo is immutable once uploaded (an edit is a new upload), so it is
 * safe to cache hard: one year, immutable.
 *
 * An unknown id is a JSON 404 (same `{error:'not_found'}` shape as every other
 * route) — never an empty 200, which an <img> tag would render as a broken
 * image with no signal in the logs.
 */
mediaRouter.get('/:id', async (req, res) => {
  const id = parseId(req);
  const [row] = await db
    .select({
      contentType: media.contentType,
      filename: media.filename,
      bytes: media.bytes,
    })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, { error: 'not_found' });

  const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes ?? []);
  // filename is user-supplied: strip quotes/control chars so it can never break
  // out of the header value it is embedded in.
  const safeName = String(row.filename ?? 'upload').replace(/["\\\r\n]/g, '');
  res.setHeader('Content-Type', String(row.contentType || 'application/octet-stream'));
  res.setHeader('Content-Length', String(bytes.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
  res.end(bytes);
});

export type MediaRef = c.MediaRef;
