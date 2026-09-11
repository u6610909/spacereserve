import type { RequestHandler } from 'express';

import * as adminService from './admin.service';
import type { AuditLogQuery, CreatePeerIntegrationInput, IssuePeerKeyInput, ReservationSearchQuery } from './admin.schema';

export const auditLogs: RequestHandler = async (req, res, next) => {
  try {
    const { limit } = req.query as unknown as AuditLogQuery;
    const logs = await adminService.listAuditLogs(limit);
    res.status(200).json({ auditLogs: logs });
  } catch (err) {
    next(err);
  }
};

export const utilization: RequestHandler = async (_req, res, next) => {
  try {
    const stats = await adminService.getUtilizationStats();
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
};

export const overview: RequestHandler = async (_req, res, next) => {
  try {
    const stats = await adminService.getSystemOverview();
    res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
};

export const issuePeerKey: RequestHandler = async (req, res, next) => {
  try {
    const { name } = req.body as IssuePeerKeyInput;
    const issued = await adminService.issuePeerApiKey(name);
    res.status(201).json(issued);
  } catch (err) {
    next(err);
  }
};

export const deletePeerKey: RequestHandler = async (req, res, next) => {
  try {
    await adminService.deletePeerApiKey(req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const listPeerIntegrations: RequestHandler = async (_req, res, next) => {
  try {
    const peerIntegrations = await adminService.listPeerIntegrations();
    res.status(200).json({ peerIntegrations });
  } catch (err) {
    next(err);
  }
};

export const revealPeerIntegrationKey: RequestHandler = async (req, res, next) => {
  try {
    const apiKey = await adminService.revealPeerIntegrationKey(req.params.id as string);
    res.status(200).json({ apiKey });
  } catch (err) {
    next(err);
  }
};

export const createPeerIntegration: RequestHandler = async (req, res, next) => {
  try {
    const peerIntegration = await adminService.createPeerIntegration(req.body as CreatePeerIntegrationInput);
    res.status(201).json({ peerIntegration });
  } catch (err) {
    next(err);
  }
};

export const deletePeerIntegration: RequestHandler = async (req, res, next) => {
  try {
    await adminService.deletePeerIntegration(req.params.id as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const searchReservations: RequestHandler = async (req, res, next) => {
  try {
    const query = req.query as unknown as ReservationSearchQuery;
    const reservations = await adminService.searchReservations(query);
    res.status(200).json({ reservations });
  } catch (err) {
    next(err);
  }
};
