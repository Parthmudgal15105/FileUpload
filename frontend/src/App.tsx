import React from 'react';
import FileUploader from './components/FileUploader';
import UploadsList from './components/UploadsList';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <div className="min-h-screen bg-background transition-colors">
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">File Upload Manager</h1>
              <p className="text-muted-foreground mt-1">
                Upload and manage your files with chunked upload support
              </p>
            </div>
            <ThemeToggle />
          </div>
          
          <div className="space-y-8">
            <FileUploader />
            <UploadsList />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
