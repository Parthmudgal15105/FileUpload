export const config = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  MAX_FILE_SIZE: parseInt(import.meta.env.VITE_MAX_FILE_SIZE || '10737418240'), // 10GB
  CHUNK_SIZE: parseInt(import.meta.env.VITE_CHUNK_SIZE || '1048576'), // 1MB
  ALLOWED_FILE_TYPES: [
    '.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg',
    '.mp4', '.avi', '.mkv', '.mov', '.wmv',
    '.mp3', '.wav', '.flac', '.aac',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.json', '.xml', '.csv', '.log'
  ]
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const isValidFileType = (filename: string): boolean => {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return config.ALLOWED_FILE_TYPES.includes(extension);
};
