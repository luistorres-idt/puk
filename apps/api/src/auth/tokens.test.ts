import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';

import { TokenService } from './tokens.js';

describe('TokenService', () => {
  it('issues typed access and refresh tokens with required claims', async () => {
    const access = await generateKeyPair('EdDSA', { extractable: true });
    const refresh = await generateKeyPair('EdDSA', { extractable: true });
    const service = await TokenService.fromPem({
      accessPrivateKey: await exportPKCS8(access.privateKey),
      accessPublicKey: await exportSPKI(access.publicKey),
      accessTtl: '5m',
      audience: 'test-web',
      issuer: 'test-api',
      refreshPrivateKey: await exportPKCS8(refresh.privateKey),
      refreshPublicKey: await exportSPKI(refresh.publicKey),
      refreshTtl: '1h',
    });

    const accessToken = await service.createAccessToken({ id: 'user-1', role: 'ADMIN' });
    await expect(service.verifyAccessToken(accessToken)).resolves.toMatchObject({
      aud: 'test-web',
      iss: 'test-api',
      role: 'ADMIN',
      sub: 'user-1',
      type: 'access',
    });
    const refreshToken = await service.createRefreshToken('user-1');
    await expect(service.verifyRefreshToken(refreshToken.token)).resolves.toMatchObject({
      jti: refreshToken.jti,
      sub: 'user-1',
      type: 'refresh',
    });
    await expect(service.verifyRefreshToken(accessToken)).rejects.toThrow();
  });
});
