import multer from 'multer';

import { BadRequestError } from '../../lib/errors';
import { ROOM_IMAGES_DIR, ensureRoomImagesDir, isAllowedImageMime, roomImageFilename } from '../../lib/roomImages';

import type { RequestHandler } from 'express';

ensureRoomImagesDir();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const UNSUPPORTED_TYPE = 'UNSUPPORTED_IMAGE_TYPE';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ROOM_IMAGES_DIR),
  filename: (_req, file, cb) => cb(null, roomImageFilename(file.mimetype)),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedImageMime(file.mimetype)) {
      cb(new Error(UNSUPPORTED_TYPE));
      return;
    }
    cb(null, true);
  },
}).single('image');

/**
 * Multer's own middleware signature is callback-style, not the throw/next
 * pattern the rest of the app uses — this adapts its errors into the usual
 * AppError shape so a bad upload gets the same structured JSON error
 * response as everything else, not Express's default HTML error page.
 */
export const uploadRoomImage: RequestHandler = (req, res, next) => {
  upload(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new BadRequestError('Image must be 5MB or smaller'));
      return;
    }
    if (err instanceof Error && err.message === UNSUPPORTED_TYPE) {
      next(new BadRequestError('Image must be JPEG, PNG, or WebP'));
      return;
    }
    next(err);
  });
};
