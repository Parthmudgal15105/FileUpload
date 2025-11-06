import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import { getDatabase } from '../database/db';
import { getUploadsDir } from '../utils/fileUtils';
import { Upload, Chunk } from '../database/models';

export async function listUploads(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const uploads = await db.all<Upload[]>('SELECT * FROM uploads ORDER BY created_at DESC');
    
    const uploadsWithProgress = uploads.map((upload) => {
      const receivedChunks = JSON.parse(upload.received_chunks || '[]');
      return {
        id: upload.id,
        filename: upload.filename,
        status: upload.status,
        progress: Math.round((receivedChunks.length / upload.total_chunks) * 100),
        totalChunks: upload.total_chunks,
        uploadedChunks: receivedChunks.length,
        fileSize: upload.file_size || 0,
        createdAt: upload.created_at,
        completedAt: upload.completed_at
      };
    });

    res.json(uploadsWithProgress);
  } catch (error) {
    console.error('❌ Error listing uploads:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
}

export async function downloadFile(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId } = req.params;
    
    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }

    if (upload.status !== 'completed') {
      res.status(400).json({ 
        error: 'File not ready for download',
        status: upload.status 
      });
      return;
    }

    const filePath = path.join(getUploadsDir(), upload.filename);
    
    if (!await fs.pathExists(filePath)) {
      res.status(404).json({ error: 'File not found on server' });
      return;
    }

    console.log(`📥 Download started: ${upload.filename}`);

    res.setHeader('Content-Disposition', `attachment; filename="${upload.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', upload.file_size.toString());
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('❌ Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });

    fileStream.on('end', () => {
      console.log(`✅ Download completed: ${upload.filename}`);
    });

  } catch (error) {
    console.error('❌ Error downloading file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  }
}

export async function deleteUpload(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId } = req.params;
    
    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }

    // Delete associated chunks
    const chunks = await db.all<Chunk[]>('SELECT * FROM chunks WHERE upload_id = ?', [uploadId]);
    
    for (const chunk of chunks) {
      await fs.remove(chunk.file_path).catch(err => 
        console.warn(`⚠️ Failed to delete chunk: ${chunk.file_path}`, err)
      );
    }

    // Delete final file if it exists
    const finalFilePath = path.join(getUploadsDir(), upload.filename);
    if (await fs.pathExists(finalFilePath)) {
      await fs.remove(finalFilePath);
    }

    // Delete from database
    await db.run('DELETE FROM chunks WHERE upload_id = ?', [uploadId]);
    await db.run('DELETE FROM uploads WHERE id = ?', [uploadId]);

    console.log(`🗑️ Upload deleted: ${uploadId} - ${upload.filename}`);

    res.json({ 
      success: true, 
      message: 'Upload deleted successfully',
      filename: upload.filename
    });
  } catch (error) {
    console.error('❌ Error deleting upload:', error);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
}
