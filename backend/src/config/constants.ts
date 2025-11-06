export const CONFIG = {
  PORT: process.env.PORT || 4000,
  
  // File limits
  MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10GB
  MAX_CHUNK_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_UPLOADS: 50,
  
  // Allowed file types
  ALLOWED_EXTENSIONS: [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico',
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm', '.flv',
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    '.json', '.xml', '.csv', '.log', '.js', '.ts', '.tsx', '.jsx',
    '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs',
    '.html', '.css', '.scss', '.yml', '.yaml', '.md'
  ]
};
