import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { User } from '@prisma/client';

/**
 * Пропускает только пользователей с подтверждённым email.
 * Применяется к маршрутам, требующим верификации почты, поверх JwtAuthGuard.
 */
@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: User }>();

    if (request.user?.emailVerified === false) {
      throw new ForbiddenException('EmailNotVerified');
    }

    return true;
  }
}
