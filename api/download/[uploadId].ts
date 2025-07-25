import { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { getDatabase } from '../lib/database';
import { getUploadsDir } from '../lib/utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uploadId } = req.query;
    
    if (!uploadId || typeof uploadId !== 'string') {
      return res.status(400).json({ error: 'Upload ID is required' });
    }

    const db = await getDatabase();
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    if (upload.status !== 'completed') {
      return res.status(400).json({ error: 'File not ready for download' });
    }

    const filePath = path.join(getUploadsDir(), upload.filename);
    
    // Check if file exists
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${upload.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream the file
    const fileBuffer = await fs.readFile(filePath);
    res.send(fileBuffer);

  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
}
