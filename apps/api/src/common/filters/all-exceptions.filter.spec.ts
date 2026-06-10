import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'nestjs-pino';

import { AllExceptionsFilter } from './all-exceptions.filter';

interface ReplyMock {
  reply: FastifyReply;
  status: jest.Mock;
  send: jest.Mock;
}

function createReply(sent = false): ReplyMock {
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  const reply = { sent, status, send } as unknown as FastifyReply;
  return { reply, status, send };
}

function createHost(reply: FastifyReply): ArgumentsHost {
  const request = { url: '/test' } as FastifyRequest;
  return {
    switchToHttp: () => ({
      getResponse: <T>() => reply as unknown as T,
      getRequest: <T>() => request as unknown as T,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let logger: { error: jest.Mock };

  beforeEach(() => {
    logger = { error: jest.fn() };
    filter = new AllExceptionsFilter(logger as unknown as Logger);
  });

  function run(exception: unknown, sent = false): ReplyMock {
    const mock = createReply(sent);
    filter.catch(exception, createHost(mock.reply));
    return mock;
  }

  it('маппит HttpException (403) в тело', () => {
    const { status, send } = run(new ForbiddenException('Доступ запрещён'));

    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(send).toHaveBeenCalledWith({
      statusCode: HttpStatus.FORBIDDEN,
      message: 'Доступ запрещён',
    });
  });

  it('отдаёт ошибку валидации как generic message + details[]', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['email must be an email', 'password is too short'],
      error: 'Bad Request',
    });

    const { status, send } = run(exception);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(send).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Ошибка валидации',
      details: ['email must be an email', 'password is too short'],
    });
  });

  it('маппит Prisma P2002 в 409', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });

    const { status, send } = run(exception);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(send.mock.calls[0][0].statusCode).toBe(HttpStatus.CONFLICT);
    expect(send.mock.calls[0][0].message).not.toContain('Unique');
  });

  it('маппит Prisma P2025 в 404', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    const { status } = run(exception);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('неизвестную ошибку отдаёт как 500 без утечки деталей и логирует', () => {
    const exception = new Error('SELECT * FROM secret_table failed');

    const { status, send } = run(exception);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = send.mock.calls[0][0];
    expect(body.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect(logger.error).toHaveBeenCalled();
  });

  it('не пишет в reply, если ответ уже отправлен', () => {
    const { status, send } = run(new ForbiddenException(), true);

    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
