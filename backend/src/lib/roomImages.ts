import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { config } from '../config';

/**
 * Room photos live on disk under a volume-mounted directory (see
 * docker-compose*.yml — `uploads:/app/uploads`), never inside the image
 * itself, so they survive a redeploy. Served statically at
 * ROOM_IMAGES_URL_PREFIX (see app.ts) rather than through Prisma/base64 —
 * images are exactly the kind of blob a database shouldn't hold.
 *
 * Test mode gets its own subdirectory. Found out why the hard way: the test
 * suite's cleanup step deletes the whole room-images directory, and without
 * this split it's the SAME directory the dev server writes to (both resolve
 * `process.cwd()` to `backend/`) — running `npm test` while a real photo was
 * sitting there deleted it. Nested under UPLOADS_ROOT rather than a sibling
 * so the existing `uploads/` .gitignore entry still covers it.
 */
export const UPLOADS_ROOT = path.join(process.cwd(), 'uploads');
export const ROOM_IMAGES_DIR = path.join(UPLOADS_ROOT, config.isTest ? 'test-rooms' : 'rooms');
export const ROOM_IMAGES_URL_PREFIX = `/spacereserve/uploads/${config.isTest ? 'test-rooms' : 'rooms'}`;

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function ensureRoomImagesDir(): void {
  if (!existsSync(ROOM_IMAGES_DIR)) mkdirSync(ROOM_IMAGES_DIR, { recursive: true });
}

export function isAllowedImageMime(mime: string): mime is keyof typeof ALLOWED_MIME_TO_EXT {
  return mime in ALLOWED_MIME_TO_EXT;
}

/** Random filename, never the client's — sidesteps path traversal and collisions entirely. */
export function roomImageFilename(mime: string): string {
  const ext = ALLOWED_MIME_TO_EXT[mime] ?? 'bin';
  return `${randomUUID()}.${ext}`;
}

export function roomImagePublicUrl(filename: string): string {
  return `${ROOM_IMAGES_URL_PREFIX}/${filename}`;
}

/**
 * Deletes a room's stored image file given its public URL. `path.basename`
 * strips any directory component before touching the filesystem, so a
 * doctored `imageUrl` can't be used to delete something outside the room
 * images directory. Best-effort — a failed cleanup is a disk-space nit, not
 * worth failing the request over.
 */
export function deleteRoomImageFile(imageUrl: string | null | undefined): void {
  if (!imageUrl) return;
  const filePath = path.join(ROOM_IMAGES_DIR, path.basename(imageUrl));
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch {
      // best-effort — see doc comment above
    }
  }
}
