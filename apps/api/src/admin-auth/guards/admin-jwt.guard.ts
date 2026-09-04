import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { AdminJwtPayload } from '../admin-auth.types';
import { AdminTokenRevocationService } from '../admin-token-revocation.service';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly revocation: AdminTokenRevocationService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AdminJwtPayload }>();

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    // Only signature verification belongs in the try. The checks below are
    // distinct failures, and wrapping them meant every one of them surfaced
    // as "Invalid or expired token" — which made this impossible to debug.
    let payload: AdminJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminJwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (await this.revocation.isRevoked(payload.sub, payload.iat)) {
      throw new UnauthorizedException('Session revoked — please sign in again');
    }

    request.user = payload;
    return true;
  }
}