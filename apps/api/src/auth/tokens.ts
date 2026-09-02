import { createHash, randomUUID } from 'node:crypto';

import {
  importPKCS8,
  importSPKI,
  jwtVerify,
  generateKeyPair,
  SignJWT,
  type CryptoKey as JoseCryptoKey,
  type JWTPayload,
} from 'jose';

import type { Role } from './capabilities.js';

interface TokenConfiguration {
  accessPrivateKey: JoseCryptoKey;
  accessPublicKey: JoseCryptoKey;
  accessTtl: string;
  audience: string;
  issuer: string;
  refreshPrivateKey: JoseCryptoKey;
  refreshPublicKey: JoseCryptoKey;
  refreshTtl: string;
}

interface AccessClaims extends JWTPayload {
  role: Role;
  type: 'access';
}

interface RefreshClaims extends JWTPayload {
  jti: string;
  type: 'refresh';
}

export class TokenService {
  public constructor(private readonly configuration: TokenConfiguration) {}

  public static async fromPem(input: {
    accessPrivateKey: string;
    accessPublicKey: string;
    accessTtl: string;
    audience: string;
    issuer: string;
    refreshPrivateKey: string;
    refreshPublicKey: string;
    refreshTtl: string;
  }): Promise<TokenService> {
    return new TokenService({
      ...input,
      accessPrivateKey: await importPKCS8(input.accessPrivateKey, 'EdDSA'),
      accessPublicKey: await importSPKI(input.accessPublicKey, 'EdDSA'),
      refreshPrivateKey: await importPKCS8(input.refreshPrivateKey, 'EdDSA'),
      refreshPublicKey: await importSPKI(input.refreshPublicKey, 'EdDSA'),
    });
  }

  public static async forDevelopment(input: {
    accessTtl: string;
    audience: string;
    issuer: string;
    refreshTtl: string;
  }): Promise<TokenService> {
    const access = await generateKeyPair('EdDSA');
    const refresh = await generateKeyPair('EdDSA');
    return new TokenService({
      ...input,
      accessPrivateKey: access.privateKey,
      accessPublicKey: access.publicKey,
      refreshPrivateKey: refresh.privateKey,
      refreshPublicKey: refresh.publicKey,
    });
  }

  public async createAccessToken(user: { id: string; role: Role }): Promise<string> {
    return new SignJWT({ role: user.role, type: 'access' })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(this.configuration.issuer)
      .setAudience(this.configuration.audience)
      .setIssuedAt()
      .setExpirationTime(this.configuration.accessTtl)
      .sign(this.configuration.accessPrivateKey);
  }

  public async createRefreshToken(userId: string): Promise<{ jti: string; token: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({ type: 'refresh' })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setJti(jti)
      .setSubject(userId)
      .setIssuer(this.configuration.issuer)
      .setAudience(this.configuration.audience)
      .setIssuedAt()
      .setExpirationTime(this.configuration.refreshTtl)
      .sign(this.configuration.refreshPrivateKey);
    return { jti, token };
  }

  public verifyAccessToken(token: string): Promise<AccessClaims> {
    return this.verify(
      token,
      this.configuration.accessPublicKey,
      'access',
    ) as Promise<AccessClaims>;
  }

  public verifyRefreshToken(token: string): Promise<RefreshClaims> {
    return this.verify(
      token,
      this.configuration.refreshPublicKey,
      'refresh',
    ) as Promise<RefreshClaims>;
  }

  private async verify(
    token: string,
    key: JoseCryptoKey,
    type: 'access' | 'refresh',
  ): Promise<JWTPayload> {
    const result = await jwtVerify(token, key, {
      algorithms: ['EdDSA'],
      audience: this.configuration.audience,
      issuer: this.configuration.issuer,
    });
    if (result.payload.type !== type || result.payload.sub === undefined)
      throw new Error('Invalid token type.');
    return result.payload;
  }
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
