import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase } from '../lib/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uploadId } = req.body;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }

    const db = await getDatabase();
    const upload = await db.get('SELECT * FROM uploads WHERE id = ?', [uploadId]);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Reset status to uploading if it was failed
    if (upload.status === 'failed' || upload.status === 'paused') {
      await db.run('UPDATE uploads SET status = ? WHERE id = ?', ['uploading', uploadId]);
    }

    const receivedChunks = JSON.parse(upload.received_chunks || '[]');
    const missingChunks: number[] = [];
    
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
}
