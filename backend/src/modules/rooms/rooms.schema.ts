import { RoomStatus } from '@prisma/client';
import { z } from 'zod';

export const roomIdParamSchema = z.object({ id: z.string().uuid() });

export const createRoomSchema = z.object({
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

export const roomStatusSchema = z.object({ status: z.nativeEnum(RoomStatus) });

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
