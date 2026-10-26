import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { AgentJwtPayload, AgentRefreshSession } from '../agent-auth.types';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AgentJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & { user?: AgentJwtPayload }
    >();

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AgentJwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (payload.type !== 'agent' || !payload.sessionId) {
        throw new UnauthorizedException('Invalid token type');
      }

      const [session, agent] = await Promise.all([
        this.redis.getJson<AgentRefreshSession>(`auth:agent:refresh-session:${payload.sessionId}`),
        this.prisma.agent.findUnique({
          where: { agentId: payload.sub },
          select: { status: true },
        }),
      ]);
      if (!session || session.agentId !== payload.sub ||
          !agent || agent.status === 'SUSPENDED' || agent.status === 'TERMINATED') {
        throw new UnauthorizedException('Agent session has been revoked');
      }

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}