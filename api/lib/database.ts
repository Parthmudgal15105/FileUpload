import { open } from 'sqlite';
import * as sqlite3 from 'sqlite3';

let db: any;

export async function getDatabase() {
  if (!db) {
    db = await open({
      filename: '/tmp/uploads.db',
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
  return db;
}

export interface Upload {
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

export interface Chunk {
  id: number;
  upload_id: string;
  chunk_index: number;
  chunk_hash: string;
  file_path: string;
  created_at: string;
}
