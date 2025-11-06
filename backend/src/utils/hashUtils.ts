import crypto from 'crypto';
import fs from 'fs-extra';

export function calculateHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function calculateChunkHash(chunk: Buffer): string {
  return crypto.createHash('sha256').update(chunk).digest('hex');
}
