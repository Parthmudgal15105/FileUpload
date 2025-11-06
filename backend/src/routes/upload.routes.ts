import { Router } from 'express';
import multer from 'multer';
import { getChunksDir } from '../utils/fileUtils';
import { rateLimit } from '../middleware/rateLimit';
import * as uploadController from '../controllers/upload.controller';

const router = Router();

// Configure multer for chunk uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getChunksDir());
  },
  filename: (req, file, cb) => {
    const uploadId = req.body.uploadId;
    const chunkIndex = req.body.chunkIndex;
    cb(null, `${uploadId}_chunk_${chunkIndex}`);
  }
});

const upload = multer({ storage });

// Upload routes
router.post('/init', rateLimit, uploadController.initUpload);
router.post('/chunk', upload.single('chunk'), uploadController.uploadChunk);
router.get('/status/:uploadId', uploadController.getUploadStatus);
router.get('/resume/:uploadId', uploadController.getResumeInfo);
router.post('/resume', uploadController.resumeUpload);

export default router;
