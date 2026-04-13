import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET env var is required");

export interface JwtPayload {
  sellerId: number;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
