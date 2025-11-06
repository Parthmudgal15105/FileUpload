import express from 'express';
import cors from 'cors';
import { CONFIG } from './config/constants';
import { initDatabase } from './database/db';
import { ensureDirectories } from './utils/fileUtils';
import uploadRoutes from './routes/upload.routes';
import fileRoutes from './routes/file.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'File Upload API is running!',
    version: '2.0.0',
    status: 'healthy',
    endpoints: {
      upload: '/api/upload/*',
      files: '/api/*'
    }
  });
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api', fileRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Initialize and start server
async function startServer() {
  try {
    await ensureDirectories();
    await initDatabase();
    
    app.listen(CONFIG.PORT, () => {
      console.log(`
╔════════════════════════════════════════════╗
║   🚀 File Upload Server Started           ║
║                                            ║
║   📍 URL: http://localhost:${CONFIG.PORT}        ║
║   📁 Uploads: backend/uploads              ║
║   🔧 Chunks: backend/chunks                ║
║   💾 Database: backend/uploads.db          ║
║                                            ║
║   ✅ Ready to accept uploads!              ║
╚════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

