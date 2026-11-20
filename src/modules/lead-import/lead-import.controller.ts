import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../utils/errors';
import { parse } from '../../utils/validate';
import { idParam } from '../leads/lead.validation';
import * as service from './lead-import.service';

const currentAdmin = (req: Request) => {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
};

const id = (req: Request) => parse(idParam, req.params).id;

export async function preview(req: Request, res: Response) {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'Validation failed', errors: [{ field: 'file', message: 'CSV or XLSX file is required' }] });
    return;
  }
  res.status(201).json(await service.preview({ buffer: req.file.buffer, filename: req.file.originalname, mimeType: req.file.mimetype }, currentAdmin(req)));
}

export async function get(req: Request, res: Response) {
  res.json(await service.getImport(id(req)));
}

export async function confirm(req: Request, res: Response) {
  res.json(await service.confirm(id(req), currentAdmin(req)));
}
