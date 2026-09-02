import type { Role } from './auth/capabilities.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { role: Role; userId: string };
    }
  }
}

export {};
