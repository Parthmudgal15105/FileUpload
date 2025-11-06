import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, CheckCircle, XCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import { config, formatFileSize, isValidFileType } from '../config';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { cn } from '../lib/utils';
import { getFileIcon, getFileTypeColor } from '../lib/fileIcons';
import { useToast } from './ui/toast';

const API_BASE = config.API_BASE_URL;
const CHUNK_SIZE = config.CHUNK_SIZE;

interface UploadProgress {
  uploadId: string;
  filename: string;
  progress: number;
  status: 'uploading' | 'completed' | 'failed' | 'paused';
  chunks: {
    total: number;
    uploaded: number;
    failed: number[];
  };
  speed: string;
  eta: string;
  fileSize: number;
}

const FileUploader: React.FC = () => {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // Calculate chunk hash
  const calculateChunkHash = async (chunk: Blob): Promise<string> => {
    const buffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Upload a single chunk with retry logic
  const uploadChunk = async (
    uploadId: string,
    chunk: Blob,
    chunkIndex: number,
    chunkHash: string,
    totalChunks: number,
    retries = 2 // Reduced retries for faster failover
  ): Promise<boolean> => {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('chunkHash', chunkHash);
    formData.append('totalChunks', totalChunks.toString());

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await axios.post(`${API_BASE}/upload/chunk`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 15000, // Reduced timeout to 15 seconds
        });
        return true;
      } catch (error) {
        console.error(`Chunk ${chunkIndex} upload attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries) {
          return false;
        }
        
        // Reduced exponential backoff
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    return false;
  };

  // Main upload function
  const uploadFile = async (file: File) => {
    // Validate file type
    if (!isValidFileType(file.name)) {
      showToast(`File type not allowed. Allowed types: ${config.ALLOWED_FILE_TYPES.join(', ')}`, 'error');
      return;
    }

    // Validate file size
    if (file.size > config.MAX_FILE_SIZE) {
      showToast(`File size exceeds maximum allowed size of ${formatFileSize(config.MAX_FILE_SIZE)}`, 'error');
      return;
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    try {
      // Initialize upload session - get uploadId from server
      const initResponse = await axios.post(`${API_BASE}/upload/init`, {
        filename: file.name,
        totalChunks,
        fileSize: file.size
      });

      const { uploadId } = initResponse.data;
      
      // Initialize upload progress
      const initialProgress: UploadProgress = {
        uploadId,
        filename: file.name,
        progress: 0,
        status: 'uploading',
        chunks: {
          total: totalChunks,
          uploaded: 0,
          failed: []
        },
        speed: '0 MB/s',
        eta: 'Calculating...',
        fileSize: file.size
      };

      setUploads(prev => new Map(prev.set(uploadId, initialProgress)));
      showToast(`Upload started: ${file.name}`, 'info');

      const startTime = Date.now();
      let uploadedChunks = 0;
      const failedChunks: number[] = [];

      // Upload chunks in parallel (with limited concurrency)
      const concurrency = 10; // Increased for better performance
      
      for (let i = 0; i < totalChunks; i += concurrency) {
        const batchPromises: Promise<void>[] = [];
        
        for (let j = 0; j < concurrency && i + j < totalChunks; j++) {
          const chunkIndex = i + j;
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);
          
          batchPromises.push(
            (async (): Promise<void> => {
              const chunkHash = await calculateChunkHash(chunk);
              const success = await uploadChunk(uploadId, chunk, chunkIndex, chunkHash, totalChunks);
              
              if (success) {
                uploadedChunks++;
                
                // Update progress
                setUploads(prev => {
                  const current = prev.get(uploadId);
                  if (!current) return prev;
                  
                  const elapsed = (Date.now() - startTime) / 1000;
                  const totalUploadedBytes = uploadedChunks * CHUNK_SIZE;
                  const speed = totalUploadedBytes / elapsed / (1024 * 1024); // MB/s
                  const remainingChunks = totalChunks - uploadedChunks;
                  const eta = remainingChunks > 0 ? (remainingChunks * CHUNK_SIZE) / (totalUploadedBytes / elapsed) : 0;
                  
                  const updated: UploadProgress = {
                    ...current,
                    progress: Math.round((uploadedChunks / totalChunks) * 100),
                    chunks: {
                      ...current.chunks,
                      uploaded: uploadedChunks
                    },
                    speed: `${speed.toFixed(2)} MB/s`,
                    eta: eta > 0 ? `${Math.round(eta)}s` : 'Almost done!'
                  };
                  
                  return new Map(prev.set(uploadId, updated));
                });
              } else {
                // Mark chunk as failed only once
                if (!failedChunks.includes(chunkIndex)) {
                  failedChunks.push(chunkIndex);
                  setUploads(prev => {
                    const current = prev.get(uploadId);
                    if (!current) return prev;
                    
                    const updated: UploadProgress = {
                      ...current,
                      chunks: {
                        ...current.chunks,
                        failed: [...current.chunks.failed, chunkIndex]
                      }
                    };
                    
                    return new Map(prev.set(uploadId, updated));
                  });
                }
              }
            })()
          );
        }
        
        await Promise.all(batchPromises);
      }

      // Check final status
      if (failedChunks.length === 0) {
        setUploads(prev => {
          const current = prev.get(uploadId);
          if (!current) return prev;
          
          const updated: UploadProgress = {
            ...current,
            status: 'completed',
            progress: 100,
            eta: 'Complete!'
          };
          
          return new Map(prev.set(uploadId, updated));
        });
        showToast(`Upload completed: ${file.name}`, 'success');
      } else {
        setUploads(prev => {
          const current = prev.get(uploadId);
          if (!current) return prev;
          
          const updated: UploadProgress = {
            ...current,
            status: 'failed'
          };
          
          return new Map(prev.set(uploadId, updated));
        });
        showToast(`Upload failed: ${file.name}`, 'error');
      }

    } catch (error) {
      console.error('Upload initialization failed:', error);
      showToast('Failed to start upload. Please check if the server is running.', 'error');
    }
  };

  // Handle file selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    Array.from(files).forEach(file => {
      uploadFile(file);
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Retry failed chunks
  const retryUpload = async (uploadId: string) => {
    const upload = uploads.get(uploadId);
    if (!upload || upload.chunks.failed.length === 0) return;

    setUploads(prev => {
      const current = prev.get(uploadId);
      if (!current) return prev;
      
      const updated: UploadProgress = {
        ...current,
        status: 'uploading',
        chunks: {
          ...current.chunks,
          failed: []
        }
      };
      
      return new Map(prev.set(uploadId, updated));
    });

    // Re-upload failed chunks
    // Implementation would go here...
  };

  // Remove upload from list
  const removeUpload = (uploadId: string) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      newMap.delete(uploadId);
      return newMap;
    });
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone Card */}
      <Card className="relative overflow-hidden border-2 transition-all duration-300 hover:shadow-xl">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20 opacity-50" />
        
        <CardContent className="relative p-0">
          <div
            className={cn(
              "group relative cursor-pointer border-2 border-dashed transition-all duration-300",
              "bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm",
              isDragOver 
                ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[0.99]" 
                : "border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex min-h-[280px] flex-col items-center justify-center space-y-6 p-10 text-center">
              {/* Upload Icon with animation */}
              <div className={cn(
                "relative rounded-full p-8 transition-all duration-300",
                "bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40",
                isDragOver && "scale-110 rotate-6",
                "group-hover:scale-105"
              )}>
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-10 transition-opacity blur-xl" />
                <Upload className={cn(
                  "h-12 w-12 transition-all duration-300",
                  isDragOver 
                    ? "text-blue-600 dark:text-blue-400 animate-bounce" 
                    : "text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300"
                )} />
              </div>
              
              <div className="space-y-3">
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  {isDragOver ? "Drop your files here" : "Upload Files"}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                  {isDragOver 
                    ? "Release to start uploading" 
                    : "Drag and drop files here, or click to browse"
                  }
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <Sparkles className="h-3 w-3" />
                  <span>Chunked upload with auto-retry</span>
                  <span>•</span>
                  <span>Max {formatFileSize(config.MAX_FILE_SIZE)}</span>
                </div>
              </div>
              
              <Button 
                variant="outline" 
                size="lg"
                className="pointer-events-none border-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all"
              >
                <Upload className="mr-2 h-5 w-5" />
                Choose Files
              </Button>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Active Uploads */}
      {uploads.size > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                  Active Uploads
                </CardTitle>
                <CardDescription>
                  {uploads.size} {uploads.size === 1 ? 'file' : 'files'} uploading
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {Array.from(uploads.values()).map(upload => {
              const FileIcon = getFileIcon(upload.filename);
              const gradientColor = getFileTypeColor(upload.filename);
              
              return (
                <div 
                  key={upload.uploadId} 
                  className="group relative rounded-xl border bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 p-5 shadow-sm hover:shadow-md transition-all duration-300"
                >
                  {/* Progress background */}
                  <div 
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-indigo-500/5 transition-all duration-300"
                    style={{ width: `${upload.progress}%` }}
                  />
                  
                  <div className="relative space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        {/* File Icon */}
                        <div className={cn(
                          "flex-shrink-0 rounded-lg p-3 bg-gradient-to-br shadow-lg",
                          gradientColor
                        )}>
                          <FileIcon className="h-6 w-6 text-white" />
                        </div>
                        
                        {/* File Info */}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {upload.filename}
                          </h4>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <span>{formatFileSize(upload.fileSize)}</span>
                            <span>•</span>
                            <span>{upload.chunks.uploaded}/{upload.chunks.total} chunks</span>
                            {upload.speed !== '0 MB/s' && (
                              <>
                                <span>•</span>
                                <span className="text-blue-600 dark:text-blue-400 font-medium">{upload.speed}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Status Badge & Actions */}
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                          upload.status === 'completed' && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                          upload.status === 'failed' && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                          upload.status === 'uploading' && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        )}>
                          {upload.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                          {upload.status === 'failed' && <XCircle className="h-3 w-3" />}
                          {upload.status === 'uploading' && (
                            <div className="h-2 w-2 bg-current rounded-full animate-pulse" />
                          )}
                          <span className="capitalize">{upload.status}</span>
                        </div>
                        
                        {(upload.status === 'completed' || upload.status === 'failed') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeUpload(upload.uploadId)}
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">
                          {upload.progress}% complete
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          ETA: {upload.eta}
                        </span>
                      </div>
                      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-600",
                            upload.status === 'uploading' && "animate-pulse"
                          )}
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* Failed Chunks Warning */}
                    {upload.chunks.failed.length > 0 && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-900 dark:text-red-200">
                                Upload Failed
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                                {upload.chunks.failed.length} chunk{upload.chunks.failed.length > 1 ? 's' : ''} failed to upload
                              </p>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => retryUpload(upload.uploadId)}
                            className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex-shrink-0"
                          >
                            <RotateCcw className="mr-2 h-3 w-3" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default FileUploader;
