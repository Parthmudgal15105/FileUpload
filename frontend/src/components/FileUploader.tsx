import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { config, formatFileSize, isValidFileType } from '../config';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';

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
}

const FileUploader: React.FC = () => {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      alert(`File type not allowed. Allowed types: ${config.ALLOWED_FILE_TYPES.join(', ')}`);
      return;
    }

    // Validate file size
    if (file.size > config.MAX_FILE_SIZE) {
      alert(`File size exceeds maximum allowed size of ${formatFileSize(config.MAX_FILE_SIZE)}`);
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
        eta: 'Calculating...'
      };

      setUploads(prev => new Map(prev.set(uploadId, initialProgress)));

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
      }

    } catch (error) {
      console.error('Upload initialization failed:', error);
      alert('Failed to start upload. Please check if the server is running.');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">File Upload</h1>
          <p className="mt-2 text-slate-600">Upload your files with chunked upload technology</p>
        </div>

        {/* Upload Zone */}
        <Card className="relative overflow-hidden">
          <CardContent className="p-0">
            <div
              className={cn(
                "group relative cursor-pointer border-2 border-dashed border-slate-300 bg-white transition-all duration-200 hover:border-primary hover:bg-slate-50",
                isDragOver && "border-primary bg-primary/5"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex min-h-[200px] flex-col items-center justify-center space-y-4 p-8 text-center">
                <div className={cn(
                  "rounded-full bg-slate-100 p-6 transition-colors group-hover:bg-primary/10",
                  isDragOver && "bg-primary/10"
                )}>
                  <Upload className={cn(
                    "h-8 w-8 text-slate-400 transition-colors group-hover:text-primary",
                    isDragOver && "text-primary"
                  )} />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {isDragOver ? "Drop your files here" : "Choose files or drag & drop"}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Supports chunked upload with automatic retry
                  </p>
                  <p className="text-xs text-slate-400">
                    Max file size: {formatFileSize(config.MAX_FILE_SIZE)}
                  </p>
                </div>
                
                <Button variant="outline" className="pointer-events-none">
                  <Upload className="mr-2 h-4 w-4" />
                  Select Files
                </Button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="absolute inset-0 h-full w-full opacity-0"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Upload Progress */}
        {uploads.size > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Progress
              </CardTitle>
              <CardDescription>
                Track your file uploads in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from(uploads.values()).map(upload => (
                <div key={upload.uploadId} className="space-y-3 rounded-lg border p-4">
                  {/* File Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "rounded-full p-2",
                        upload.status === 'completed' && "bg-green-100",
                        upload.status === 'failed' && "bg-red-100",
                        upload.status === 'uploading' && "bg-blue-100"
                      )}>
                        {upload.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {upload.status === 'failed' && <XCircle className="h-4 w-4 text-red-600" />}
                        {upload.status === 'uploading' && <Upload className="h-4 w-4 text-blue-600 animate-pulse" />}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{upload.filename}</p>
                        <p className="text-sm text-slate-500">
                          {upload.chunks.uploaded}/{upload.chunks.total} chunks • {upload.speed}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded-full px-2 py-1 text-xs font-medium",
                        upload.status === 'completed' && "bg-green-100 text-green-700",
                        upload.status === 'failed' && "bg-red-100 text-red-700",
                        upload.status === 'uploading' && "bg-blue-100 text-blue-700"
                      )}>
                        {upload.status}
                      </span>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{upload.progress}% complete</span>
                      <span className="text-slate-500">ETA: {upload.eta}</span>
                    </div>
                    <Progress value={upload.progress} className="h-2" />
                  </div>
                  
                  {/* Failed Chunks */}
                  {upload.chunks.failed.length > 0 && (
                    <div className="rounded-md bg-red-50 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-red-800">
                            Failed chunks: {upload.chunks.failed.join(', ')}
                          </p>
                          <p className="text-xs text-red-600">
                            {upload.chunks.failed.length} chunks failed to upload
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => retryUpload(upload.uploadId)}
                          className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
