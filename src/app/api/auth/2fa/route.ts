/**
 * Two-Factor Authentication API Routes
 * 
 * Endpoints:
 * - POST /api/auth/2fa - Setup, verify, enable, disable 2FA
 * - GET /api/auth/2fa - Get 2FA status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTwoFactorAuthService } from '@/lib/auth/two-factor-auth';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth-utils';

// ==================== TYPES ====================

interface SetupRequest {
  action: 'setup';
  password?: string;
}

interface VerifyRequest {
  action: 'verify';
  code: string;
  isBackupCode?: boolean;
}

interface EnableRequest {
  action: 'enable';
  code: string;
  secret: string;
  backupCodes: string[];
}

interface DisableRequest {
  action: 'disable';
  password?: string;
  code?: string;
}

interface BackupCodesRequest {
  action: 'backup-codes';
}

type RequestBody = SetupRequest | VerifyRequest | EnableRequest | DisableRequest | BackupCodesRequest;

// ==================== ROUTES ====================

/**
 * GET /api/auth/2fa
 * Get 2FA status
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await auth.getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const backupCodes = user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes) : [];

    return NextResponse.json({
      enabled: user.twoFactorEnabled || false,
      enabledAt: user.twoFactorEnabledAt,
      remainingBackupCodes: backupCodes.length,
    });
  } catch (error) {
    console.error('[2FA Status] Error:', error);
    return NextResponse.json({ error: 'Failed to get 2FA status' }, { status: 500 });
  }
}

/**
 * POST /api/auth/2fa
 * Handle 2FA actions based on 'action' field
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await auth.getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: RequestBody = await request.json();
    const { action } = body;

    switch (action) {
      case 'setup':
        return handleSetup(userId);
      case 'verify':
        return handleVerify(userId, body as VerifyRequest);
      case 'enable':
        return handleEnable(userId, body as EnableRequest);
      case 'disable':
        return handleDisable(userId);
      case 'backup-codes':
        return handleBackupCodes(userId);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[2FA] Error:', error);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}

// ==================== HANDLERS ====================

async function handleSetup(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const twoFactorService = getTwoFactorAuthService();
  const setup = twoFactorService.generateSetup(userId, user.email);

  return NextResponse.json({
    secret: setup.secret,
    uri: setup.uri,
    qrCodeUrl: setup.qrCodeUrl,
    backupCodes: setup.backupCodes,
  });
}

async function handleVerify(userId: string, body: VerifyRequest) {
  const { code, isBackupCode } = body;

  if (!code) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorSecret) {
    return NextResponse.json({ error: '2FA not setup' }, { status: 400 });
  }

  const twoFactorService = getTwoFactorAuthService();

  // Check lockout
  const lockoutStatus = twoFactorService.isLockedOut(userId);
  if (lockoutStatus.locked) {
    return NextResponse.json({
      error: 'Account locked due to too many failed attempts',
      lockoutExpiry: lockoutStatus.expiry,
    }, { status: 403 });
  }

  // Decrypt secret
  const secret = twoFactorService.decryptSecretFromStorage(user.twoFactorSecret);

  // Verify code
  if (isBackupCode) {
    // Verify backup code
    const backupCodes = user.twoFactorBackupCodes ? JSON.parse(user.twoFactorBackupCodes) : [];
    const codeIndex = twoFactorService.verifyBackupCode(backupCodes, code);
    
    if (codeIndex === -1) {
      const result = twoFactorService.recordFailedAttempt(userId);
      return NextResponse.json(result, { status: 400 });
    }

    // Remove used backup code
    backupCodes.splice(codeIndex, 1);
    await db.user.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: JSON.stringify(backupCodes) },
    });

    twoFactorService.clearFailedAttempts(userId);
    
    return NextResponse.json({
      success: true,
      usedBackupCode: true,
      remainingBackupCodes: backupCodes.length,
    });
  } else {
    // Verify TOTP code
    const isValid = twoFactorService.verifyCode(secret, code);
    
    if (!isValid) {
      const result = twoFactorService.recordFailedAttempt(userId);
      return NextResponse.json(result, { status: 400 });
    }

    twoFactorService.clearFailedAttempts(userId);
    
    return NextResponse.json({ success: true });
  }
}

async function handleEnable(userId: string, body: EnableRequest) {
  const { code, secret, backupCodes } = body;

  if (!code || !secret || !backupCodes) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const twoFactorService = getTwoFactorAuthService();

  // Verify the setup code
  const isValid = twoFactorService.verifyCode(secret, code);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
  }

  // Encrypt and store secret
  const encryptedSecret = twoFactorService.encryptSecretForStorage(secret);
  const hashedBackupCodes = twoFactorService.hashBackupCodesForStorage(backupCodes);

  // Update user with 2FA enabled
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
      twoFactorBackupCodes: JSON.stringify(hashedBackupCodes),
      twoFactorEnabledAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: '2FA enabled successfully',
  });
}

async function handleDisable(userId: string) {
  // TODO: Verify password and 2FA code before disabling

  // For now, just disable
  await db.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
      twoFactorEnabledAt: null,
    },
  });

  return NextResponse.json({
    success: true,
    message: '2FA disabled successfully',
  });
}

async function handleBackupCodes(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled) {
    return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
  }

  const twoFactorService = getTwoFactorAuthService();
  
  // Generate 8 new backup codes
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
  const newCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    let code = '';
    for (let j = 0; j < 8; j++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    newCodes.push(code);
  }
  
  const backupCodes = twoFactorService.hashBackupCodesForStorage(newCodes);

  await db.user.update({
    where: { id: userId },
    data: { twoFactorBackupCodes: JSON.stringify(backupCodes) },
  });

  return NextResponse.json({
    success: true,
    backupCodes: newCodes,
  });
}
