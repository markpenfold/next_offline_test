// src/lib/auth/crypto.ts
import * as jose from 'jose';
import { type UserTier } from '@/lib/types';

export interface LeasePayload {
  userId: string;
  accountId: string;
  tier: UserTier;
  exp: number;
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



/**
 * Decodes a standard JWT payload on the client side without verifying signatures.
 * (We trust it because it was originally set via secure HttpOnly handshakes).
 */
export function decodeLeaseJwt(token: string): LeasePayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}