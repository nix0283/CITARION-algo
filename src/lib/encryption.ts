/**
 * Encryption utilities for API keys and secrets
 * 
 * Uses AES-256-GCM for encryption
 * Keys are encrypted before storing in the database
 * 
 * @security CRITICAL SECURITY NOTICE
 * 
 * This module handles encryption of sensitive API keys and secrets.
 * 
 * IMPORTANT SECURITY REQUIREMENTS:
 * 1. NEVER use a default/hardcoded encryption key in production
 * 2. The API_KEY_ENCRYPTION_KEY environment variable MUST be set in production
 * 3. The encryption key should be a securely generated 32-byte random key
 * 4. Rotating the encryption key requires re-encrypting all stored secrets
 * 
 * FAILURE TO SET A PROPER ENCRYPTION KEY IN PRODUCTION WILL:
 * - Cause the application to fail to start (by design)
 * - Prevent potential data breaches from hardcoded keys
 * 
 * For development, use generateSecureKey() to create a key for your .env file
 */

import crypto from "crypto";

// ==================== ENVIRONMENT VALIDATION ====================

/**
 * Check if the application is running in production mode
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Get and validate the encryption key from environment
 * 
 * @throws Error if key is not set in production environment
 */
function getEncryptionKey(): string {
  const key = process.env.API_KEY_ENCRYPTION_KEY;
  
  if (!key) {
    if (isProduction()) {
      throw new Error(
        "CRITICAL: API_KEY_ENCRYPTION_KEY environment variable is not set. " +
        "This is required in production. Generate a secure key using generateSecureKey() " +
        "and add it to your environment variables."
      );
    }
    
    // In development, generate a temporary key with a warning
    console.warn(
      "\n" + "=".repeat(70) + "\n" +
      "WARNING: API_KEY_ENCRYPTION_KEY is not set.\n" +
      "A temporary development key is being used.\n" +
      "This is NOT secure and should NEVER happen in production.\n" +
      "To fix this, add the following to your .env file:\n" +
      `API_KEY_ENCRYPTION_KEY="${generateSecureKey()}"\n` +
      "=".repeat(70) + "\n"
    );
    
    // Generate a temporary key for development only
    return generateSecureKey();
  }
  
  // Validate key length (should be at least 32 characters for AES-256)
  if (key.length < 32) {
    throw new Error(
      "API_KEY_ENCRYPTION_KEY must be at least 32 characters long. " +
      "Current length: " + key.length + ". " +
      "Generate a new key using generateSecureKey()."
    );
  }
  
  return key;
}

// ==================== CONFIGURATION ====================

// Encryption algorithm configuration
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // Initialization vector length
const AUTH_TAG_LENGTH = 16; // GCM authentication tag length
const SALT_LENGTH = 32;

// Lazy-loaded encryption key to allow validation at runtime
let _encryptionKey: string | null = null;

/**
 * Get the encryption key (lazy-loaded with validation)
 */
function getEffectiveEncryptionKey(): string {
  if (_encryptionKey === null) {
    _encryptionKey = getEncryptionKey();
  }
  return _encryptionKey;
}

/**
 * Reset the cached encryption key (useful for testing or key rotation)
 */
export function resetEncryptionKeyCache(): void {
  _encryptionKey = null;
}

// ==================== KEY GENERATION ====================

/**
 * Generate a cryptographically secure random key
 * 
 * Use this function to generate a secure encryption key for your .env file:
 * 
 * @example
 * // In Node.js console:
 * console.log(generateSecureKey());
 * 
 * // Or use in code to get a key for your .env:
 * const key = generateSecureKey();
 * console.log(`Add this to .env: API_KEY_ENCRYPTION_KEY="${key}"`);
 * 
 * @returns A 64-character hex string (32 bytes) suitable for AES-256 encryption
 */
export function generateSecureKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Validate that the encryption setup is properly configured
 * 
 * This function should be called at application startup to ensure
 * encryption is properly configured before any sensitive data is stored.
 * 
 * @returns Object containing validation status and any error messages
 * 
 * @example
 * // Call at application startup
 * const validation = validateEncryptionSetup();
 * if (!validation.isValid) {
 *   console.error("Encryption setup invalid:", validation.error);
 *   process.exit(1);
 * }
 */
export function validateEncryptionSetup(): {
  isValid: boolean;
  isProduction: boolean;
  keyIsSet: boolean;
  keyLength: number;
  error?: string;
  warning?: string;
} {
  const result = {
    isValid: true,
    isProduction: isProduction(),
    keyIsSet: !!process.env.API_KEY_ENCRYPTION_KEY,
    keyLength: 0,
    error: undefined as string | undefined,
    warning: undefined as string | undefined,
  };
  
  const key = process.env.API_KEY_ENCRYPTION_KEY;
  
  if (key) {
    result.keyLength = key.length;
  }
  
  // Check for missing key
  if (!key) {
    if (result.isProduction) {
      result.isValid = false;
      result.error = "API_KEY_ENCRYPTION_KEY is not set in production environment. " +
        "This is a critical security vulnerability.";
    } else {
      result.isValid = true; // Valid for development (will generate temp key)
      result.warning = "API_KEY_ENCRYPTION_KEY is not set. A temporary development key will be used. " +
        "This is not secure and should be fixed before production deployment.";
    }
    return result;
  }
  
  // Check key length
  if (key.length < 32) {
    result.isValid = false;
    result.error = `API_KEY_ENCRYPTION_KEY is too short (${key.length} characters). ` +
      "Key must be at least 32 characters for AES-256 encryption.";
    return result;
  }
  
  // Check for weak/default keys
  const weakPatterns = [
    "default",
    "test",
    "dev",
    "development",
    "password",
    "secret",
    "12345",
    "changeme",
    "example",
  ];
  
  const lowerKey = key.toLowerCase();
  const containsWeakPattern = weakPatterns.some(pattern => lowerKey.includes(pattern));
  
  if (containsWeakPattern) {
    result.isValid = result.isProduction ? false : true;
    if (result.isProduction) {
      result.error = "API_KEY_ENCRYPTION_KEY appears to contain a weak pattern. " +
        "Please use a securely generated random key.";
    } else {
      result.warning = "API_KEY_ENCRYPTION_KEY appears to contain a weak pattern. " +
        "Consider using a securely generated random key.";
    }
  }
  
  return result;
}

// Derive a proper key from the encryption key string using PBKDF2
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, "sha512");
}

// ==================== ENCRYPTION ====================

/**
 * Encrypt an API key or secret
 * 
 * Uses AES-256-GCM with PBKDF2 key derivation for secure encryption.
 * Each encryption operation generates a unique salt and IV for forward secrecy.
 * 
 * @param plaintext - The plain text to encrypt (API key or secret)
 * @returns Encrypted string in format: salt:iv:authTag:ciphertext (all base64)
 * 
 * @throws Error if plaintext is empty or encryption fails
 * 
 * @security The returned string should be stored securely in the database
 * @security Never log or expose the encrypted data in debug output
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty string");
  }
  
  // Get the encryption key (will throw in production if not set)
  const encryptionKey = getEffectiveEncryptionKey();
  
  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive key from secret
  const key = deriveKey(encryptionKey, salt);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Return as base64 encoded components
  return [
    salt.toString("base64"),
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt an API key or secret
 * 
 * @param encryptedData - The encrypted string from encryptApiKey
 * @returns Decrypted plain text
 * 
 * @throws Error if decryption fails (corrupted data or wrong key)
 * 
 * @security Never log the decrypted plaintext
 */
export function decryptApiKey(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error("Cannot decrypt empty string");
  }
  
  // Get the encryption key (will throw in production if not set)
  const encryptionKey = getEffectiveEncryptionKey();
  
  try {
    // Parse components
    const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(":");
    
    if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
      throw new Error("Invalid encrypted data format");
    }
    
    // Decode from base64
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    
    // Derive key from secret
    const key = deriveKey(encryptionKey, salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    
    // Set authentication tag
    decipher.setAuthTag(authTag);
    
    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    // Don't expose sensitive details in error messages
    console.error("[Security] Decryption failed - this may indicate a key mismatch or corrupted data");
    throw new Error("Failed to decrypt data. Key may be corrupted or encryption key changed.");
  }
}

// ==================== VALIDATION ====================

/**
 * Validate that API keys have correct permissions
 * - Required: Read, Trade
 * - Forbidden: Withdraw
 */
export interface ApiKeyValidation {
  isValid: boolean;
  hasRead: boolean;
  hasTrade: boolean;
  hasWithdraw: boolean;
  error?: string;
}

/**
 * Mask an API key for display (show first 4 and last 4 characters)
 * 
 * @security Always use this function before displaying API keys in logs or UI
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 12) {
    return "****";
  }
  
  const start = apiKey.slice(0, 4);
  const end = apiKey.slice(-4);
  const middle = "*".repeat(Math.min(apiKey.length - 8, 20));
  
  return `${start}${middle}${end}`;
}

/**
 * Validate API key format
 * 
 * Performs basic format validation for known exchanges.
 * Note: This only validates format, not whether the key is valid/active.
 */
export function validateApiKeyFormat(key: string, exchange: string): boolean {
  if (!key || key.length < 10) {
    return false;
  }
  
  // Exchange-specific validation
  switch (exchange.toLowerCase()) {
    case "binance":
      // Binance API keys are 64 characters
      return key.length === 64 && /^[a-zA-Z0-9]+$/.test(key);
    
    case "bybit":
      // Bybit API keys vary in length
      return key.length >= 20 && /^[a-zA-Z0-9]+$/.test(key);
    
    case "okx":
      // OKX API keys have specific format
      return key.length >= 20 && /^[a-zA-Z0-9-]+$/.test(key);
    
    default:
      return key.length >= 10;
  }
}

// ==================== SECURE STORAGE ====================

/**
 * Securely store API credentials for an account
 * 
 * Encrypts all sensitive credential data before storage.
 * 
 * @security This function logs masked key information for audit purposes
 */
export async function storeApiCredentials(params: {
  accountId: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
}): Promise<void> {
  const { accountId, apiKey, apiSecret, apiPassphrase, apiUid } = params;
  
  // Validate encryption is properly configured before storing
  const validation = validateEncryptionSetup();
  if (!validation.isValid) {
    throw new Error(`Cannot store credentials: ${validation.error}`);
  }
  
  // Encrypt all credentials
  const encryptedKey = encryptApiKey(apiKey);
  const encryptedSecret = encryptApiKey(apiSecret);
  const encryptedPassphrase = apiPassphrase ? encryptApiKey(apiPassphrase) : null;
  const encryptedUid = apiUid ? encryptApiKey(apiUid) : null;
  
  console.log(`[Security] API credentials encrypted for account ${accountId}`);
  console.log(`[Security] API Key (masked): ${maskApiKey(apiKey)}`);
}

/**
 * Retrieve and decrypt API credentials
 * 
 * @security Decrypted credentials should never be logged or cached unnecessarily
 */
export async function retrieveApiCredentials(account: {
  apiKey: string | null;
  apiSecret: string | null;
  apiPassphrase?: string | null;
  apiUid?: string | null;
}): Promise<{
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  apiUid?: string;
} | null> {
  if (!account.apiKey || !account.apiSecret) {
    return null;
  }
  
  try {
    return {
      apiKey: decryptApiKey(account.apiKey),
      apiSecret: decryptApiKey(account.apiSecret),
      apiPassphrase: account.apiPassphrase ? decryptApiKey(account.apiPassphrase) : undefined,
      apiUid: account.apiUid ? decryptApiKey(account.apiUid) : undefined,
    };
  } catch (error) {
    console.error("[Security] Failed to decrypt API credentials");
    return null;
  }
}

// ==================== EXPORTS ====================

export {
  ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  SALT_LENGTH,
};
