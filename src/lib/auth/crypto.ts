// src/lib/auth/crypto.ts
import * as jose from 'jose';

interface LeasePayload {
  userId: string;
  tier: string;
  version: number;
}

/**
 * Executes strictly on the server during login.
 * Signs the user's operational tier with your secret Private Key.
 */
export async function generateOfflineLeaseJwt(payload: LeasePayload): Promise<string> {
  const privateKeyString = process.env.OFFLINE_PRIVATE_KEY;
  if (!privateKeyString) {
    throw new Error("Missing OFFLINE_PRIVATE_KEY in server environment variables.");
  }

  // Import the raw string key into a web-crypto usable PrivateKey object
  const privateKey = await jose.importPKCS8(privateKeyString, 'Ed25519');

  // Sign the payload and set an absolute hard expiration (e.g., 14 days)
  const jwt = await new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'Ed25519' })
    .setIssuedAt()
    .setExpirationTime('14d') 
    .sign(privateKey);

  return jwt;
}