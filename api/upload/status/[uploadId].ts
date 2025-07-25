import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase } from '../../lib/database';

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
}
