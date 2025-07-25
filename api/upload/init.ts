import { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../lib/database';
import { 
  sanitizeFilename, 
  isValidFileType, 
  MAX_FILE_SIZE, 
  checkRateLimit 
} from '../lib/utils';

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
    // Rate limiting
    const clientIP = req.headers['x-forwarded-for'] as string || req.headers['x-real-ip'] as string || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Too many uploads. Try again later.' 
      });
    }

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
    const db = await getDatabase();
    
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
}
