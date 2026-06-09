// env читается лениво в getEnv; задаём переменные до импорта сервиса.
process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5432/db';
process.env['JWT_SECRET'] = 'x'.repeat(32);
process.env['JWT_REFRESH_SECRET'] = 'y'.repeat(32);
process.env['EMAIL_VERIFICATION_TTL'] = '24h';
process.env['PASSWORD_RESET_TTL'] = '1h';

import { ConflictException } from '@nestjs/common';

// eslint-disable-next-line import/first
import { AuthService } from './auth.service';
// eslint-disable-next-line import/first
import type { MailerService } from '../mailer/mailer.service';
// eslint-disable-next-line import/first
import type { UsersService } from '../users/users.service';
// eslint-disable-next-line import/first
import type { VerificationService } from '../verification/verification.service';

describe('AuthService', () => {
  let usersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
    updateRefreshToken: jest.Mock;
    markEmailVerified: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let verificationService: { issue: jest.Mock; consume: jest.Mock };
  let mailerService: { sendVerificationEmail: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('token') };
    verificationService = {
      issue: jest.fn().mockResolvedValue('plain-token'),
      consume: jest.fn(),
    };
    mailerService = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      usersService as unknown as UsersService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jwtService as any,
      verificationService as unknown as VerificationService,
      mailerService as unknown as MailerService,
    );
  });

  describe('register', () => {
    it('выпускает токен верификации и отправляет письмо, при этом логинит', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'USER' });

      const tokens = await service.register('a@b.com', 'password123');

      expect(verificationService.issue).toHaveBeenCalledWith('u1', 'EMAIL_VERIFICATION');
      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 'plain-token');
      // Логин по-прежнему происходит — возвращаются токены.
      expect(tokens).toEqual({ accessToken: 'token', refreshToken: 'token' });
    });

    it('бросает ConflictException и не шлёт письмо, если email занят', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'u1' });

      await expect(service.register('a@b.com', 'password123')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(mailerService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('гасит токен и помечает email подтверждённым', async () => {
      verificationService.consume.mockResolvedValue('u1');

      await service.verifyEmail('plain-token');

      expect(verificationService.consume).toHaveBeenCalledWith('plain-token', 'EMAIL_VERIFICATION');
      expect(usersService.markEmailVerified).toHaveBeenCalledWith('u1');
    });

    it('пробрасывает ошибку при невалидном токене и не трогает пользователя', async () => {
      verificationService.consume.mockRejectedValue(new Error('Invalid token'));

      await expect(service.verifyEmail('bad')).rejects.toThrow('Invalid token');
      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    it('отправляет письмо, если пользователь существует и не подтверждён', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        emailVerified: false,
      });

      await service.resendVerification('a@b.com');

      expect(mailerService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 'plain-token');
    });

    it('не раскрывает существование: для несуществующего email — тихий no-op', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.resendVerification('missing@b.com')).resolves.toBeUndefined();
      expect(mailerService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('не шлёт письмо повторно уже подтверждённому пользователю', async () => {
      usersService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        emailVerified: true,
      });

      await service.resendVerification('a@b.com');

      expect(mailerService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });
});
