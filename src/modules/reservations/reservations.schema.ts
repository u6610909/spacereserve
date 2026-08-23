import { z } from 'zod';

export const reservationIdParamSchema = z.object({ id: z.string().uuid() });

export const attendeeParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createReservationSchema = z.object({
  roomId: z.string().uuid(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  purpose: z.string().min(1).optional(),
  attendeeIds: z.array(z.string().uuid()).default([]),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const addAttendeeSchema = z.object({ userId: z.string().uuid() });

export type AddAttendeeInput = z.infer<typeof addAttendeeSchema>;
