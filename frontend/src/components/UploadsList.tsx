import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { 
  Download, 
  Trash2, 
  Play, 
  RefreshCw, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Pause,
  Calendar,
  HardDrive
} from 'lucide-react';
import { config, formatFileSize } from '../config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';

const API_BASE = config.API_BASE_URL;

interface Upload {
  id: string;
  filename: string;
  status: 'uploading' | 'completed' | 'failed' | 'paused';
  progress: number;
  totalChunks: number;
  uploadedChunks: number;
  fileSize: number;
  createdAt: string;
  completedAt?: string;
}

const UploadsList: React.FC = () => {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch uploads from backend
  const fetchUploads = useCallback(async () => {
    try {
      if (uploads.length === 0) {
        setLoading(true);
      }
      const response = await axios.get(`${API_BASE}/uploads`);
      setUploads(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch uploads:', err);
      if (uploads.length === 0) {
        setError('Failed to load uploads. Is the backend server running?');
      }
    } finally {
      setLoading(false);
    }
  }, [uploads.length]);

  // Resume upload
  const resumeUpload = async (uploadId: string) => {
    try {
      await axios.post(`${API_BASE}/upload/resume`, { uploadId });
      setTimeout(fetchUploads, 1000);
    } catch (err) {
      console.error('Failed to resume upload:', err);
      setError('Failed to resume upload');
    }
  };

  // Delete upload
  const deleteUpload = async (uploadId: string) => {
    try {
      await axios.delete(`${API_BASE}/upload/${uploadId}`);
      setUploads(prev => prev.filter(upload => upload.id !== uploadId));
    } catch (err) {
      console.error('Failed to delete upload:', err);
      setError('Failed to delete upload');
    }
  };

  // Get status icon and color
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
      case 'uploading':
        return <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Calculate upload speed (rough estimate)
  const calculateSpeed = (upload: Upload): string => {
    if (upload.status !== 'uploading') return '';
    
    const elapsed = Date.now() - new Date(upload.createdAt).getTime();
    const uploadedBytes = (upload.uploadedChunks / upload.totalChunks) * upload.fileSize;
    const speed = uploadedBytes / (elapsed / 1000); // bytes per second
    
    return `${formatFileSize(speed)}/s`;
  };

  useEffect(() => {
    fetchUploads();
    const interval = setInterval(fetchUploads, 10000);
    return () => clearInterval(interval);
  }, [fetchUploads]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Loading uploads...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card className="border-destructive">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center space-x-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-destructive">{error}</span>
            </div>
            <Button onClick={fetchUploads} variant="outline" size="sm">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <HardDrive className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Upload History</h2>
          <span className="text-sm text-muted-foreground">
            ({uploads.length} {uploads.length === 1 ? 'file' : 'files'})
          </span>
        </div>
        <Button onClick={fetchUploads} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {uploads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No uploads yet</h3>
            <p className="text-muted-foreground">
              Start by uploading a file above to see your upload history here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {uploads.map(upload => (
            <Card key={upload.id} className="transition-all hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base truncate" title={upload.filename}>
                        {upload.filename}
                      </CardTitle>
                      <CardDescription className="flex items-center space-x-2 mt-1">
                        {getStatusIcon(upload.status)}
                        <span className="capitalize">{upload.status}</span>
                        {upload.status === 'uploading' && calculateSpeed(upload) && (
                          <>
                            <span>•</span>
                            <span>{calculateSpeed(upload)}</span>
                          </>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 ml-4">
                    {upload.status === 'completed' && (
                      <Button
                        onClick={() => window.open(`${API_BASE}/download/${upload.id}`, '_blank')}
                        variant="outline"
                        size="sm"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {(upload.status === 'failed' || upload.status === 'paused') && (
                      <Button
                        onClick={() => resumeUpload(upload.id)}
                        variant="outline"
                        size="sm"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${upload.filename}"?`)) {
                          deleteUpload(upload.id);
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {upload.uploadedChunks}/{upload.totalChunks} chunks ({upload.progress}%)
                    </span>
                  </div>
                  
                  <Progress 
                    value={upload.progress} 
                    className={cn(
                      "h-2",
                      upload.status === 'uploading' && "animate-pulse"
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <HardDrive className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Size:</span>
                      <span className="font-medium">{formatFileSize(upload.fileSize)}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Started:</span>
                      <span className="font-medium">{formatDate(upload.createdAt)}</span>
                    </div>

                    {upload.completedAt && (
                      <>
                        <div className="flex items-center space-x-2 col-span-2">
                          <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                          <span className="text-muted-foreground">Completed:</span>
                          <span className="font-medium">{formatDate(upload.completedAt)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadsList;
