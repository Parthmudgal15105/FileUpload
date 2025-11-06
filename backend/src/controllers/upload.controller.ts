import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import { getDatabase } from '../database/db';
import { CONFIG } from '../config/constants';
import { sanitizeFilename, isValidFileType, getUploadsDir, getChunksDir } from '../utils/fileUtils';
import { calculateHash, calculateChunkHash } from '../utils/hashUtils';
import { Upload, Chunk } from '../database/models';

export async function initUpload(req: Request, res: Response): Promise<void> {
  try {
    const { filename, totalChunks, fileSize } = req.body;
    
    if (!filename || !totalChunks || !fileSize) {
      res.status(400).json({ error: 'Missing required fields: filename, totalChunks, fileSize' });
      return;
    }

    if (fileSize > CONFIG.MAX_FILE_SIZE) {
      res.status(400).json({ 
        error: `File size exceeds maximum allowed size of ${CONFIG.MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB` 
      });
      return;
    }

    if (!isValidFileType(filename)) {
      res.status(400).json({ 
        error: 'File type not allowed',
        allowedTypes: CONFIG.ALLOWED_EXTENSIONS 
      });
      return;
    }

    const sanitizedFilename = sanitizeFilename(filename);
    const uploadId = uuidv4();
    
    const db = getDatabase();
    await db.run(
      'INSERT INTO uploads (id, filename, total_chunks, file_size) VALUES (?, ?, ?, ?)',
      [uploadId, sanitizedFilename, totalChunks, fileSize]
    );

    console.log(`📤 Upload initialized: ${uploadId} - ${sanitizedFilename}`);

    res.json({
      uploadId,
      filename: sanitizedFilename,
      message: 'Upload session initialized',
      resumeFrom: 0
    });
  } catch (error) {
    console.error('❌ Error initializing upload:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
}

export async function uploadChunk(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId, chunkIndex, chunkHash } = req.body;
    const file = req.file;

    if (!file || !uploadId || chunkIndex === undefined) {
      res.status(400).json({ error: 'Missing required fields: chunk, uploadId, chunkIndex' });
      return;
    }

    if (file.size > CONFIG.MAX_CHUNK_SIZE) {
      await fs.remove(file.path);
      res.status(400).json({ 
        error: `Chunk size exceeds maximum allowed size of ${CONFIG.MAX_CHUNK_SIZE / (1024 * 1024)}MB` 
      });
      return;
    }

    const fileBuffer = await fs.readFile(file.path);
    const calculatedHash = calculateChunkHash(fileBuffer);
    
    if (chunkHash && calculatedHash !== chunkHash) {
      await fs.remove(file.path);
      res.status(400).json({ error: 'Chunk integrity check failed. Hash mismatch.' });
      return;
    }

    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      await fs.remove(file.path);
      res.status(404).json({ error: 'Upload session not found' });
      return;
    }

    await db.run(
      'INSERT OR REPLACE INTO chunks (upload_id, chunk_index, chunk_hash, file_path) VALUES (?, ?, ?, ?)',
      [uploadId, parseInt(chunkIndex), calculatedHash, file.path]
    );

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    if (!receivedChunks.includes(parseInt(chunkIndex))) {
      receivedChunks.push(parseInt(chunkIndex));
      receivedChunks.sort((a: number, b: number) => a - b);
    }

    await db.run(
      'UPDATE uploads SET received_chunks = ? WHERE id = ?',
      [JSON.stringify(receivedChunks), uploadId]
    );

    const progress = Math.round((receivedChunks.length / upload.total_chunks) * 100);
    console.log(`📦 Chunk ${chunkIndex}/${upload.total_chunks} received for ${uploadId} (${progress}%)`);

    res.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      receivedChunks: receivedChunks.length,
      totalChunks: upload.total_chunks,
      progress
    });

    if (receivedChunks.length === upload.total_chunks) {
      console.log(`✅ All chunks received for ${uploadId}. Starting merge...`);
      mergeChunks(uploadId).catch(err => 
        console.error('❌ Error in background merge:', err)
      );
    }
  } catch (error) {
    console.error('❌ Error uploading chunk:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
}

export async function getUploadStatus(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId } = req.params;
    
    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    
    res.json({
      uploadId,
      filename: upload.filename,
      status: upload.status,
      progress: {
        received: receivedChunks.length,
        total: upload.total_chunks,
        percentage: Math.round((receivedChunks.length / upload.total_chunks) * 100)
      },
      receivedChunks,
      fileHash: upload.file_hash,
      fileSize: upload.file_size,
      createdAt: upload.created_at,
      completedAt: upload.completed_at
    });
  } catch (error) {
    console.error('❌ Error getting upload status:', error);
    res.status(500).json({ error: 'Failed to get upload status' });
  }
}

export async function getResumeInfo(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId } = req.params;
    
    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    const missingChunks = [];
    
    for (let i = 0; i < upload.total_chunks; i++) {
      if (!receivedChunks.includes(i)) {
        missingChunks.push(i);
      }
    }

    console.log(`📋 Resume info for ${uploadId}: ${missingChunks.length} chunks missing`);

    res.json({
      uploadId,
      filename: upload.filename,
      status: upload.status,
      missingChunks,
      receivedChunks: receivedChunks.length,
      totalChunks: upload.total_chunks,
      resumeFrom: missingChunks.length > 0 ? missingChunks[0] : upload.total_chunks
    });
  } catch (error) {
    console.error('❌ Error getting resume info:', error);
    res.status(500).json({ error: 'Failed to get resume info' });
  }
}

export async function resumeUpload(req: Request, res: Response): Promise<void> {
  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      res.status(400).json({ error: 'Upload ID is required' });
      return;
    }

    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }

    if (upload.status === 'failed' || upload.status === 'paused') {
      await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['uploading', uploadId]);
      console.log(`🔄 Upload resumed: ${uploadId}`);
    }

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    const missingChunks = [];
    
    for (let i = 0; i < upload.total_chunks; i++) {
      if (!receivedChunks.includes(i)) {
        missingChunks.push(i);
      }
    }

    res.json({
      success: true,
      uploadId,
      filename: upload.filename,
      missingChunks,
      receivedChunks: receivedChunks.length,
      totalChunks: upload.total_chunks,
      resumeFrom: missingChunks.length > 0 ? missingChunks[0] : upload.total_chunks,
      message: 'Upload resumed successfully'
    });
  } catch (error) {
    console.error('❌ Error resuming upload:', error);
    res.status(500).json({ error: 'Failed to resume upload' });
  }
}

async function mergeChunks(uploadId: string): Promise<void> {
  try {
    console.log(`🔄 Starting merge process for upload: ${uploadId}`);
    
    const db = getDatabase();
    const upload = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      throw new Error('Upload not found');
    }

    const chunks = await db.all<Chunk[]>(
      'SELECT * FROM chunks WHERE upload_id = ? ORDER BY chunk_index ASC',
      [uploadId]
    );

    if (chunks.length !== upload.total_chunks) {
      throw new Error(`Missing chunks for merge. Expected ${upload.total_chunks}, got ${chunks.length}`);
    }

    const finalFilePath = path.join(getUploadsDir(), upload.filename);
    const writeStream = fs.createWriteStream(finalFilePath);

    for (const chunk of chunks) {
      const chunkData = await fs.readFile(chunk.file_path);
      writeStream.write(chunkData);
    }

    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    const fileHash = await calculateHash(finalFilePath);

    await db.run(
      'UPDATE uploads SET status = ?, file_hash = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', fileHash, uploadId]
    );

    // Clean up chunk files
    for (const chunk of chunks) {
      await fs.remove(chunk.file_path).catch(err => 
        console.warn(`⚠️ Failed to delete chunk: ${chunk.file_path}`, err)
      );
    }

    console.log(`✅ Upload completed: ${uploadId} - ${upload.filename}`);
    console.log(`   Hash: ${fileHash}`);
  } catch (error) {
    console.error(`❌ Error merging chunks for upload ${uploadId}:`, error);
    const db = getDatabase();
    await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['failed', uploadId]);
  }
}
