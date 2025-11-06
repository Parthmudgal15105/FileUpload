import { Router } from 'express';
import * as fileController from '../controllers/file.controller';

const router = Router();

// File management routes
router.get('/uploads', fileController.listUploads);
router.get('/download/:uploadId', fileController.downloadFile);
router.delete('/upload/:uploadId', fileController.deleteUpload);

export default router;
