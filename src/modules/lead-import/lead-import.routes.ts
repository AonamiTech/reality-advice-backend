import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { ValidationError } from '../../utils/errors';
import { MAX_IMPORT_BYTES } from './lead-import.parser';
import * as c from './lead-import.controller';

const parseFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
}).single('file');

const uploadMiddleware: RequestHandler = (req, res, next) => {
  parseFile(req, res, (error) => {
    if (!error) return next();
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 'File must be at most 10 MB' : error.message;
    next(new ValidationError([{ field: 'file', message }]));
  });
};

export const leadImportRouter = Router();
leadImportRouter.post('/', uploadMiddleware, c.preview);
leadImportRouter.get('/:id', c.get);
leadImportRouter.post('/:id/confirm', c.confirm);
