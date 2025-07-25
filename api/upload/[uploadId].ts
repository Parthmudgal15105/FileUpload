import { VercelRequest, VercelResponse } from '@vercel/node';
import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { getDatabase } from '../lib/database';
import { getUploadsDir } from '../lib/utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
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

    // Delete associated chunks
    const chunks = await db.all('SELECT * FROM chunks WHERE upload_id = ?', [uploadId]);
    for (const chunk of chunks) {
      try {
        if (existsSync(chunk.file_path)) {
          await fs.unlink(chunk.file_path);
        }
      } catch (err) {
        console.warn('Failed to delete chunk file:', chunk.file_path, err);
      }
    }

    // Delete final file if it exists
    const finalFilePath = path.join(getUploadsDir(), upload.filename);
    if (existsSync(finalFilePath)) {
      await fs.unlink(finalFilePath);
    }

    // Delete from database
    await db.run('DELETE FROM chunks WHERE upload_id = ?', [uploadId]);
    await db.run('DELETE FROM uploads WHERE id = ?', [uploadId]);

    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (error) {
    console.error('Error deleting upload:', error);
    res.status(500).json({ error: 'Failed to delete upload' });
  }
}
