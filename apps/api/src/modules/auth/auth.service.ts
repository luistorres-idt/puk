import type { SessionUser } from '@puk/contracts';

import type { PrismaClient, User } from '../../generated/prisma/client.js';
import { AppError } from '../../shared/errors.js';
import { verifyPassword } from '../../auth/password.js';
import { getOrderAccessMode } from '../../auth/order-access-policy.js';
import { hashRefreshToken, type TokenService } from '../../auth/tokens.js';

const INVALID_CREDENTIALS = new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

export class AuthService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
  ) {}

  public async login(input: {
    email: string;
    password: string;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
  }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (
      user === null ||
      !user.active ||
      !(await verifyPassword(user.passwordHash, input.password))
    ) {
      throw INVALID_CREDENTIALS;
    }

    const session = await this.issueSession(user, input.ipAddress, input.userAgent);
    await this.prisma.auditLog.create({
      data: {
        action: 'AUTH_LOGIN',
        actorUserId: user.id,
        entityId: user.id,
        entityType: 'User',
        ipAddress: input.ipAddress ?? null,
      },
    });
    return session;
  }

  public async refresh(
    token: string,
    input: { ipAddress?: string | undefined; userAgent?: string | undefined },
  ) {
    let claims: Awaited<ReturnType<TokenService['verifyRefreshToken']>>;
    try {
      claims = await this.tokens.verifyRefreshToken(token);
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The session is invalid or expired.');
    }

    const current = await this.prisma.refreshSession.findUnique({
      include: { user: true },
      where: { jti: claims.jti },
    });
    if (
      current === null ||
      current.tokenHash !== hashRefreshToken(token) ||
      current.expiresAt <= new Date()
    ) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'The session is invalid or expired.');
    }
    if (current.revokedAt !== null) {
      await this.prisma.refreshSession.updateMany({
        data: { revokedAt: new Date() },
        where: { userId: current.userId, revokedAt: null },
      });
      throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'The session was revoked.');
    }
    if (!current.user.active)
      throw new AppError(401, 'USER_INACTIVE', 'The session is no longer active.');

    const nextRefresh = await this.tokens.createRefreshToken(current.userId);
    const accessToken = await this.tokens.createAccessToken(current.user);
    const verifiedNext = await this.tokens.verifyRefreshToken(nextRefresh.token);

    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        data: { replacedByJti: nextRefresh.jti, revokedAt: new Date() },
        where: { id: current.id },
      }),
      this.prisma.refreshSession.create({
        data: {
          expiresAt: new Date(verifiedNext.exp! * 1000),
          ipAddress: input.ipAddress ?? null,
          jti: nextRefresh.jti,
          tokenHash: hashRefreshToken(nextRefresh.token),
          userAgent: input.userAgent ?? null,
          userId: current.userId,
        },
      }),
    ]);

    return {
      accessToken,
      refreshToken: nextRefresh.token,
      user: await this.sessionUser(current.user),
    };
  }

  public async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined) return;
    try {
      const claims = await this.tokens.verifyRefreshToken(refreshToken);
      await this.prisma.refreshSession.updateMany({
        data: { revokedAt: new Date() },
        where: { jti: claims.jti, revokedAt: null },
      });
    } catch {
      // Logout remains idempotent for an already invalid session.
    }
  }

  public async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      data: { revokedAt: new Date() },
      where: { userId, revokedAt: null },
    });
  }

  public async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null || !user.active)
      throw new AppError(401, 'USER_INACTIVE', 'The session is no longer active.');
    return this.sessionUser(user);
  }

  private async issueSession(user: User, ipAddress?: string, userAgent?: string) {
    const refresh = await this.tokens.createRefreshToken(user.id);
    const claims = await this.tokens.verifyRefreshToken(refresh.token);
    await this.prisma.refreshSession.create({
      data: {
        expiresAt: new Date(claims.exp! * 1000),
        ipAddress: ipAddress ?? null,
        jti: refresh.jti,
        tokenHash: hashRefreshToken(refresh.token),
        userAgent: userAgent ?? null,
        userId: user.id,
      },
    });
    return {
      accessToken: await this.tokens.createAccessToken(user),
      refreshToken: refresh.token,
      user: await this.sessionUser(user),
    };
  }

  private async sessionUser(user: User): Promise<SessionUser> {
    return {
      active: user.active,
      email: user.email,
      id: user.id,
      name: user.name,
      orderAccessMode: await getOrderAccessMode(this.prisma, user.id),
      role: user.role,
      technicianId: user.technicianId,
    };
  }
}
