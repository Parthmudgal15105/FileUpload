# File Upload Application

A robust, distributed file uploader with chunked uploads, integrity verification, and resume functionality.

## Features

✅ **Implemented:**
- **Chunked File Upload**: Large files are split into 1MB chunks for reliable upload
- **File Download**: Download completed uploads via secure API endpoint
- **Upload Resume/Retry**: Resume failed or incomplete uploads
- **File Validation**: File type and size validation
- **Security Improvements**: 
  - Filename sanitization to prevent path traversal
  - Rate limiting (50 uploads per 15 minutes per IP)
  - File size limits (10GB max)
  - Chunk integrity verification
- **Progress Tracking**: Real-time upload progress with speed and ETA
- **Upload Management**: View, pause, resume, and delete uploads
- **Database Storage**: SQLite database for upload metadata
- **Environment Configuration**: Configurable API URLs and limits

## How to Run

### Backend (Node.js + Express + TypeScript)
```bash
cd backend
npm install
npx tsc
node dist/index.js
```
**Backend runs on: http://localhost:4000**

### Frontend (React + Vite + TypeScript)
```bash
npm install
npm run dev
```
**Frontend runs on: http://localhost:5174**

## API Endpoints

- `POST /api/upload/init` - Initialize upload session
- `POST /api/upload/chunk` - Upload individual chunk
- `GET /api/upload/status/:uploadId` - Get upload status
- `GET /api/upload/resume/:uploadId` - Get missing chunks for resume
- `POST /api/upload/resume` - Resume failed upload
- `GET /api/uploads` - List all uploads
- `GET /api/download/:uploadId` - Download completed file
- `DELETE /api/upload/:uploadId` - Delete upload and files

## Configuration

### Environment Variables (.env)
```
VITE_API_BASE_URL=http://localhost:4000/api
VITE_MAX_FILE_SIZE=10737418240
VITE_CHUNK_SIZE=1048576
```

### Allowed File Types
- Documents: .txt, .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx
- Images: .jpg, .jpeg, .png, .gif, .bmp, .svg
- Videos: .mp4, .avi, .mkv, .mov, .wmv
- Audio: .mp3, .wav, .flac, .aac
- Archives: .zip, .rar, .7z, .tar, .gz
- Data: .json, .xml, .csv, .log

## Security Features

1. **Rate Limiting**: 50 uploads per 15 minutes per IP address
2. **File Validation**: Only allowed file types can be uploaded
3. **Size Limits**: Maximum file size of 10GB, chunk size of 10MB
4. **Filename Sanitization**: Prevents path traversal attacks
5. **Integrity Verification**: SHA-256 hash validation for chunks
6. **Error Handling**: Comprehensive error handling and user feedback

## Next Steps for Production

1. **Authentication**: Add user authentication and authorization
2. **Cloud Storage**: Integrate with AWS S3 or similar cloud storage
3. **Redis**: Use Redis for rate limiting and session management
4. **Load Balancing**: Add multiple backend instances with load balancer
5. **Monitoring**: Add logging, metrics, and health checks
6. **Testing**: Add comprehensive unit and integration tests
7. **CI/CD**: Set up automated deployment pipeline
8. **HTTPS**: Configure SSL certificates for secure connections

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Axios
- **Backend**: Node.js, Express, TypeScript, SQLite
- **File Handling**: Multer, fs-extra
- **Security**: Crypto (SHA-256), Rate limiting
- **Database**: SQLite3 with better-sqlite3 wrapper
