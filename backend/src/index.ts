import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Interfaces
interface Upload {
  id: string;
  filename: string;
  total_chunks: number;
  file_size: number;
  received_chunks: string;
  file_hash?: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

interface Chunk {
  id: number;
  upload_id: string;
  chunk_index: number;
  chunk_hash: string;
  file_path: string;
  created_at: string;
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory
const uploadsDir = path.join(__dirname, '..', 'uploads');
const chunksDir = path.join(__dirname, '..', 'chunks');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(chunksDir);

// Configure multer for chunk uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, chunksDir);
  },
  filename: (req, file, cb) => {
    const uploadId = req.body.uploadId;
    const chunkIndex = req.body.chunkIndex;
    cb(null, `${uploadId}_chunk_${chunkIndex}`);
  }
});

const upload = multer({ storage });

// Database setup
let db: any;

async function initDB() {
  db = await open({
    filename: path.join(__dirname, '..', 'uploads.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      total_chunks INTEGER NOT NULL,
      file_size INTEGER DEFAULT 0,
      received_chunks TEXT DEFAULT '[]',
      file_hash TEXT,
      status TEXT DEFAULT 'uploading',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (upload_id) REFERENCES uploads (id)
    );
  `);
}

// Helper function to calculate file hash
function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Helper function to calculate chunk hash
function calculateChunkHash(chunk: Buffer): string {
  return crypto.createHash('sha256').update(chunk).digest('hex');
}

// Helper function to sanitize filename
function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts and dangerous characters
  const sanitized = path.basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 255); // Limit filename length
  
  // Ensure filename is not empty and has an extension
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return `upload_${Date.now()}.bin`;
  }
  
  return sanitized;
}

// Helper function to validate file type
function isValidFileType(filename: string): boolean {
  const allowedExtensions = [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg',
    '.mp4', '.avi', '.mkv', '.mov', '.wmv',
    '.mp3', '.wav', '.flac', '.aac',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.json', '.xml', '.csv', '.log'
  ];
  
  const ext = path.extname(filename).toLowerCase();
  return allowedExtensions.includes(ext);
}

// Constants for limits
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_UPLOADS = 50; // Max uploads per window

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limiting middleware
function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  const userLimit = rateLimitMap.get(clientIP);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_UPLOADS) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Too many uploads. Try again later.' 
    });
  }
  
  userLimit.count++;
  next();
}

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Distributed File Uploader API is running!' });
});

// Initialize upload session
app.post('/api/upload/init', rateLimit, async (req, res) => {
  try {
    const { filename, totalChunks, fileSize } = req.body;
    
    if (!filename || !totalChunks || !fileSize) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ 
        error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB` 
      });
    }

    // Validate file type
    if (!isValidFileType(filename)) {
      return res.status(400).json({ error: 'File type not allowed' });
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(filename);

    const uploadId = uuidv4();
    
    await db.run(
      'INSERT INTO uploads (id, filename, total_chunks, file_size) VALUES (?, ?, ?, ?)',
      [uploadId, sanitizedFilename, totalChunks, fileSize]
    );

    res.json({
      uploadId,
      filename: sanitizedFilename,
      message: 'Upload session initialized',
      resumeFrom: 0
    });
  } catch (error) {
    console.error('Error initializing upload:', error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

// Upload chunk
app.post('/api/upload/chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { uploadId, chunkIndex, chunkHash } = req.body;
    const file = req.file;

    if (!file || !uploadId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate chunk size
    if (file.size > MAX_CHUNK_SIZE) {
      await fs.remove(file.path);
      return res.status(400).json({ 
        error: `Chunk size exceeds maximum allowed size of ${MAX_CHUNK_SIZE / (1024 * 1024)}MB` 
      });
    }

    // Verify chunk integrity
    const fileBuffer = await fs.readFile(file.path);
    const calculatedHash = calculateChunkHash(fileBuffer);
    
    if (chunkHash && calculatedHash !== chunkHash) {
      await fs.remove(file.path);
      return res.status(400).json({ error: 'Chunk integrity check failed' });
    }

    // Check if upload exists
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      await fs.remove(file.path);
      return res.status(404).json({ error: 'Upload session not found' });
    }

    // Store chunk info
    await db.run(
      'INSERT OR REPLACE INTO chunks (upload_id, chunk_index, chunk_hash, file_path) VALUES (?, ?, ?, ?)',
      [uploadId, parseInt(chunkIndex), calculatedHash, file.path]
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
      // Trigger merge process
      mergeChunks(uploadId);
    }
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// Get upload status
app.get('/api/upload/status/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
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
      createdAt: upload.created_at,
      completedAt: upload.completed_at
    });
  } catch (error) {
    console.error('Error getting upload status:', error);
    res.status(500).json({ error: 'Failed to get upload status' });
  }
});

// Resume upload - get missing chunks
app.get('/api/upload/resume/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    const missingChunks = [];
    
    for (let i = 0; i < upload.total_chunks; i++) {
      if (!receivedChunks.includes(i)) {
        missingChunks.push(i);
      }
    }

    res.json({
      uploadId,
      missingChunks,
      resumeFrom: missingChunks.length > 0 ? missingChunks[0] : upload.total_chunks
    });
  } catch (error) {
    console.error('Error resuming upload:', error);
    res.status(500).json({ error: 'Failed to resume upload' });
  }
});

// Resume upload POST endpoint to restart failed uploads
app.post('/api/upload/resume', async (req, res) => {
  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }

    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Reset status to uploading if it was failed
    if (upload.status === 'failed' || upload.status === 'paused') {
      await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['uploading', uploadId]);
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
      missingChunks,
      resumeFrom: missingChunks.length > 0 ? missingChunks[0] : upload.total_chunks,
      message: 'Upload resumed successfully'
    });
  } catch (error) {
    console.error('Error resuming upload:', error);
    res.status(500).json({ error: 'Failed to resume upload' });
  }
});

// List all uploads
app.get('/api/uploads', async (req, res) => {
  try {
    const uploads = await db.all('SELECT * FROM uploads ORDER BY created_at DESC');
    
    const uploadsWithProgress = uploads.map((upload: Upload) => {
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
    console.error('Error listing uploads:', error);
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// Download completed file
app.get('/api/download/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    if (upload.status !== 'completed') {
      return res.status(400).json({ error: 'File not ready for download' });
    }

    const filePath = path.join(uploadsDir, upload.filename);
    
    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${upload.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download file' });
      }
    });

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Delete upload and associated files
app.delete('/api/upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Delete associated chunks
    const chunks = await db.all('SELECT * FROM chunks WHERE upload_id = ?', [uploadId]);
    for (const chunk of chunks) {
      try {
        await fs.remove(chunk.file_path);
      } catch (err) {
        console.warn('Failed to delete chunk file:', chunk.file_path, err);
      }
    }

    // Delete final file if it exists
    const finalFilePath = path.join(uploadsDir, upload.filename);
    if (await fs.pathExists(finalFilePath)) {
      await fs.remove(finalFilePath);
    }

    // Delete from database
    await db.run('DELETE FROM chunks WHERE upload_id = ?', [uploadId]);
    await db.run('DELETE FROM uploads WHERE id = ?', [uploadId]);

    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (error) {
    console.error('Error deleting upload:', error);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

// Merge chunks into final file
async function mergeChunks(uploadId: string) {
  try {
    console.log(`Starting merge process for upload: ${uploadId}`);
    
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
    const finalFilePath = path.join(uploadsDir, upload.filename);
    const writeStream = fs.createWriteStream(finalFilePath);

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
      await fs.remove(chunk.file_path);
    }

    console.log(`Upload ${uploadId} completed successfully. Hash: ${fileHash}`);
  } catch (error) {
    console.error(`Error merging chunks for upload ${uploadId}:`, error);
    await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['failed', uploadId]);
  }
}

// Initialize database and start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
    console.log(`Chunks directory: ${chunksDir}`);
  });
}).catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});
