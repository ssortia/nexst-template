# Стандартизированные ошибки API

## Overview

Сделать единый предсказуемый формат тела ошибки для всего `apps/api` через глобальный `ExceptionFilter` и подключить его на фронте в местах, где уже реализованы запросы к API.

Проблема: сейчас источники ошибок не согласованы — `HttpException` отдаёт `{ statusCode, message, error }`, ошибки валидации кладут `message` массивом, ошибки Prisma и неизвестные сбои улетают в сырой 500. На фронте `ApiError.message` — это весь сырой `res.text()` (JSON-блоб), формы вынуждены хардкодить строки по `status`.

Решение (минимальное, без RFC 7807 / Zod / расширения Swagger / per-field ошибок):

- единый shape тела: `{ statusCode: number, message: string }`;
- глобальный фильтр приводит к нему все источники: `HttpException` (массив `message` валидации склеивается в строку), Prisma (`P2002`→409, `P2025`→404), неизвестное → 500 без утечки деталей;
- фронтовый `ApiError` парсит этот shape и отдаёт чистый `.message` вместо сырого текста;
- существующие потребители на фронте сверяются с новым контрактом.

## Context (from discovery)

- Бэкенд:
  - `apps/api/src/main.ts` — bootstrap, `ValidationPipe` (нет `useGlobalFilters`)
  - `apps/api/src/common/` — общий код
  - явные исключения уже бросаются местами: `auth.service.ts:45` → `ConflictException`, контроллеры → `NotFoundException`
  - тесты Jest `*.spec.ts` рядом с кодом
- Фронт:
  - `apps/web/src/lib/api.ts` — `ApiError` (читает `res.text()`), хелперы `api.get/post/...`
  - потребители: `apps/web/src/api/{auth,users,audit}.api.ts`
  - формы инспектируют `err.status`: `register-form.tsx` (409), `reset-password-form.tsx` (400), `email-verification-banner.tsx`
  - unit-runner'а на фронте нет — только Playwright (`test:e2e`)
- Общий тип:
  - `packages/types/src/index.ts` реэкспортирует общие типы (используется и API, и web)

## Development Approach

- **testing approach**: Regular (код, потом тесты в том же таске)
- небольшие сфокусированные изменения, каждый таск завершать целиком
- **тесты обязательны в каждом таске** бэкенда (Jest); фронт покрывается e2e
- все тесты должны проходить перед следующим таском
- сохранять обратную совместимость по статус-кодам существующих эндпоинтов

## Testing Strategy

> Тесты живут только в `@repo/api` (Jest). `@repo/types` и `apps/web` своих unit-runner'ов не имеют; фронт проверяется Playwright (`test:e2e`).

- **unit (Jest, `@repo/api`)**: маппинг `HttpException` (включая валидацию с массивом `message` → строка), Prisma (`P2002`/`P2025`, ошибки конструируются вручную без БД), неизвестной ошибки (500, нет утечки в prod)
- **e2e (Playwright, `apps/web`)**: флоу с ошибкой (неверный логин) показывает корректное сообщение
- команды: `pnpm --filter @repo/api test`, `pnpm --filter @repo/web test:e2e`

## Progress Tracking

- `[x]` — выполнено сразу; `➕` — новая задача; `⚠️` — блокер
- держать план в синхроне с фактической работой

## Solution Overview

- **Формат тела** (общий TS-тип `ApiErrorBody` в `@repo/types`, без Zod):
  ```ts
  type ApiErrorBody = {
    statusCode: number;
    message: string; // всегда одна человекочитаемая строка
  };
  ```
- **Фильтр** `AllExceptionsFilter` (`@Catch()`, один файл в `common/filters/`):
  - `HttpException` → `status`, нормализованный `message` (если тело валидации даёт массив строк — склеить в одну строку);
  - `Prisma.PrismaClientKnownRequestError` → `P2002`→409, `P2025`→404, прочее→500 (safety net — явные исключения в коде остаются);
  - неизвестное → 500, generic `message`, без stack/SQL в теле; полная ошибка логируется через `Logger` (nestjs-pino);
  - Fastify: reply/request через `host.switchToHttp().getResponse<FastifyReply>()`; писать `reply.status(s).send(body)`; guard на `reply.sent`.
- **Валидация**: фабрика и `exceptionFactory` не нужны — фильтр обрабатывает дефолтный `BadRequestException` от `ValidationPipe`, склеивая массив `message` в строку. Поле-уровневые ошибки не отдаём (фронт валидирует поля client-side через `react-hook-form + zod`).
- **Фронт**: `ApiError` получает чистое поле `message`; `apiFetch` пытается распарсить JSON-тело по контракту, при неуспехе — фолбэк на `res.text()`. Существующие формы продолжают работать по `status`, но теперь могут показывать серверный `message`.

## Implementation Steps

### Task 1: Тип ApiErrorBody в @repo/types

**Files:**

- Create: `packages/types/src/api-error.ts`
- Modify: `packages/types/src/index.ts`

- [x] создать `api-error.ts` с TS-интерфейсом `ApiErrorBody` (`statusCode`, `message`)
- [x] реэкспортировать из `index.ts`
- [x] `pnpm --filter @repo/types typecheck` — компилируется (своего test-runner'а у пакета нет, отдельный спек не нужен)

### Task 2: Глобальный AllExceptionsFilter

**Files:**

- Create: `apps/api/src/common/filters/all-exceptions.filter.ts`
- Create: `apps/api/src/common/filters/all-exceptions.filter.spec.ts`
- Modify: `apps/api/src/main.ts`

- [ ] создать `AllExceptionsFilter` (`@Catch()`), формирующий `ApiErrorBody` и отправляющий через Fastify `reply` (типы `FastifyRequest/FastifyReply`, guard на `reply.sent`)
- [ ] маппинг `HttpException`: нормализовать `message` в строку (массив валидации → склеить)
- [ ] маппинг `Prisma.PrismaClientKnownRequestError`: `P2002`→409, `P2025`→404, прочее→500
- [ ] неизвестная ошибка → 500, generic `message`, без stack/деталей; логировать полную через инжектированный `Logger`; скрывать детали при `NODE_ENV==='production'`
- [ ] зарегистрировать фильтр в `main.ts` (`app.useGlobalFilters(...)`)
- [ ] тесты: `HttpException` (403) → тело; валидация (массив `message`) → одна строка; `P2002`→409, `P2025`→404 (ошибки сконструированы вручную); неизвестная → 500 без утечки
- [ ] проверить существующие спеки auth/users/verification — статус-коды не изменились
- [ ] `pnpm --filter @repo/api test` — весь набор проходит

### Task 3: Подключить новый формат на фронте

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify (по необходимости): `apps/web/src/components/auth/register-form.tsx`, `reset-password-form.tsx`, `email-verification-banner.tsx`

- [ ] обеспечить чистое поле `message` в `ApiError`, типизировать тело через `@repo/types` `ApiErrorBody`
- [ ] в `apiFetch` при `!res.ok` парсить JSON-тело по контракту; фолбэк на `res.text()` при неуспехе
- [ ] свериться с потребителями (формы по `status`): убедиться, что поведение не сломано; где уместно — показывать серверный `message`
- [ ] обновить/добавить e2e (неверный логин): UI показывает корректное сообщение из нового формата
- [ ] `pnpm --filter @repo/web test:e2e` — проходит

### Task 4: Verify + документация

**Files:**

- Create: `docs/adr/012-api-error-format.md`
- Modify: `docs/adr/README.md`

- [ ] проверить: любая ошибка API отдаёт единый shape с корректным кодом; `P2002`→409, `P2025`→404; в prod нет stack/SQL в теле
- [ ] прогнать `pnpm --filter @repo/api test` и `pnpm --filter @repo/web test:e2e`
- [ ] создать короткий ADR-012 (формат тела ошибки + фильтр) и строку в индексе
- [ ] переместить этот план в `docs/plans/completed/`

## Post-Completion

_Только информационно, без чекбоксов._

- Ручная проверка через curl/Swagger: 400 (валидация), 401/403 (guard), 404 (`P2025`), 409 (`P2002`), 500 (неизвестная) — единый shape и коды
- Запуск с `NODE_ENV=production`: в теле нет stack/SQL, но есть в логах
