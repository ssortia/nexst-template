import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import type { VerificationTokenType } from '@prisma/client';

import { msDurationToSeconds } from '../common/duration';
import { getEnv } from '../config/env';

import { VerificationRepository } from './verification.repository';

/** Хэширование plain-токена для хранения: в БД попадает только sha256-хэш. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class VerificationService {
  constructor(private readonly repository: VerificationRepository) {}

  /**
   * Выпускает одноразовый токен заданного типа для пользователя.
   * Старые токены того же типа инвалидируются (одна активная ссылка на тип).
   * Возвращает plain-токен — он уходит пользователю, в БД хранится только хэш.
   */
  async issue(userId: string, type: VerificationTokenType): Promise<string> {
    await this.repository.deleteByUserAndType(userId, type);

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.ttlSeconds(type) * 1000);

    await this.repository.create({
      user: { connect: { id: userId } },
      type,
      tokenHash: hashToken(token),
      expiresAt,
    });

    return token;
  }

  /**
   * Проверяет и «гасит» токен: ищет по хэшу, валидирует тип и срок,
   * удаляет (одноразовость) и возвращает userId. Бросает при невалидном/просроченном.
   */
  async consume(token: string, type: VerificationTokenType): Promise<string> {
    const record = await this.repository.findByTokenHash(hashToken(token));
    if (!record || record.type !== type) {
      throw new BadRequestException('Invalid token');
    }

    // Просроченный токен удаляем сразу, чтобы не копить мусор в БД.
    if (record.expiresAt.getTime() <= Date.now()) {
      await this.repository.deleteById(record.id);
      throw new BadRequestException('Token expired');
    }

    await this.repository.deleteById(record.id);
    return record.userId;
  }

  private ttlSeconds(type: VerificationTokenType): number {
    const env = getEnv();
    const ttl = type === 'EMAIL_VERIFICATION' ? env.EMAIL_VERIFICATION_TTL : env.PASSWORD_RESET_TTL;
    return msDurationToSeconds(ttl);
  }
}
