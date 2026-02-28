# 🎯 Interview Preparation Guide — File Upload Application

This guide walks you through **how this project is built from scratch**, explains every important technical decision, and covers the most commonly asked interview questions with detailed answers.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Build From Scratch — Step-by-Step](#2-build-from-scratch--step-by-step)
3. [Architecture Deep Dive](#3-architecture-deep-dive)
4. [Chunked Upload — How It Works](#4-chunked-upload--how-it-works)
5. [Database Design](#5-database-design)
6. [Security Features](#6-security-features)
7. [Frontend Concepts](#7-frontend-concepts)
8. [Backend Concepts](#8-backend-concepts)
9. [Interview Questions & Answers](#9-interview-questions--answers)
10. [Trade-offs & Design Decisions](#10-trade-offs--design-decisions)
11. [Extending the Project](#11-extending-the-project)

---

## 1. Project Overview

This is a **distributed file uploader** with:

- A **React + TypeScript** frontend (Vite build tool, Tailwind CSS)
- A **Node.js + Express + TypeScript** backend
- **SQLite** as the database (via the `sqlite` + `sqlite3` npm packages)
- **Chunked file uploads** — large files are split into smaller pieces (default: 1 MB each) and uploaded in parallel
- **SHA-256 integrity verification** — every chunk's hash is verified on arrival
- **Resume / retry** support — if an upload fails halfway, only missing chunks are re-sent
- **Rate limiting**, **file-type whitelisting**, and **filename sanitization**

---

## 2. Build From Scratch — Step-by-Step

### 2.1 Project Scaffold

```bash
mkdir file-upload-app && cd file-upload-app
npm init -y                        # root package.json (workspace runner)
npm install concurrently           # run backend + frontend together
```

Edit root `package.json` scripts:
```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev"
  }
}
```

### 2.2 Backend Setup

```bash
mkdir backend && cd backend
npm init -y
npm install express cors multer sqlite sqlite3 fs-extra uuid axios
npm install -D typescript ts-node-dev @types/express @types/node @types/multer @types/fs-extra @types/uuid
npx tsc --init          # generates tsconfig.json
```

Key `tsconfig.json` settings:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true
  }
}
```

Create the folder structure:
```
backend/src/
├── config/constants.ts        # centralised config (PORT, limits, allowed types)
├── database/
│   ├── db.ts                  # open SQLite and run CREATE TABLE IF NOT EXISTS
│   └── models.ts              # TypeScript interfaces (Upload, Chunk)
├── middleware/rateLimit.ts    # in-memory IP-based rate limiter
├── routes/
│   ├── upload.routes.ts       # /api/upload/* — multer + upload controller
│   └── file.routes.ts         # /api/* — list, download, delete
├── controllers/
│   ├── upload.controller.ts   # initUpload, uploadChunk, getUploadStatus, resume
│   └── file.controller.ts     # listUploads, downloadFile, deleteUpload
└── utils/
    ├── fileUtils.ts           # sanitizeFilename, isValidFileType, ensureDirectories
    └── hashUtils.ts           # SHA-256 helpers using Node's built-in crypto module
```

`backend/src/index.ts` — wire everything together:
```typescript
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/upload', uploadRoutes);
app.use('/api', fileRoutes);
app.listen(PORT, async () => {
  await ensureDirectories();
  await initDatabase();
});
```

### 2.3 Frontend Setup

```bash
cd .. && npm create vite@latest frontend -- --template react-ts
cd frontend
npm install axios lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-slot
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Configure `tailwind.config.js` to scan your source files:
```js
content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
```

Key source folders:
```
frontend/src/
├── config.ts                 # API base URL, chunk size, allowed types from env vars
├── App.tsx                   # root layout — ThemeProvider, ToastProvider
├── contexts/ThemeContext.tsx # dark/light mode with localStorage persistence
├── components/
│   ├── FileUploader.tsx      # drag-drop zone, chunk logic, progress UI
│   ├── UploadsList.tsx       # fetches & displays completed uploads
│   ├── ThemeToggle.tsx       # sun/moon button
│   └── ui/                   # reusable: Button, Card, Progress, Toast
└── lib/utils.ts              # clsx + tailwind-merge helper (cn())
```

### 2.4 Environment Variables

**Frontend** (`.env`):
```
VITE_API_BASE_URL=http://localhost:4000/api
VITE_MAX_FILE_SIZE=10737418240
VITE_CHUNK_SIZE=1048576
```
> `VITE_` prefix is required by Vite to expose variables to the browser bundle.

**Backend** — all configuration lives in `backend/src/config/constants.ts`. Values have hard-coded defaults (e.g. `PORT: process.env.PORT || 4000`), so no `.env` file is required for local development. If you want to override values (e.g. change the port in CI), set the corresponding environment variable before starting the server.

---

## 3. Architecture Deep Dive

```
Browser (React)
   │
   │  1. POST /api/upload/init   ──────────────────┐
   │  2. POST /api/upload/chunk (×N, parallel)      │
   │  3. GET  /api/upload/status/:id                │
   │  4. GET  /api/uploads                          │
   │  5. GET  /api/download/:id                     │
   │  6. DELETE /api/upload/:id                     │
   │                                                ▼
   └──────────────► Express Server (Node.js)
                         │
                    ┌────┴─────────────────────────┐
                    │  Multer (disk storage)        │
                    │  Rate Limiter (in-memory Map) │
                    │  SHA-256 Hash Verification    │
                    └────┬─────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         SQLite DB           File System
         (uploads.db)        backend/chunks/  (temp)
         • uploads table     backend/uploads/ (final)
         • chunks table
```

**Request lifecycle for a single chunk:**
1. Multer saves the raw `multipart/form-data` body to `backend/chunks/<uploadId>_chunk_<index>`
2. Controller reads the chunk from disk, computes SHA-256, compares with the hash sent by the client
3. If matching, it inserts a row into the `chunks` table and updates `received_chunks` JSON array in the `uploads` table
4. When `received_chunks.length === total_chunks`, `mergeChunks()` is triggered asynchronously
5. `mergeChunks()` streams all chunk files in order into a single output file, computes final hash, updates DB status to `'completed'`, and deletes temp chunk files

---

## 4. Chunked Upload — How It Works

### Why Chunking?

| Problem | Chunking Solution |
|---------|-------------------|
| Browser/server timeout on large files | Each chunk completes in seconds |
| Network interruption loses entire upload | Only missing chunks need to be re-sent |
| Memory pressure (loading whole file) | Process one chunk at a time |
| Parallel transfers to maximize throughput | Upload up to 10 chunks simultaneously |

### Frontend Logic (`FileUploader.tsx`)

```
File (e.g. 50 MB, CHUNK_SIZE = 1 MB)
  │
  ├── Chunk 0: file.slice(0, 1MB)
  ├── Chunk 1: file.slice(1MB, 2MB)
  ├── ...
  └── Chunk 49: file.slice(49MB, 50MB)
```

1. **Init** — `POST /api/upload/init` → server returns `uploadId`
2. **Hash** — `crypto.subtle.digest('SHA-256', chunkArrayBuffer)` (Web Crypto API)
3. **Upload** — `POST /api/upload/chunk` with `FormData { chunk, uploadId, chunkIndex, chunkHash }`
4. **Concurrency** — batches of up to 10 chunks in parallel using `Promise.all`
5. **Retry** — each chunk retries up to 2 times with 500 ms exponential back-off
6. **Progress** — `uploadedChunks / totalChunks * 100`, speed in MB/s, ETA in seconds

### Backend Merge Logic (`upload.controller.ts → mergeChunks`)

```typescript
// Stream chunks in order into final file
for (const chunk of chunks) {          // ordered by chunk_index ASC
  const data = await fs.readFile(chunk.file_path);
  writeStream.write(data);
}
writeStream.end();
// Compute SHA-256 of assembled file, save to DB
const fileHash = await calculateHash(finalFilePath);
```

### Resume Flow

```
Client sends: GET /api/upload/resume/:uploadId
Server returns: { missingChunks: [3, 7, 12], receivedChunks: 47, totalChunks: 50 }
Client re-uploads only chunks 3, 7, and 12
```

---

## 5. Database Design

### Schema

```sql
CREATE TABLE uploads (
  id             TEXT PRIMARY KEY,      -- UUID v4
  filename       TEXT NOT NULL,         -- sanitized filename
  total_chunks   INTEGER NOT NULL,
  file_size      INTEGER DEFAULT 0,
  received_chunks TEXT DEFAULT '[]',   -- JSON array of chunk indices received
  file_hash      TEXT,                  -- SHA-256 of assembled file
  status         TEXT DEFAULT 'uploading', -- uploading | completed | failed | paused
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at   DATETIME
);

CREATE TABLE chunks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id    TEXT NOT NULL,
  chunk_index  INTEGER NOT NULL,
  chunk_hash   TEXT NOT NULL,           -- SHA-256 of this chunk
  file_path    TEXT NOT NULL,           -- path on disk
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (upload_id) REFERENCES uploads(id)
);
```

### Why SQLite?

- Zero external dependencies (no Postgres/MySQL server to set up)
- Perfect for a single-server deployment or a demo
- The `sqlite` npm package provides a clean async/await API over `sqlite3`
- Trade-off: **not suitable for high-concurrency writes** (SQLite uses file-level locks)

### Why store `received_chunks` as a JSON array?

- Simple to update: read → deserialize → push → serialize → write
- Keeps the schema flat (no extra join needed to check progress)
- Trade-off: not optimal for very large chunk counts; a proper `chunks` table query would scale better

---

## 6. Security Features

### 1. Rate Limiting (`middleware/rateLimit.ts`)

```typescript
// In-memory Map<IP, { count, resetTime }>
// 50 uploads per IP per 15 minutes
if (userLimit.count >= CONFIG.RATE_LIMIT_MAX_UPLOADS) {
  return res.status(429).json({ error: 'Rate limit exceeded' });
}
```

**Interview point:** This is a custom in-memory rate limiter. It works for a single server but **resets on restart** and **doesn't work across multiple server instances** (horizontal scaling). For production, replace it with the `express-rate-limit` npm package (which has a plug-in Redis store) combined with `ioredis` for a shared, durable counter across instances.

### 2. File Type Whitelisting (`utils/fileUtils.ts`)

```typescript
const ext = path.extname(filename).toLowerCase();
return CONFIG.ALLOWED_EXTENSIONS.includes(ext);
```

Only checks the extension — an improvement would be to also validate the **MIME type** (via the `file-type` npm package which reads magic bytes from the file header).

### 3. Filename Sanitization

```typescript
path.basename(filename)             // strips any directory components (path traversal prevention)
  .replace(/[^a-zA-Z0-9._-]/g, '_') // remove special chars
  .replace(/\.+/g, '.')             // collapse multiple dots
  .substring(0, 255)                // cap at 255 chars (OS limit)
```

**Why `path.basename`?** Without it a filename like `../../etc/passwd` would escape the uploads directory.

### 4. SHA-256 Integrity Verification

- Client computes hash of each chunk with the **Web Crypto API** (runs in browser, no library needed)
- Server recomputes hash with Node's built-in **`crypto` module**
- If hashes differ → chunk is rejected (`400 Bad Request`)
- After merge, the full file hash is computed and stored for later verification

### 5. CORS

`cors()` middleware allows cross-origin requests. In production you should restrict origins:
```typescript
app.use(cors({ origin: 'https://yourdomain.com' }));
```

### 6. Chunk Size Limit

Each chunk must be ≤ `MAX_CHUNK_SIZE` (10 MB). Multer enforces this via the `limits` option (can be added to the multer config for stricter enforcement).

---

## 7. Frontend Concepts

### React State Management

- `useState<Map<string, UploadProgress>>` — each in-progress upload is keyed by its server-assigned `uploadId`
- React's functional updates (`setUploads(prev => new Map(prev.set(...)))`) ensure immutability

### Web Crypto API

```typescript
const buffer = await chunk.arrayBuffer();
const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
const hashHex = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

No library required — this is built into every modern browser.

### Drag and Drop

```typescript
onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
```

`e.preventDefault()` is required in `onDragOver` to allow `onDrop` to fire.

### Context API (Theme)

```typescript
// ThemeContext.tsx
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
export const ThemeProvider = ({ children }) => { ... };
// useTheme.ts
export const useTheme = () => useContext(ThemeContext);
```

Theme is persisted in `localStorage` and applied by toggling a CSS class on `<html>` (Tailwind's `darkMode: 'class'` strategy).

### Vite Environment Variables

Variables prefixed with `VITE_` are statically replaced at build time:
```typescript
config.API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
```

At runtime in the browser, `import.meta.env` holds the resolved values.

### Tailwind CSS Utility

`cn()` from `lib/utils.ts` merges class names safely:
```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`tailwind-merge` handles conflicting Tailwind classes (e.g., `p-2 p-4` → `p-4`).

---

## 8. Backend Concepts

### Multer — File Upload Middleware

```typescript
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, getChunksDir()),
  filename: (req, file, cb) => cb(null, `${req.body.uploadId}_chunk_${req.body.chunkIndex}`)
});
const upload = multer({ storage });
router.post('/chunk', upload.single('chunk'), uploadController.uploadChunk);
```

- `multer.diskStorage` writes directly to disk (avoids loading into memory)
- `upload.single('chunk')` means exactly one file field named `chunk`
- The `file` object is available as `req.file` in the controller

### Express Router

```typescript
// Separate routers keep code modular
app.use('/api/upload', uploadRoutes);  // /api/upload/init, /api/upload/chunk, etc.
app.use('/api', fileRoutes);           // /api/uploads, /api/download/:id, etc.
```

### SQLite with async/await

```typescript
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
const db = await open({ filename: 'uploads.db', driver: sqlite3.Database });
await db.run('INSERT INTO uploads ...', [id, filename, ...]);
const row = await db.get<Upload>('SELECT * FROM uploads WHERE id = ?', [id]);
const rows = await db.all<Upload[]>('SELECT * FROM uploads');
```

### UUID v4 for Upload IDs

`uuidv4()` generates a 128-bit random identifier like `550e8400-e29b-41d4-a716-446655440000`.  
This is used instead of an auto-increment integer to:
- Avoid exposing sequential IDs (IDOR vulnerability mitigation)
- Support distributed generation without coordination

### `fs-extra`

Drop-in replacement for the built-in `fs` module with extra helpers:
- `fs.ensureDir(path)` — `mkdir -p` equivalent
- `fs.pathExists(path)` — safe file existence check
- `fs.remove(path)` — safe recursive delete

---

## 9. Interview Questions & Answers

### System Design

**Q: Why use chunked uploads instead of a single large request?**  
A: Three main reasons:
1. **Reliability** — network interruptions only lose one chunk (~1 MB), not the entire file
2. **Resumability** — the server tracks which chunks arrived; the client can resume from the first missing chunk
3. **Parallelism** — uploading 10 chunks simultaneously multiplies throughput on modern connections

**Q: How would you scale this to handle thousands of simultaneous uploads?**  
A:
1. Move chunk/file storage to object storage (AWS S3, GCS) with pre-signed URLs so the client uploads directly — eliminating the server as a bottleneck
2. Replace SQLite with PostgreSQL/MySQL behind a connection pool
3. Replace the in-memory rate limiter with Redis
4. Use a message queue (SQS, RabbitMQ) to decouple chunk receipt from the merge operation
5. Add a CDN in front of the download endpoint

**Q: How does the resume/retry mechanism work?**  
A: The server stores received chunk indices in the `uploads.received_chunks` column (JSON array). On resume:
1. Client calls `GET /api/upload/resume/:uploadId`
2. Server computes `missingChunks` = all indices from 0 to `total_chunks - 1` that are not in `received_chunks`
3. Client re-uploads only those chunks
4. When all chunks are present, merge runs normally

**Q: What happens if two clients upload the same filename simultaneously?**  
A: Each upload gets a unique UUID as its `uploadId`, so chunk files are named `<uuid>_chunk_<index>` — no collision. The final assembled file is written to `uploads/<sanitized_filename>`. If two uploads use the same filename the second will overwrite the first on disk (a real production system would prefix with the UUID or use content-addressed storage).

---

### Node.js / Express

**Q: What is middleware in Express? Give examples from this project.**  
A: Middleware is a function with `(req, res, next)` signature that sits in the request pipeline.  
Examples here:
- `cors()` — sets CORS headers on every response
- `express.json()` — parses `application/json` bodies into `req.body`
- `multer` — parses `multipart/form-data` and saves files to disk
- `rateLimit` — custom middleware that checks IP request counts before passing to the route handler

**Q: Explain the difference between `app.use` and `router.use`.**  
A: `app.use` mounts middleware/router at the application level. `router.use` mounts at the router level. Here, `app.use('/api/upload', uploadRoutes)` delegates all `/api/upload/*` requests to the `uploadRoutes` Router instance, which then handles `/init`, `/chunk`, etc.

**Q: What is `multer.diskStorage` and why is it preferred over `memoryStorage`?**  
A: `diskStorage` writes uploaded files directly to the file system, keeping memory usage constant regardless of file size. `memoryStorage` loads the file into a `Buffer` in RAM — fine for small files but dangerous for large uploads (risk of OOM crash). For this project where chunks can be up to 10 MB, disk storage is the safer choice.

**Q: How does the async error handling work?**  
A: Each controller is an `async function`. Errors are caught with `try/catch` and return a JSON error response. A global error-handling middleware (4-argument `(err, req, res, next)`) catches any uncaught express errors. This project uses **Express 4** (`"express": "^4.18.2"`). In Express 4, unhandled promise rejections inside route handlers are *not* automatically forwarded to the error middleware — you need to either wrap async handlers with a utility like `express-async-errors`, or use `next(error)` inside a `.catch()`. Express 5 handles this automatically.

---

### TypeScript

**Q: Why use TypeScript over JavaScript for this project?**  
A:
- Compile-time type checking catches bugs before runtime (e.g., typos in SQL column names, wrong response shapes)
- Interfaces like `Upload` and `Chunk` make database row shapes explicit and self-documenting
- Better IDE autocomplete and refactoring support

**Q: What does the `Upload` interface do?**  
A: It describes the shape of a row from the `uploads` table:
```typescript
export interface Upload {
  id: string;
  filename: string;
  total_chunks: number;
  file_size: number;
  received_chunks: string;   // stored as JSON string in SQLite
  file_hash?: string;         // optional — only present after merge
  status: 'uploading' | 'completed' | 'failed' | 'paused';  // union type
  created_at: string;
  completed_at?: string;
}
```
The `?` marks optional fields. The `status` union type prevents invalid status values at compile time.

---

### React

**Q: Why use `Map` for managing upload state instead of an array or plain object?**  
A: A `Map<uploadId, UploadProgress>` gives O(1) lookup by `uploadId` when updating progress for a specific chunk. An array would require `O(n)` scan; an object (`{[key]: value}`) would work too but TypeScript types are cleaner with Map.

**Q: How does dark mode work?**  
A: Tailwind is configured with `darkMode: 'class'`. The `ThemeProvider` toggles the class `dark` on `document.documentElement`. Tailwind then applies all `dark:` prefixed utility classes. The chosen theme is saved to `localStorage` so it persists across page loads, and also reads `window.matchMedia('(prefers-color-scheme: dark)')` for the initial default.

**Q: What is the Context API and how is it used here?**  
A: React Context provides a way to share values (theme, toast functions) deeply through the component tree without prop drilling. `ThemeContext` wraps the app; any child can call `useTheme()` to read or toggle the theme. Same pattern is used for `ToastProvider`.

**Q: How does the `cn()` utility function work?**  
A: It combines `clsx` (conditional class joining) with `tailwind-merge` (resolves conflicting Tailwind classes). For example, `cn("p-2", condition && "p-4")` returns `"p-4"` when the condition is true, because `tailwind-merge` knows `p-4` overrides `p-2`.

---

### Security

**Q: What is a path traversal attack and how is it prevented here?**  
A: An attacker sends a filename like `../../etc/passwd` hoping the server writes to an unintended location. Prevention: `path.basename(filename)` strips any directory separators, and the special characters regex `[^a-zA-Z0-9._-]` replaces everything else with `_`.

**Q: Why verify the chunk hash on the server if the client already computed it?**  
A: The client's hash proves the data arrived intact (no corruption in transit). Without server-side verification, a malicious client could send an incorrect hash, and corrupted data would silently make it into the final file. The server independently computes the hash and compares — if they differ, the chunk is rejected and must be re-sent.

**Q: What are the limitations of in-memory rate limiting?**  
A: The rate-limit `Map` is held in the Node.js process memory:
1. **Resets on restart** — all counters are lost
2. **No shared state** — with multiple server instances behind a load balancer, each instance has its own map, so the effective limit is `N × max` where N is instance count
3. **Memory leak risk** — mitigated here by a `setInterval` cleanup that removes expired entries every 30 minutes

---

### Database

**Q: Why SQLite for this project instead of PostgreSQL?**  
A: SQLite requires zero setup (no separate server process) and stores everything in a single file (`uploads.db`). Ideal for a portfolio project or low-concurrency deployment. Trade-off: SQLite uses file-level write locking — under high concurrent writes PostgreSQL or MySQL scales much better.

**Q: What is the purpose of the `chunks` table if `received_chunks` is already in `uploads`?**  
A: The `chunks` table stores the **file path** of each chunk on disk (needed for the merge step), as well as the chunk hash and creation timestamp. The `received_chunks` JSON in `uploads` is a denormalized counter for fast progress calculation without a `COUNT` query. Both serve different purposes.

**Q: What does `INSERT OR REPLACE` do in SQLite?**  
A: It's equivalent to "upsert" — if a row with the same primary/unique key exists, delete it and insert the new one. Used in `uploadChunk` to safely handle duplicate chunk submissions (e.g., client retries a chunk the server already received).

---

## 10. Trade-offs & Design Decisions

| Decision | Choice Made | Alternative | Why This Choice |
|----------|-------------|-------------|-----------------|
| Database | SQLite | PostgreSQL / MongoDB | Zero-config, single file, great for demos/portfolios |
| Storage | Local filesystem | AWS S3 / GCS | Simpler setup; swap `fs-extra` calls for AWS SDK for production |
| Rate limiting | In-memory Map | Redis + express-rate-limit | No external dependency; note the multi-instance limitation |
| Chunk size | 1 MB (frontend), up to 10 MB (backend) | Larger chunks | Balance between parallelism and retry cost |
| Concurrency | 10 parallel chunks | Sequential | Maximises bandwidth; limited to avoid overwhelming the server |
| Integrity check | SHA-256 per chunk + full file | None / MD5 | SHA-256 is collision-resistant; fast enough on modern hardware |
| File type check | Extension whitelist | MIME / magic bytes | Quick to implement; adding `file-type` package gives stronger guarantees |
| Upload IDs | UUID v4 | Auto-increment integer | Random UUIDs prevent IDOR; no coordination needed in distributed setup |

---

## 11. Extending the Project

These are common follow-up questions in interviews — "what would you add next?"

### User Authentication (JWT)
```
POST /api/auth/register  →  hash password (bcrypt), store user, return JWT
POST /api/auth/login     →  verify password, return JWT
GET  /api/uploads        →  validate JWT, filter by user_id
```
Add a `user_id` column to the `uploads` table and a `users` table.

### AWS S3 Integration
Replace `fs-extra` file writes with the AWS SDK:
```typescript
await s3.putObject({ Bucket, Key: `chunks/${uploadId}/${chunkIndex}`, Body: chunkBuffer });
```
Use S3 multipart upload API for even better scalability (S3 handles assembly server-side).

### WebSockets (Real-time progress)
Replace polling (`setInterval` calls to `/api/upload/status`) with a WebSocket:
```typescript
// Server
io.to(uploadId).emit('progress', { percentage, speed });
// Client
socket.on('progress', ({ percentage }) => updateUI(percentage));
```

### File Encryption (at rest)
Before writing to disk, encrypt with AES-256-GCM:
```typescript
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
```
Store the IV alongside the file; decrypt on download.

### Unit & Integration Tests
```bash
npm install -D jest supertest @types/jest ts-jest
```
- **Unit tests**: `sanitizeFilename()`, `calculateChunkHash()`, `isValidFileType()`
- **Integration tests**: spin up an Express app, send real HTTP requests with `supertest`, assert responses
- **Frontend tests**: React Testing Library + Vitest for component tests

---

## Quick Revision Checklist

- [ ] Can explain what chunked upload is and why it's used
- [ ] Can walk through the full upload lifecycle (init → chunk → merge)
- [ ] Understands SHA-256 integrity check (client + server side)
- [ ] Can explain the SQLite schema and why two tables exist
- [ ] Knows what Multer does and the difference between disk vs. memory storage
- [ ] Can explain path traversal and how `sanitizeFilename` prevents it
- [ ] Understands the limitations of in-memory rate limiting
- [ ] Can discuss how to scale the system (S3, Redis, PostgreSQL, WebSockets)
- [ ] Can explain React Context API and how dark mode is implemented
- [ ] Knows why UUID v4 is used for upload IDs instead of auto-increment
- [ ] Can explain `INSERT OR REPLACE` in SQLite
- [ ] Understands Vite environment variables (`VITE_` prefix)
- [ ] Can explain the `cn()` utility (clsx + tailwind-merge)

---

> **Good luck with your interview! 🚀** You built a real, production-like system — own it confidently.
