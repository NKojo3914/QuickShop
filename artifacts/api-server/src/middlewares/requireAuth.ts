import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.auth_token;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = verifyToken(token);
    res.locals.seller = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}
