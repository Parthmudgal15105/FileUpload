import * as crypto from 'crypto';
import { promises as fs, createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import * as path from 'path';

// Helper function to calculate file hash
export function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Helper function to calculate chunk hash
export function calculateChunkHash(chunk: Buffer): string {
  return crypto.createHash('sha256').update(chunk).digest('hex');
}

// Helper function to sanitize filename
export function sanitizeFilename(filename: string): string {
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
export function isValidFileType(filename: string): boolean {
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
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
export const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_UPLOADS = 50; // Max uploads per window

// Rate limiting storage (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limiting function
export function checkRateLimit(clientIP: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(clientIP);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX_UPLOADS) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

// Get uploads and chunks directories
export function getUploadsDir(): string {
  return '/tmp/uploads';
}

export function getChunksDir(): string {
  return '/tmp/chunks';
}

// Ensure directories exist
export async function ensureDirectories(): Promise<void> {
  const uploadsDir = getUploadsDir();
  const chunksDir = getChunksDir();
  
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  
  if (!existsSync(chunksDir)) {
    mkdirSync(chunksDir, { recursive: true });
  }
}
