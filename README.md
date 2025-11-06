# File Upload Application

A modern, distributed file uploader with chunked uploads, integrity verification, and beautiful UI.

## ✨ Features

- **Chunked File Upload**: Large files split into chunks for reliable upload
- **Beautiful UI**: Modern glassmorphism design with smooth animations
- **File Type Icons**: Visual indicators for different file types
- **Real-time Progress**: Live upload speed, ETA, and progress tracking
- **Toast Notifications**: User-friendly notifications for all actions
- **Upload Resume/Retry**: Resume failed or incomplete uploads
- **File Management**: View, download, and delete uploads
- **Dark Mode**: Full dark mode support
- **Security**: Rate limiting, file validation, integrity checks

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.x
- npm or yarn

### Install Dependencies
```bash
# Install all dependencies (root, backend, and frontend)
npm run install:all

# Or manually:
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Development Mode
```bash
# Run both frontend and backend concurrently
npm run dev

# Or run separately:
npm run dev:backend   # Backend on http://localhost:4000
npm run dev:frontend  # Frontend on http://localhost:5173
```

### Production Build
```bash
npm run build        # Builds both backend and frontend
npm run start:backend   # Start production backend
npm run start:frontend  # Preview production frontend
```

## 📁 Project Structure

```
file-upload-app/
├── backend/              # Express backend
│   ├── src/
│   │   ├── index.ts              # Server entry point
│   │   ├── config/
│   │   │   └── constants.ts      # Configuration
│   │   ├── controllers/
│   │   │   ├── file.controller.ts
│   │   │   └── upload.controller.ts
│   │   ├── database/
│   │   │   ├── db.ts             # Database setup
│   │   │   └── models.ts         # TypeScript types
│   │   ├── middleware/
│   │   │   └── rateLimit.ts      # Rate limiting
│   │   ├── routes/
│   │   │   ├── file.routes.ts
│   │   │   └── upload.routes.ts
│   │   └── utils/
│   │       ├── fileUtils.ts      # File operations
│   │       └── hashUtils.ts      # Hash calculations
│   ├── chunks/           # Temporary chunk storage
│   ├── uploads/          # Completed files
│   └── uploads.db        # SQLite database
│
└── frontend/             # React frontend
    ├── src/
    │   ├── components/
    │   │   ├── FileUploader.tsx  # Upload component
    │   │   ├── UploadsList.tsx   # History component
    │   │   └── ui/               # UI components
    │   ├── contexts/
    │   │   └── ThemeContext.tsx  # Dark mode
    │   ├── lib/
    │   │   └── fileIcons.ts      # File type icons
    │   └── config.ts     # Frontend config
    └── dist/             # Production build
```

## 🔌 API Endpoints

### Upload Operations
- `POST /api/upload/init` - Initialize upload session
- `POST /api/upload/chunk` - Upload individual chunk
- `GET /api/upload/status/:uploadId` - Get upload status
- `POST /api/upload/resume` - Resume failed upload
- `GET /api/upload/resume/:uploadId` - Get missing chunks

### File Management
- `GET /api/uploads` - List all uploads
- `GET /api/download/:uploadId` - Download file
- `DELETE /api/upload/:uploadId` - Delete upload

## ⚙️ Configuration

### Frontend (.env)
```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_MAX_FILE_SIZE=10737418240  # 10GB
VITE_CHUNK_SIZE=5242880         # 5MB
```

### Backend (backend/src/config/constants.ts)
```typescript
PORT: 4000
MAX_FILE_SIZE: 10GB
MAX_CHUNK_SIZE: 10MB
RATE_LIMIT_MAX_UPLOADS: 50 per 15 minutes
```

## 🔒 Security Features

1. **Rate Limiting**: 50 uploads per 15 min per IP
2. **File Validation**: Whitelist of allowed file types
3. **Size Limits**: Configurable max file/chunk sizes
4. **Filename Sanitization**: Prevents path traversal
5. **Integrity Verification**: SHA-256 hash checks
6. **CORS Protection**: Configurable origins

## 🎨 Supported File Types

- **Documents**: PDF, DOC, DOCX, TXT, XLS, XLSX, PPT, PPTX
- **Images**: JPG, PNG, GIF, BMP, SVG, WEBP
- **Videos**: MP4, AVI, MKV, MOV, WMV, WEBM
- **Audio**: MP3, WAV, FLAC, AAC, OGG
- **Archives**: ZIP, RAR, 7Z, TAR, GZ
- **Code**: JS, TS, PY, JAVA, JSON, XML, CSV

## 🛠️ Tech Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Axios (HTTP client)
- Lucide React (icons)

### Backend
- Node.js + Express
- TypeScript
- SQLite (database)
- Multer (file upload)
- fs-extra (file operations)

## 📝 Development Scripts

```bash
# Root commands
npm run dev              # Run both frontend & backend
npm run build            # Build both
npm run install:all      # Install all dependencies

# Backend only
npm run dev:backend      # Start dev server
npm run build:backend    # Build TypeScript
npm run start:backend    # Run production

# Frontend only
npm run dev:frontend     # Start dev server
npm run build:frontend   # Build for production
npm run start:frontend   # Preview production build
```

## 🚀 Next Steps

- [ ] Add user authentication
- [ ] Integrate cloud storage (AWS S3)
- [ ] Add WebSocket for real-time updates
- [ ] Implement file encryption
- [ ] Add compression before upload
- [ ] Create admin dashboard
- [ ] Add unit & integration tests

## 📄 License

MIT
