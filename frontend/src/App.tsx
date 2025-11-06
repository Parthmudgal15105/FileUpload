import FileUploader from './components/FileUploader';
import UploadsList from './components/UploadsList';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/toast';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-950 dark:to-indigo-950 transition-colors">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-10">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
                  File Upload Manager
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  Upload and manage your files with chunked upload technology
                </p>
              </div>
              <ThemeToggle />
            </div>
            
            {/* Main Content */}
            <div className="space-y-8">
              <FileUploader />
              <UploadsList />
            </div>
          </div>
          
          {/* Background decoration */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-300/20 dark:bg-blue-600/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-300/20 dark:bg-purple-600/10 rounded-full blur-3xl" />
          </div>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
