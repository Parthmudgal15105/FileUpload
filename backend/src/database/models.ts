export interface Upload {
  id: string;
  filename: string;
  total_chunks: number;
  file_size: number;
  received_chunks: string;
  file_hash?: string;
  status: 'uploading' | 'completed' | 'failed' | 'paused';
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
