import type { RequestHandler } from 'express';

import * as adminService from './admin.service';
import type { AuditLogQuery } from './admin.schema';

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
