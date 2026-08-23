import type { RequestHandler } from 'express';

import * as reservationsService from './reservations.service';
import type { AddAttendeeInput, CreateReservationInput } from './reservations.schema';

export const create: RequestHandler = async (req, res, next) => {
  try {
    const reservation = await reservationsService.createReservation(req.user!.id, req.body as CreateReservationInput);
    res.status(201).json({ reservation });
  } catch (err) {
    next(err);
  }
};

export const listMine: RequestHandler = async (req, res, next) => {
  try {
    const reservations = await reservationsService.listMine(req.user!.id);
    res.status(200).json({ reservations });
  } catch (err) {
    next(err);
  }
};

export const getById: RequestHandler = async (req, res, next) => {
  try {
    const reservation = await reservationsService.getReservationById(
      req.params.id as string,
      req.user!.id,
      req.user!.role,
    );
    res.status(200).json({ reservation });
  } catch (err) {
    next(err);
  }
};

export const cancel: RequestHandler = async (req, res, next) => {
  try {
    await reservationsService.cancelReservation(req.user!.id, req.user!.role, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const override: RequestHandler = async (req, res, next) => {
  try {
    const reservation = await reservationsService.overrideReservation(req.user!.id, req.params.id as string);
    res.status(200).json({ reservation });
  } catch (err) {
    next(err);
  }
};

export const addAttendee: RequestHandler = async (req, res, next) => {
  try {
    const { userId } = req.body as AddAttendeeInput;
    await reservationsService.addAttendee(req.user!.id, req.params.id as string, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const removeAttendee: RequestHandler = async (req, res, next) => {
  try {
    await reservationsService.removeAttendee(req.user!.id, req.params.id as string, req.params.userId as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const checkIn: RequestHandler = async (req, res, next) => {
  try {
    const result = await reservationsService.checkIn(req.user!.id, req.params.id as string);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
