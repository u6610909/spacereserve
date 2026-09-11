import type { RequestHandler } from 'express';

import { BadRequestError } from '../../lib/errors';

import * as roomsService from './rooms.service';
import type { CreateRoomInput, ListRoomsQuery, UpdateRoomInput } from './rooms.schema';
import type { RoomStatus } from '@prisma/client';

export const list: RequestHandler = async (req, res, next) => {
  try {
    const rooms = await roomsService.listRooms(req.query as unknown as ListRoomsQuery);
    res.status(200).json({ rooms });
  } catch (err) {
    next(err);
  }
};

export const getById: RequestHandler = async (req, res, next) => {
  try {
    const room = await roomsService.getRoomById(req.params.id as string);
    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    const room = await roomsService.createRoom(req.user!.id, req.body as CreateRoomInput);
    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
};

export const update: RequestHandler = async (req, res, next) => {
  try {
    const room = await roomsService.updateRoom(req.user!.id, req.params.id as string, req.body as UpdateRoomInput);
    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
};

export const setStatus: RequestHandler = async (req, res, next) => {
  try {
    const { status } = req.body as { status: RoomStatus };
    const room = await roomsService.setRoomStatus(req.user!.id, req.params.id as string, status);
    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
};

export const remove: RequestHandler = async (req, res, next) => {
  try {
    await roomsService.deleteRoom(req.user!.id, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const setImage: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new BadRequestError('No image file provided (field name "image")');
    const room = await roomsService.setRoomImage(req.user!.id, req.params.id as string, req.file);
    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
};

export const removeImage: RequestHandler = async (req, res, next) => {
  try {
    const room = await roomsService.removeRoomImage(req.user!.id, req.params.id as string);
    res.status(200).json({ room });
  } catch (err) {
    next(err);
  }
};

export const availability: RequestHandler = async (req, res, next) => {
  try {
    const { date } = req.query as { date?: string };
    const result = await roomsService.getRoomsAvailability(date);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const schedule: RequestHandler = async (req, res, next) => {
  try {
    const { date } = req.query as { date?: string };
    const result = await roomsService.getRoomSchedule(req.params.id as string, date);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
