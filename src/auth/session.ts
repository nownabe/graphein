import { sign, verify } from "hono/jwt";

export interface JwtPayload {
  sub: string; // user ID
  name: string;
  exp: number;
}

const EXPIRATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionHelpers {
  createToken(userId: string, displayName: string): Promise<string>;
  verifyToken(token: string): Promise<JwtPayload | null>;
}

export function createSessionHelpers(jwtSecret: string): SessionHelpers {
  return {
    async createToken(userId: string, displayName: string): Promise<string> {
      const now = Math.floor(Date.now() / 1000);
      return sign({ sub: userId, name: displayName, exp: now + EXPIRATION_SECONDS }, jwtSecret);
    },
    async verifyToken(token: string): Promise<JwtPayload | null> {
      try {
        return (await verify(token, jwtSecret, "HS256")) as unknown as JwtPayload;
      } catch {
        return null;
      }
    },
  };
}
