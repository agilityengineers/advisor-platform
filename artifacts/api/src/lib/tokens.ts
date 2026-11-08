import { createHash, randomBytes } from "node:crypto";

/** A URL-safe random token and the SHA-256 we store in its place. */
export function newToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newPublicId(prefix = ""): string {
  return `${prefix}${randomBytes(12).toString("base64url")}`;
}
