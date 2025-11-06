import path from 'path';
import fs from 'fs-extra';
import { CONFIG } from '../config/constants';

export function sanitizeFilename(filename: string): string {
  const sanitized = path.basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.+/g, '.')
    .substring(0, 255);
  
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return `upload_${Date.now()}.bin`;
  }
  
  return sanitized;
}

export function isValidFileType(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.includes(ext);
}

export function getUploadsDir(): string {
  return path.join(__dirname, '..', '..', 'uploads');
}

export function getChunksDir(): string {
  return path.join(__dirname, '..', '..', 'chunks');
}

export async function ensureDirectories(): Promise<void> {
  await fs.ensureDir(getUploadsDir());
  await fs.ensureDir(getChunksDir());
  console.log('✅ Directories created');
}
