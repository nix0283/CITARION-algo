/**
 * Security Utilities
 * Stage 3.4: Security audit implementation
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash, timingSafeEqual } from 'crypto'
import { env } from 'process'

// ============================================================================
// CONSTANTS
// ============================================================================

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32
const KEY_LENGTH = 32

// ============================================================================
// API KEY ENCRYPTION
// ============================================================================

export class ApiKeyEncryption {
  private key: Buffer

  constructor(masterKey?: string) {
    const key = masterKey || env.ENCRYPTION_KEY || 'citarion-default-key-change-in-production'
    this.key = scryptSync(key, 'citarion-salt-v1', KEY_LENGTH)
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format')
    }

    const [ivHex, authTagHex, encrypted] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = createDecipheriv(ALGORITHM, this.key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  encryptApiKey(apiKey: string, apiSecret: string, passphrase?: string): EncryptedApiKeys {
    return {
      apiKey: this.encrypt(apiKey),
      apiSecret: this.encrypt(apiSecret),
      passphrase: passphrase ? this.encrypt(passphrase) : undefined,
    }
  }

  decryptApiKey(encrypted: EncryptedApiKeys): DecryptedApiKeys {
    return {
      apiKey: this.decrypt(encrypted.apiKey),
      apiSecret: this.decrypt(encrypted.apiSecret),
      passphrase: encrypted.passphrase ? this.decrypt(encrypted.passphrase) : undefined,
    }
  }
}

export interface EncryptedApiKeys {
  apiKey: string
  apiSecret: string
  passphrase?: string
}

export interface DecryptedApiKeys {
  apiKey: string
  apiSecret: string
  passphrase?: string
}

// ============================================================================
// PASSWORD HASHING
// ============================================================================

export class PasswordHasher {
  private iterations: number
  private saltLength: number

  constructor(iterations: number = 100000, saltLength: number = 16) {
    this.iterations = iterations
    this.saltLength = saltLength
  }

  hash(password: string): string {
    const salt = randomBytes(this.saltLength).toString('hex')
    const hash = createHash('sha256')
      .update(password + salt)
      .digest('hex')

    return `${salt}:${hash}`
  }

  verify(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(':')
    if (!salt || !hash) return false

    const computedHash = createHash('sha256')
      .update(password + salt)
      .digest('hex')

    try {
      return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'))
    } catch {
      return false
    }
  }
}

// ============================================================================
// SESSION TOKEN GENERATION
// ============================================================================

export class TokenGenerator {
  static generateSessionToken(length: number = 32): string {
    return randomBytes(length).toString('hex')
  }

  static generateApiKey(): { key: string; secret: string } {
    const key = `ck_${randomBytes(16).toString('hex')}`
    const secret = `cs_${randomBytes(32).toString('hex')}`
    return { key, secret }
  }

  static generateVerificationCode(length: number = 6): string {
    const digits = '0123456789'
    let code = ''
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * digits.length)]
    }
    return code
  }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

export class InputValidator {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    return input
      .slice(0, maxLength)
      .replace(/[<>]/g, '') // Remove potential XSS
      .trim()
  }

  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email) && email.length <= 254
  }

  static validateSymbol(symbol: string): boolean {
    return /^[A-Z]{2,10}USDT?$/.test(symbol)
  }

  static validateExchange(exchange: string): boolean {
    const validExchanges = ['binance', 'bybit', 'okx', 'bitget', 'bingx']
    return validExchanges.includes(exchange.toLowerCase())
  }

  static validateApiKey(key: string): boolean {
    return key.length >= 16 && key.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(key)
  }

  static validatePositiveNumber(value: number, min: number = 0, max: number = Infinity): boolean {
    return typeof value === 'number' && !isNaN(value) && value > min && value <= max
  }

  static sanitizeObject<T extends Record<string, any>>(obj: T, schema: Record<keyof T, 'string' | 'number' | 'boolean'>): Partial<T> {
    const result: Partial<T> = {}

    for (const [key, type] of Object.entries(schema) as [keyof T, string][]) {
      if (obj[key] === undefined) continue

      switch (type) {
        case 'string':
          if (typeof obj[key] === 'string') {
            result[key] = this.sanitizeString(obj[key]) as T[keyof T]
          }
          break
        case 'number':
          if (typeof obj[key] === 'number' && !isNaN(obj[key])) {
            result[key] = obj[key]
          }
          break
        case 'boolean':
          if (typeof obj[key] === 'boolean') {
            result[key] = obj[key]
          }
          break
      }
    }

    return result
  }
}

// ============================================================================
// RATE LIMITER
// ============================================================================

export class RateLimiter {
  private requests: Map<string, number[]> = new Map()

  constructor(
    private maxRequests: number = 100,
    private windowMs: number = 60000
  ) {}

  isAllowed(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Get existing requests
    let requests = this.requests.get(identifier) || []

    // Filter out old requests
    requests = requests.filter(time => time > windowStart)

    if (requests.length < this.maxRequests) {
      requests.push(now)
      this.requests.set(identifier, requests)
      return {
        allowed: true,
        remaining: this.maxRequests - requests.length,
        resetAt: now + this.windowMs,
      }
    }

    // Find when the oldest request will expire
    const oldestRequest = Math.min(...requests)
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestRequest + this.windowMs,
    }
  }

  reset(identifier: string): void {
    this.requests.delete(identifier)
  }

  cleanup(): void {
    const now = Date.now()
    const windowStart = now - this.windowMs

    for (const [identifier, requests] of this.requests.entries()) {
      const filtered = requests.filter(time => time > windowStart)
      if (filtered.length === 0) {
        this.requests.delete(identifier)
      } else {
        this.requests.set(identifier, filtered)
      }
    }
  }
}

// ============================================================================
// AUDIT LOGGER
// ============================================================================

export interface AuditLogEntry {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, any>
  ipAddress?: string
  userAgent?: string
  result: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
  timestamp: Date
}

export class AuditLogger {
  private logs: AuditLogEntry[] = []
  private maxLogs: number = 10000

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    this.logs.push({
      ...entry,
      timestamp: new Date(),
    })

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  getLogs(filter?: {
    userId?: string
    action?: string
    resource?: string
    result?: 'SUCCESS' | 'FAILURE'
    since?: Date
  }): AuditLogEntry[] {
    return this.logs.filter(log => {
      if (filter?.userId && log.userId !== filter.userId) return false
      if (filter?.action && log.action !== filter.action) return false
      if (filter?.resource && log.resource !== filter.resource) return false
      if (filter?.result && log.result !== filter.result) return false
      if (filter?.since && log.timestamp < filter.since) return false
      return true
    })
  }

  getFailedAttempts(identifier: string, action: string, since: Date): number {
    return this.logs.filter(log =>
      log.resource === identifier &&
      log.action === action &&
      log.result === 'FAILURE' &&
      log.timestamp >= since
    ).length
  }
}

// ============================================================================
// IP WHITELIST
// ============================================================================

export class IpWhitelist {
  private whitelist: Set<string> = new Set()
  private enabled: boolean = false

  add(ip: string): void {
    this.whitelist.add(ip)
  }

  remove(ip: string): void {
    this.whitelist.delete(ip)
  }

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  isAllowed(ip: string): boolean {
    if (!this.enabled) return true
    return this.whitelist.has(ip)
  }

  getAll(): string[] {
    return Array.from(this.whitelist)
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const apiKeyEncryption = new ApiKeyEncryption()
export const passwordHasher = new PasswordHasher()
export const inputValidator = new InputValidator()
export const auditLogger = new AuditLogger()

export default {
  ApiKeyEncryption,
  PasswordHasher,
  TokenGenerator,
  InputValidator,
  RateLimiter,
  AuditLogger,
  IpWhitelist,
}
