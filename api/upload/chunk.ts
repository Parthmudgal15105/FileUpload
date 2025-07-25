import { VercelRequest, VercelResponse } from '@vercel/node';
import * as multiparty from 'multiparty';
import { promises as fs, createWriteStream, createReadStream, existsSync } from 'fs';
import * as path from 'path';
import { getDatabase } from '../lib/database';
import { 
  calculateChunkHash, 
  MAX_CHUNK_SIZE, 
  getChunksDir,
  getUploadsDir,
  ensureDirectories,
  calculateHash
} from '../lib/utils';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureDirectories();
    
    const form = new multiparty.Form();
    
    const { fields, files } = await new Promise<{ fields: any, files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const uploadId = fields.uploadId?.[0];
    const chunkIndex = fields.chunkIndex?.[0];
    const chunkHash = fields.chunkHash?.[0];
    const file = files.chunk?.[0];

    if (!file || !uploadId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate chunk size
    if (file.size > MAX_CHUNK_SIZE) {
      await fs.unlink(file.path);
      return res.status(400).json({ 
        error: `Chunk size exceeds maximum allowed size of ${MAX_CHUNK_SIZE / (1024 * 1024)}MB` 
      });
    }

    // Verify chunk integrity
    const fileBuffer = await fs.readFile(file.path);
    const calculatedHash = calculateChunkHash(fileBuffer);
    
    if (chunkHash && calculatedHash !== chunkHash) {
      await fs.unlink(file.path);
      return res.status(400).json({ error: 'Chunk integrity check failed' });
    }

    const db = await getDatabase();

    // Check if upload exists
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      await fs.unlink(file.path);
      return res.status(404).json({ error: 'Upload session not found' });
    }

    // Move chunk to proper location
    const chunkPath = path.join(getChunksDir(), `${uploadId}_chunk_${chunkIndex}`);
    await fs.copyFile(file.path, chunkPath);
    await fs.unlink(file.path);

    // Store chunk info
    await db.run(
      'INSERT OR REPLACE INTO chunks (upload_id, chunk_index, chunk_hash, file_path) VALUES (?, ?, ?, ?)',
      [uploadId, parseInt(chunkIndex), calculatedHash, chunkPath]
    );

    // Update received chunks
    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    if (!receivedChunks.includes(parseInt(chunkIndex))) {
      receivedChunks.push(parseInt(chunkIndex));
      receivedChunks.sort((a: number, b: number) => a - b);
    }

    await db.run(
      'UPDATE uploads SET received_chunks = ? WHERE id = ?',
      [JSON.stringify(receivedChunks), uploadId]
    );

    res.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      receivedChunks: receivedChunks.length,
      totalChunks: upload.total_chunks
    });

    // Check if all chunks received
    if (receivedChunks.length === upload.total_chunks) {
      // Trigger merge process in background
      setImmediate(() => mergeChunks(uploadId));
    }
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
}

// Merge chunks into final file
async function mergeChunks(uploadId: string) {
  try {
    console.log(`Starting merge process for upload: ${uploadId}`);
    
    const db = await getDatabase();
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      throw new Error('Upload not found');
    }

    // Get all chunks ordered by index
    const chunks = await db.all(
      'SELECT * FROM chunks WHERE upload_id = ? ORDER BY chunk_index ASC',
      [uploadId]
    );

    if (chunks.length !== upload.total_chunks) {
      throw new Error('Missing chunks for merge');
    }

    // Create final file path
    const finalFilePath = path.join(getUploadsDir(), upload.filename);
    const writeStream = createWriteStream(finalFilePath);

    // Merge chunks sequentially
    for (const chunk of chunks) {
      const chunkData = await fs.readFile(chunk.file_path);
      writeStream.write(chunkData);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    // Calculate final file hash
    const fileHash = await calculateHash(finalFilePath);

    // Update upload status
    await db.run(
      'UPDATE uploads SET status = ?, file_hash = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', fileHash, uploadId]
    );

    // Clean up chunk files
    for (const chunk of chunks) {
      try {
        await fs.unlink(chunk.file_path);
      } catch (err) {
        console.warn('Failed to delete chunk file:', chunk.file_path, err);
      }
    }

    console.log(`Upload ${uploadId} completed successfully. Hash: ${fileHash}`);
  } catch (error) {
    console.error(`Error merging chunks for upload ${uploadId}:`, error);
    const db = await getDatabase();
    await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['failed', uploadId]);
  }
}
