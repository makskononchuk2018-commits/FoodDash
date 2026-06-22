import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { UserRole } from "@shared/schema";

const scrypt = promisify(scryptCallback);

export type SessionUser = {
  id: number;
  username: string;
  role: UserRole;
};

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

declare global {
  namespace Express {
    interface Request {
      sessionUser?: SessionUser;
    }
  }
}

const MemoryStore = createMemoryStore(session);

export function createSessionMiddleware() {
  return session({
    name: "fd_session",
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    store: new MemoryStore({ checkPeriod: 1000 * 60 * 60 * 24 }),
  });
}

export function hydrateSessionUser(req: Request, _res: Response, next: NextFunction) {
  req.sessionUser = req.session.user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.sessionUser) {
    return res.status(401).json({ message: "Требуется авторизация" });
  }

  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.sessionUser) {
      return res.status(401).json({ message: "Требуется авторизация" });
    }

    if (!roles.includes(req.sessionUser.role)) {
      return res.status(403).json({ message: "Недостаточно прав" });
    }

    next();
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, key] = storedHash.split(":");

  if (!salt || !key) {
    return false;
  }

  const keyBuffer = Buffer.from(key, "hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  if (keyBuffer.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(keyBuffer, derived);
}
