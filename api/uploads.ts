import { VercelRequest, VercelResponse } from '@vercel/node';
import { getDatabase } from './lib/database';

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
    const db = await getDatabase();
    const uploads = await db.all('SELECT * FROM uploads ORDER BY created_at DESC');
    
    const uploadsWithProgress = uploads.map((upload: any) => {
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
}
