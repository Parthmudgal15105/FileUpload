# Vercel Deployment Guide for Distributed File Upload System

## Overview
This guide will help you deploy your distributed file upload system to Vercel. The project has been restructured to work with Vercel's serverless architecture.

## Project Structure Changes
- **API Routes**: Moved from Express.js backend to Vercel serverless functions in `/api` folder
- **Database**: Uses SQLite with `/tmp` storage (temporary per function execution)
- **File Storage**: Uses `/tmp` directory (note: files are temporary in Vercel)
- **Frontend**: React app built with Vite

## Prerequisites
1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Account**: For deployment from repository
3. **Node.js**: Version 18.x or higher

## Deployment Steps

### 1. Install Dependencies
```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Environment Variables
Create a `.env.local` file in the root directory:
```env
# Production API URL (will be set by Vercel)
VITE_API_BASE_URL=/api

# File size limits
VITE_MAX_FILE_SIZE=10737418240
VITE_CHUNK_SIZE=1048576
```

**Note**: The project's `vercel-build` script is configured to:
```bash
cd frontend && npm ci && npx tsc --noEmit && npx vite build
```
This ensures all dependencies are properly installed and commands use `npx` to access local packages.

### 3. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit for Vercel deployment"
git branch -M main
git remote add origin https://github.com/yourusername/your-repo-name.git
git push -u origin main
```

### 4. Deploy to Vercel

#### Option A: Using Vercel CLI (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

#### Option B: Using Vercel Dashboard
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Configure project settings:
   - **Framework Preset**: Other (or None)
   - **Root Directory**: `./`
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: `frontend/dist`
   - **Install Command**: (leave empty, handled by build script)

### 5. Configure Environment Variables in Vercel
In your Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add the following variables:
   ```
   VITE_API_BASE_URL=/api
   VITE_MAX_FILE_SIZE=10737418240
   VITE_CHUNK_SIZE=1048576
   NODE_ENV=production
   ```

## Important Limitations & Considerations

### ⚠️ Vercel Serverless Limitations

1. **Temporary File Storage**: 
   - Files uploaded to `/tmp` are deleted after function execution
   - For production, integrate with cloud storage (AWS S3, Google Cloud Storage, etc.)

2. **Function Timeout**: 
   - Hobby plan: 10 seconds
   - Pro plan: 60 seconds
   - Large file uploads may timeout

3. **Memory Limits**:
   - Hobby plan: 1GB RAM
   - Pro plan: 3GB RAM

4. **Database**:
   - SQLite in `/tmp` is reset on each function call
   - For production, use a persistent database (PlanetScale, Supabase, etc.)

### 🚀 Production Recommendations

1. **Use Persistent Database**:
   ```bash
   # Example with PlanetScale
   npm install @planetscale/database
   ```

2. **Use Cloud Storage**:
   ```bash
   # Example with AWS S3
   npm install @aws-sdk/client-s3
   ```

3. **Add Authentication**:
   ```bash
   # Example with NextAuth.js
   npm install next-auth
   ```

## Troubleshooting

### Build Errors
- Ensure all TypeScript types are properly installed
- Check that import paths are correct
- Verify all dependencies are in `package.json`
- **TypeScript Module Resolution Issues**: If you see errors like "Could not find a declaration file for module", ensure:
  - All `@types/*` packages are installed in devDependencies
  - TypeScript configuration uses proper module resolution
  - Build command uses `tsc --noEmit` instead of `tsc -b`

### Common Vercel Build Issues
- **"Could not read package.json" error**: Ensure vercel.json points to correct build directory
- **Module resolution errors**: Use `framework: null` in vercel.json for custom builds
- **TypeScript compilation errors**: Verify tsconfig.json settings are compatible with Vercel's Node.js environment
- **"vite: command not found" error**: Use `npx vite build` instead of `vite build` in build scripts
- **Build script execution issues**: Ensure build commands use `npx` to access locally installed packages

### Runtime Errors
- Check Vercel function logs in dashboard
- Verify environment variables are set correctly
- Monitor function execution time and memory usage

### File Upload Issues
- Large files may need chunking strategy adjustment
- Consider implementing retry logic for failed chunks
- Monitor `/tmp` directory size limits

## Local Development
```bash
# Start development server
npm run dev

# Or start frontend only
cd frontend
npm run dev
```

## Production URLs
After deployment, your app will be available at:
- **Frontend**: `https://your-project-name.vercel.app`
- **API**: `https://your-project-name.vercel.app/api`

## Next Steps for Production

1. **Implement Persistent Storage**: Replace `/tmp` with cloud storage
2. **Add Authentication**: Implement user authentication and authorization
3. **Add Monitoring**: Set up error tracking and performance monitoring
4. **Optimize Performance**: Implement caching and CDN for better performance
5. **Add Security**: Implement rate limiting, CSRF protection, and input validation
6. **Database Migration**: Move from SQLite to a production database

## Support
- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Vercel Community**: [github.com/vercel/vercel/discussions](https://github.com/vercel/vercel/discussions)
