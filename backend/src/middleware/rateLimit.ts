import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config/constants';

interface RateLimitData {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitData>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  const userLimit = rateLimitMap.get(clientIP);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(clientIP, { 
      count: 1, 
      resetTime: now + CONFIG.RATE_LIMIT_WINDOW 
    });
    return next();
  }
  
  if (userLimit.count >= CONFIG.RATE_LIMIT_MAX_UPLOADS) {
    res.status(429).json({ 
      error: 'Rate limit exceeded. Too many uploads. Try again later.' 
    });
    return;
  }
  
  userLimit.count++;
  next();
}

// Cleanup old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now > data.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 30 * 60 * 1000);
