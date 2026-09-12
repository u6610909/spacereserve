import { RoomStatus } from '@prisma/client';
import { z } from 'zod';

export const roomIdParamSchema = z.object({ id: z.string().uuid() });

export const createRoomSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  building: z.string().min(1),
  capacity: z.number().int().positive(),
  amenities: z.array(z.string().min(1)).default([]),
  status: z.nativeEnum(RoomStatus).default(RoomStatus.AVAILABLE),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = createRoomSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

/** `outOfOrderUntil` only means anything alongside status: OUT_OF_ORDER — an
 * expected return date so bookings on/after it aren't blocked too. Omitted
 * (or explicitly null) means "unknown when it's back", blocking every date,
 * same as before this field existed. Ignored when setting AVAILABLE — the
 * service always clears it there regardless of what's sent. */
export const roomStatusSchema = z.object({
  status: z.nativeEnum(RoomStatus),
  outOfOrderUntil: z.coerce.date().nullable().optional(),
});

/** Query strings arrive as strings — coerce/split before the service sees them. */
export const listRoomsQuerySchema = z
  .object({
    capacity: z.coerce.number().int().positive().optional(),
    building: z.string().min(1).optional(),
    amenities: z
      .string()
      .min(1)
      .optional()
      .transform((v) => (v ? v.split(',').map((a) => a.trim()).filter(Boolean) : undefined)),
    availableFrom: z.coerce.date().optional(),
    availableTo: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.availableFrom) !== Boolean(data.availableTo)) {
      ctx.addIssue({
        code: 'custom',
        message: 'availableFrom and availableTo must be provided together',
        path: ['availableFrom'],
      });
    }
    if (data.availableFrom && data.availableTo && data.availableFrom >= data.availableTo) {
      ctx.addIssue({ code: 'custom', message: 'availableFrom must be before availableTo', path: ['availableTo'] });
    }
  });

export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

/** Shared by /rooms/availability (all rooms) and /rooms/:id/schedule (one
 * room) — both default to "today" in Asia/Bangkok when omitted. */
export const roomDateQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
});

export type RoomDateQuery = z.infer<typeof roomDateQuerySchema>;
