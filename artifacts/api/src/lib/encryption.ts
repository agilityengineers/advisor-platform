import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, platformConfigTable } from "@workspace/db";
import { logger } from "./logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "advisor-platform-encryption-salt";
export const ENCRYPTION_KEY_CONFIG_KEY = "platform_encryption_key";

let cachedSecret: string | null = null;
let cachedKey: Buffer | null = null;

function keyFor(secret: string): Buffer {
  if (cachedSecret === secret && cachedKey) return cachedKey;
  cachedSecret = secret;
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/**
 * Resolve the encryption secret: PLATFORM_ENCRYPTION_KEY first, else the
 * auto-generated row in platform_config, else generate and store one.
 * Must complete before traffic is accepted so encrypt() never runs keyless.
 */
export async function initEncryptionKey(): Promise<"env" | "database" | "generated"> {
  if (process.env.PLATFORM_ENCRYPTION_KEY) {
    cachedSecret = process.env.PLATFORM_ENCRYPTION_KEY;
    return "env";
  }
  const [existing] = await db.select().from(platformConfigTable).where(eq(platformConfigTable.key, ENCRYPTION_KEY_CONFIG_KEY)).limit(1);
  if (existing) {
    cachedSecret = existing.value;
    return "database";
  }
  const generated = randomBytes(48).toString("base64url");
  await db.insert(platformConfigTable).values({ key: ENCRYPTION_KEY_CONFIG_KEY, value: generated }).onConflictDoNothing();
  const [row] = await db.select().from(platformConfigTable).where(eq(platformConfigTable.key, ENCRYPTION_KEY_CONFIG_KEY)).limit(1);
  cachedSecret = row?.value ?? generated;
  logger.warn("PLATFORM_ENCRYPTION_KEY was not set — generated one and stored it in platform_config. Set the secret explicitly in production.");
  return "generated";
}

function getKey(): Buffer {
  const secret = cachedSecret ?? process.env.PLATFORM_ENCRYPTION_KEY;
  if (!secret) throw new Error("Encryption key not initialised — call initEncryptionKey() at boot");
  return keyFor(secret);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, authTag, encrypted]).toString("base64")}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith("enc:")) throw new Error("Value is not encrypted");
  const key = getKey();
  const combined = Buffer.from(value.slice(4), "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function last4(value: string): string {
  return value.length <= 4 ? "••••" : value.slice(-4);
}
