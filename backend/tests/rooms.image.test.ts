import { existsSync, readdirSync, rmSync } from 'node:fs';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';
import { ROOM_IMAGES_DIR, ROOM_IMAGES_URL_PREFIX } from '../src/lib/roomImages';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

// Smallest possible valid PNG (1x1, transparent) — real bytes, not a stub,
// so multer's fileFilter/diskStorage genuinely writes and serves it.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let app: Express;
let staffToken: string;
let roomId: string;

async function loginAs(email: string, role: 'STUDENT' | 'STAFF'): Promise<string> {
  const res = await request(app).post(`${config.basePath}/auth/dev-login`).send({ email, role });
  return (res.body as { token: string }).token;
}

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  staffToken = await loginAs('staff@rooms-image.test', 'STAFF');
  const room = await getPrisma().room.create({ data: { name: 'Image Room', building: 'B', capacity: 4 } });
  roomId = room.id;
});

afterAll(async () => {
  await disconnectPrisma();
  // Cleans up whatever this file wrote to disk — a dev-only side effect,
  // safe since this directory holds nothing but disposable test uploads.
  if (existsSync(ROOM_IMAGES_DIR)) rmSync(ROOM_IMAGES_DIR, { recursive: true, force: true });
});

describe('POST /rooms/:id/image', () => {
  it('uploads an image and sets the room imageUrl', async () => {
    const res = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'room.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.room.imageUrl).toMatch(new RegExp(`^${ROOM_IMAGES_URL_PREFIX}/.+\\.png$`));

    const filename = res.body.room.imageUrl.split('/').pop() as string;
    expect(readdirSync(ROOM_IMAGES_DIR)).toContain(filename);
  });

  it('serves the uploaded file back over HTTP', async () => {
    const upload = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'room.png', contentType: 'image/png' });

    const res = await request(app).get(upload.body.room.imageUrl as string);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('replaces the old file when uploaded again', async () => {
    const first = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'a.png', contentType: 'image/png' });
    const firstFilename = (first.body.room.imageUrl as string).split('/').pop() as string;

    const second = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'b.png', contentType: 'image/png' });

    expect(second.status).toBe(200);
    expect(readdirSync(ROOM_IMAGES_DIR)).not.toContain(firstFilename);
  });

  it('rejects a non-image file', async () => {
    const res = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('rejects a file over 5MB', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', big, { filename: 'huge.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  it('rejects STUDENT', async () => {
    const studentToken = await loginAs('student@rooms-image.test', 'STUDENT');
    const res = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${studentToken}`)
      .attach('image', TINY_PNG, { filename: 'room.png', contentType: 'image/png' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /rooms/:id/image', () => {
  it('clears imageUrl and removes the file', async () => {
    const upload = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'room.png', contentType: 'image/png' });
    const filename = (upload.body.room.imageUrl as string).split('/').pop() as string;

    const res = await request(app)
      .delete(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.room.imageUrl).toBeNull();
    expect(readdirSync(ROOM_IMAGES_DIR)).not.toContain(filename);
  });
});

describe('DELETE /rooms/:id', () => {
  it('cleans up the room image file when the room itself is deleted', async () => {
    const upload = await request(app)
      .post(`${config.basePath}/rooms/${roomId}/image`)
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('image', TINY_PNG, { filename: 'room.png', contentType: 'image/png' });
    const filename = (upload.body.room.imageUrl as string).split('/').pop() as string;

    const res = await request(app)
      .delete(`${config.basePath}/rooms/${roomId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(204);
    expect(readdirSync(ROOM_IMAGES_DIR)).not.toContain(filename);
  });
});
