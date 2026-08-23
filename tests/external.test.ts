import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashApiKey } from '../src/lib/apiKey';
import { config } from '../src/config';
import { disconnectPrisma, getPrisma } from '../src/lib/prisma';

import { buildTestApp, resetDb } from './helpers/testApp';

import type { Express } from 'express';

let app: Express;

const RAW_KEY = 'test-finderai-raw-key-0123456789';

beforeAll(async () => {
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  await getPrisma().apiKey.create({ data: { name: 'FinderAI', keyHash: hashApiKey(RAW_KEY) } });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('GET /external/bookings/active-at', () => {
  it('rejects a missing API key', async () => {
    const res = await request(app).get(`${config.basePath}/external/bookings/active-at?room=X&at=2026-01-01T00:00:00Z`);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid API key', async () => {
    const res = await request(app)
      .get(`${config.basePath}/external/bookings/active-at?room=X&at=2026-01-01T00:00:00Z`)
      .set('x-api-key', 'not-the-right-key');
    expect(res.status).toBe(401);
  });

  it('returns reservation: null for an unknown room', async () => {
    const res = await request(app)
      .get(`${config.basePath}/external/bookings/active-at?room=Nowhere&at=2026-01-01T00:00:00Z`)
      .set('x-api-key', RAW_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ room: 'Nowhere', reservation: null });
  });

  it('returns the minimum reservation info when the room is booked at that instant', async () => {
    const room = await getPrisma().room.create({ data: { name: 'Library Room 4B', building: 'LIB', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'external-test-organizer', email: 'organizer@external.test', name: 'Organizer Name' },
    });
    const start = new Date('2026-01-01T14:00:00Z');
    const end = new Date('2026-01-01T15:00:00Z');
    await getPrisma().reservation.create({
      data: { roomId: room.id, organizerId: organizer.id, startTime: start, endTime: end },
    });

    const res = await request(app)
      .get(`${config.basePath}/external/bookings/active-at?room=${encodeURIComponent('Library Room 4B')}&at=2026-01-01T14:30:00Z`)
      .set('x-api-key', RAW_KEY);

    expect(res.status).toBe(200);
    expect(res.body.reservation).toMatchObject({
      organizer: { name: 'Organizer Name', email: 'organizer@external.test' },
      attendeeCount: 0,
    });
  });

  it('returns reservation: null when the room is free at that instant', async () => {
    const room = await getPrisma().room.create({ data: { name: 'Free Room', building: 'LIB', capacity: 4 } });
    const organizer = await getPrisma().user.create({
      data: { adObjectId: 'external-test-organizer-2', email: 'organizer2@external.test', name: 'Organizer Two' },
    });
    await getPrisma().reservation.create({
      data: {
        roomId: room.id,
        organizerId: organizer.id,
        startTime: new Date('2026-01-01T14:00:00Z'),
        endTime: new Date('2026-01-01T15:00:00Z'),
      },
    });

    const res = await request(app)
      .get(`${config.basePath}/external/bookings/active-at?room=${encodeURIComponent('Free Room')}&at=2026-01-01T16:00:00Z`)
      .set('x-api-key', RAW_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reservation: null });
  });
});
