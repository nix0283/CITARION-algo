/**
 * Two-Factor Authentication (2FA) Service
 * 
 * Implements TOTP (Time-based One-Time Password) authentication
 * using RFC 6238 standard, compatible with Google Authenticator,
 * Authy, and other authenticator apps.
 * 
 * Features:
 * - TOTP secret generation
 * - QR code generation for easy setup
 * - Code verification with configurable window
 * - Backup codes for recovery
 * - Rate limiting for failed attempts
 * - Device trust management
 */

import * as crypto from 'crypto';

// ==================== TYPES ====================

export interface TwoFactorConfig {
  /** Issuer name shown in authenticator app */
  issuer: string;
  
  /** Algorithm for TOTP (SHA-1, SHA-256, SHA-512) */
  algorithm: 'sha1' | 'sha256' | 'sha512';
  
  /** Number of digits in TOTP code (6 or 8) */
  digits: 6 | 8;
  
  /** Time step in seconds (default: 30) */
  period: number;
  
  /** Window for verification (allows codes from X steps before/after) */
  window: number;
  
  /** Max failed attempts before lockout */
  maxFailedAttempts: number;
  
  /** Lockout duration in minutes */
  lockoutDurationMinutes: number;
}

export interface TwoFactorSecret {
  /** Base32 encoded secret */
  secret: string;
  
  /** URI for QR code */
  uri: string;
  
  /** QR code URL (can be used with QR code APIs) */
  qrCodeUrl: string;
  
  /** Backup codes */
  backupCodes: string[];
}

export interface TwoFactorSetup {
  /** User ID */
  userId: string;
  
  /** Secret (encrypted) */
  encryptedSecret: string;
  
  /** Backup codes (hashed) */
  hashedBackupCodes: string[];
  
  /** Setup timestamp */
  createdAt: Date;
  
  /** Whether setup is complete */
  isVerified: boolean;
}

export interface TwoFactorStatus {
  /** Whether 2FA is enabled */
  enabled: boolean;
  
  /** Whether setup is complete */
  verified: boolean;
  
  /** When 2FA was enabled */
  enabledAt?: Date;
  
  /** Number of trusted devices */
  trustedDevicesCount: number;
  
  /** Number of remaining backup codes */
  remainingBackupCodes: number;
}

export interface VerificationResult {
  /** Whether verification succeeded */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** Whether a backup code was used */
  usedBackupCode?: boolean;
  
  /** Remaining attempts */
  remainingAttempts?: number;
  
  /** Whether account is locked */
  locked?: boolean;
  
  /** Lockout expiry time */
  lockoutExpiry?: Date;
}

export interface TrustedDevice {
  /** Device ID */
  id: string;
  
  /** Device name */
  name: string;
  
  /** User agent string */
  userAgent: string;
  
  /** IP address */
  ipAddress: string;
  
  /** When device was trusted */
  trustedAt: Date;
  
  /** Token for device verification */
  token: string;
  
  /** Expiry date */
  expiresAt: Date;
}

// ==================== DEFAULT CONFIG ====================

const DEFAULT_2FA_CONFIG: TwoFactorConfig = {
  issuer: 'CITARION',
  algorithm: 'sha1',
  digits: 6,
  period: 30,
  window: 1,
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
};

// Base32 alphabet for secret encoding
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate a random Base32 secret
 */
function generateBase32Secret(length: number = 20): string {
  const bytes = crypto.randomBytes(length);
  let secret = '';
  
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[bytes[i] % 32];
  }
  
  return secret;
}

/**
 * Generate backup codes
 */
function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  
  return codes;
}

/**
 * Hash a backup code
 */
function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Encode secret to Base32
 */
function base32Encode(buffer: Buffer): string {
  let bits = '';
  let result = '';
  
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  
  return result;
}

/**
 * Decode Base32 string to buffer
 */
function base32Decode(str: string): Buffer {
  let bits = '';
  
  for (const char of str.toUpperCase()) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  
  return Buffer.from(bytes);
}

/**
 * Get current time step
 */
function getTimeStep(period: number): number {
  return Math.floor(Date.now() / 1000 / period);
}

/**
 * Generate TOTP code for a given time step
 */
function generateTOTP(
  secret: string,
  timeStep: number,
  algorithm: string,
  digits: number,
  period: number
): string {
  const secretBuffer = base32Decode(secret);
  const timeBuffer = Buffer.alloc(8);
  
  // Write time step as 64-bit big-endian integer
  timeBuffer.writeBigInt64BE(BigInt(timeStep), 0);
  
  // HMAC calculation
  const hmac = crypto.createHmac(algorithm, secretBuffer);
  hmac.update(timeBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code = hash.readUInt32BE(offset) & 0x7fffffff;
  
  // Get the last 'digits' digits
  return (code % Math.pow(10, digits)).toString().padStart(digits, '0');
}

/**
 * Generate OTP Auth URI
 */
function generateOtpAuthUri(
  secret: string,
  email: string,
  issuer: string,
  algorithm: string,
  digits: number,
  period: number
): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: algorithm.toUpperCase(),
    digits: digits.toString(),
    period: period.toString(),
  });
  
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params.toString()}`;
}

/**
 * Encrypt secret using AES-256-GCM
 */
function encryptSecret(secret: string, encryptionKey: string): string {
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt secret using AES-256-GCM
 */
function decryptSecret(encrypted: string, encryptionKey: string): string {
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const parts = encrypted.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }
  
  const [ivHex, authTagHex, data] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// ==================== TWO FACTOR SERVICE CLASS ====================

/**
 * Two-Factor Authentication Service
 */
export class TwoFactorAuthService {
  private config: TwoFactorConfig;
  private encryptionKey: string;
  
  // In-memory storage for failed attempts (use Redis in production)
  private failedAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();
  
  constructor(config: Partial<TwoFactorConfig> = {}, encryptionKey?: string) {
    this.config = { ...DEFAULT_2FA_CONFIG, ...config };
    this.encryptionKey = encryptionKey || process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
  }
  
  /**
   * Generate a new 2FA setup for a user
   * 
   * @param userId - User ID
   * @param email - User email for authenticator app
   * @returns Two factor setup data including secret and backup codes
   */
  generateSetup(userId: string, email: string): TwoFactorSecret {
    // Generate secret
    const secret = generateBase32Secret(20);
    
    // Generate backup codes
    const backupCodes = generateBackupCodes(8);
    
    // Generate URI
    const uri = generateOtpAuthUri(
      secret,
      email,
      this.config.issuer,
      this.config.algorithm,
      this.config.digits,
      this.config.period
    );
    
    // Generate QR code URL (using Google Charts API or similar)
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(uri)}&choe=UTF-8`;
    
    return {
      secret,
      uri,
      qrCodeUrl,
      backupCodes,
    };
  }
  
  /**
   * Verify a TOTP code
   * 
   * @param secret - The user's 2FA secret
   * @param code - The code to verify
   * @returns Whether the code is valid
   */
  verifyCode(secret: string, code: string): boolean {
    if (!code || code.length !== this.config.digits) {
      return false;
    }
    
    const currentTimeStep = getTimeStep(this.config.period);
    
    // Check codes within the window
    for (let i = -this.config.window; i <= this.config.window; i++) {
      const expectedCode = generateTOTP(
        secret,
        currentTimeStep + i,
        this.config.algorithm,
        this.config.digits,
        this.config.period
      );
      
      if (code === expectedCode) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Verify a backup code
   * 
   * @param hashedCodes - Array of hashed backup codes
   * @param code - The code to verify
   * @returns Index of the used code, or -1 if invalid
   */
  verifyBackupCode(hashedCodes: string[], code: string): number {
    const hashedInput = hashBackupCode(code);
    return hashedCodes.indexOf(hashedInput);
  }
  
  /**
   * Encrypt secret for storage
   */
  encryptSecretForStorage(secret: string): string {
    return encryptSecret(secret, this.encryptionKey);
  }
  
  /**
   * Decrypt secret from storage
   */
  decryptSecretFromStorage(encrypted: string): string {
    return decryptSecret(encrypted, this.encryptionKey);
  }
  
  /**
   * Hash backup codes for storage
   */
  hashBackupCodesForStorage(codes: string[]): string[] {
    return codes.map(code => hashBackupCode(code));
  }
  
  /**
   * Record a failed verification attempt
   * 
   * @param userId - User ID
   * @returns Verification result with lockout info if applicable
   */
  recordFailedAttempt(userId: string): VerificationResult {
    const attempts = this.failedAttempts.get(userId) || { count: 0 };
    attempts.count++;
    
    if (attempts.count >= this.config.maxFailedAttempts) {
      const lockedUntil = new Date(
        Date.now() + this.config.lockoutDurationMinutes * 60 * 1000
      );
      attempts.lockedUntil = lockedUntil;
      this.failedAttempts.set(userId, attempts);
      
      return {
        success: false,
        error: 'Too many failed attempts. Account locked.',
        locked: true,
        lockoutExpiry: lockedUntil,
      };
    }
    
    this.failedAttempts.set(userId, attempts);
    
    return {
      success: false,
      error: `Invalid code. ${this.config.maxFailedAttempts - attempts.count} attempts remaining.`,
      remainingAttempts: this.config.maxFailedAttempts - attempts.count,
    };
  }
  
  /**
   * Check if user is locked out
   */
  isLockedOut(userId: string): { locked: boolean; expiry?: Date } {
    const attempts = this.failedAttempts.get(userId);
    
    if (!attempts || !attempts.lockedUntil) {
      return { locked: false };
    }
    
    if (new Date() < attempts.lockedUntil) {
      return { locked: true, expiry: attempts.lockedUntil };
    }
    
    // Lockout expired, clear it
    this.failedAttempts.delete(userId);
    return { locked: false };
  }
  
  /**
   * Clear failed attempts after successful verification
   */
  clearFailedAttempts(userId: string): void {
    this.failedAttempts.delete(userId);
  }
  
  /**
   * Generate a trusted device token
   */
  generateTrustedDeviceToken(): { token: string; expiresAt: Date } {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    return { token, expiresAt };
  }
  
  /**
   * Get current TOTP code (for testing/display purposes)
   */
  getCurrentCode(secret: string): string {
    return generateTOTP(
      secret,
      getTimeStep(this.config.period),
      this.config.algorithm,
      this.config.digits,
      this.config.period
    );
  }
  
  /**
   * Get time remaining for current code
   */
  getTimeRemaining(): number {
    const period = this.config.period;
    return period - (Math.floor(Date.now() / 1000) % period);
  }
  
  /**
   * Validate backup code format
   */
  isValidBackupCodeFormat(code: string): boolean {
    return /^[A-F0-9]{8}$/.test(code);
  }
  
  /**
   * Get config
   */
  getConfig(): TwoFactorConfig {
    return { ...this.config };
  }
}

// ==================== SINGLETON INSTANCE ====================

let twoFactorAuthService: TwoFactorAuthService | null = null;

export function getTwoFactorAuthService(config?: Partial<TwoFactorConfig>): TwoFactorAuthService {
  if (!twoFactorAuthService) {
    twoFactorAuthService = new TwoFactorAuthService(config);
  }
  return twoFactorAuthService;
}

export function createTwoFactorAuthService(config?: Partial<TwoFactorConfig>): TwoFactorAuthService {
  return new TwoFactorAuthService(config);
}

// ==================== EXPORTS ====================

export default TwoFactorAuthService;
