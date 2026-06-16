# Обновление Prisma 6 → 7

## Overview

Мажорный апгрейд ORM: `prisma` CLI и `@prisma/client` с 6.3.1 до 7.x.
Призван устранить расхождение мажоров пакетов и получить актуальную версию ORM в шаблоне.

Prisma 7 вводит несколько breaking changes, затрагивающих всю серверную часть монорепо:

- Генератор клиента переименован, путь вывода стал обязательным
- Клиент больше не попадает в `node_modules` — все импорты из `@prisma/client` сломаются
- Все БД теперь требуют явный driver adapter (`@prisma/adapter-pg` для PostgreSQL)
- Требуется ESM (потенциальный конфликт с NestJS/SWC CJS-сборкой — **ключевой риск**)

## Context

- **Файлы генератора**: `apps/api/prisma/schema.prisma`
- **Prisma-сервис**: `apps/api/src/prisma/prisma.service.ts`
- **Фильтр ошибок** (использует `Prisma` namespace): `apps/api/src/common/filters/all-exceptions.filter.ts`
- **~30 файлов** в `apps/api/src/` импортируют из `@prisma/client` (типы, enum-ы, namespace)
- **Seed**: `apps/api/prisma/seed.ts`, запускается через `ts-node`
- **Module system**: `module: NodeNext` в tsconfig, без `"type": "module"` в package.json — CommonJS

## Development Approach

- **Тестирование**: Regular (код → тесты)
- Завершать каждую задачу полностью перед переходом к следующей
- Тесты — обязательная часть каждой задачи
- Все тесты должны проходить перед переходом к следующей задаче

## Testing Strategy

- **Unit tests**: существующие `*.spec.ts` файлы; фиксируем что они не деградировали
- **Build**: `pnpm --filter @repo/api build` — финальный критерий успеха
- **DB smoke**: `pnpm --filter @repo/api db:generate` и `db:migrate` (вручную после реализации)

## Progress Tracking

- `[x]` — завершено
- `➕` — обнаруженная новая задача
- `⚠️` — блокер

## Solution Overview

1. Обновить `prisma` и `@prisma/client` до v7, добавить `@prisma/adapter-pg` и `pg`
2. Изменить `schema.prisma`: провайдер `prisma-client`, обязательный `output = "../src/generated/prisma"`
3. Заменить `PrismaService` (extends PrismaClient → использует driver adapter `PrismaPg`)
4. Обновить все импорты из `@prisma/client` на путь к сгенерированному клиенту
5. Разобраться с ESM: попробовать CJS-совместимый вывод генератора; при необходимости настроить SWC/tsconfig

## Technical Details

**Новый блок generator в schema.prisma:**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

**Новая инициализация PrismaService:**

```ts
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
}
```

**Изменение пути импорта типов:**

```ts
// было
import { Prisma, Role } from '@prisma/client';
// стало
import { Prisma, Role } from '../generated/prisma'; // относительный путь
```

**Риск ESM**: Prisma 7 требует ESM по умолчанию. NestJS + SWC работает в CJS.
Стратегия: генерируем клиент в `src/generated/prisma` с явным output — это может дать CJS-совместимые файлы.
Если нет — потребуется либо настроить SWC на поддержку dual CJS/ESM, либо добавить `moduleResolution: bundler` в tsconfig.

## What Goes Where

**Implementation Steps** — изменения в кодовой базе.
**Post-Completion** — ручные проверки (migrate, seed, smoke-тест).

## Implementation Steps

### Task 1: Обновить зависимости

**Files:**

- Modify: `apps/api/package.json`

- [ ] обновить `prisma` до `^7` в devDependencies
- [ ] обновить `@prisma/client` до `^7` в dependencies
- [ ] добавить `@prisma/adapter-pg` в dependencies
- [ ] добавить `pg` в dependencies (нативный драйвер PostgreSQL)
- [ ] добавить `@types/pg` в devDependencies
- [ ] запустить `pnpm install`
- [ ] проверить что `pnpm install` завершился без ошибок

### Task 2: Обновить schema.prisma

**Files:**

- Modify: `apps/api/prisma/schema.prisma`

- [ ] изменить `provider = "prisma-client-js"` на `provider = "prisma-client"`
- [ ] добавить `output = "../src/generated/prisma"` в блок generator
- [ ] запустить `pnpm --filter @repo/api db:generate` и убедиться что клиент сгенерировался в `src/generated/prisma/`
- [ ] добавить `src/generated/` в `.gitignore` (генерируемый код не коммитим)

### Task 3: Обновить PrismaService

**Files:**

- Modify: `apps/api/src/prisma/prisma.service.ts`

- [ ] обновить импорт `PrismaClient` с `@prisma/client` → `../generated/prisma`
- [ ] добавить импорт `PrismaPg` из `@prisma/adapter-pg`
- [ ] обновить конструктор: передавать `adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })`
- [ ] убедиться что `DATABASE_URL` доступна при инициализации (из env-валидации приложения)
- [ ] запустить typecheck: `pnpm --filter @repo/api typecheck`

### Task 4: Обновить импорты @prisma/client во всех файлах

**Files:**

- Modify: все `*.ts` файлы в `apps/api/src/` с `from '@prisma/client'`

- [ ] заменить `from '@prisma/client'` на правильный относительный путь к `generated/prisma` в каждом файле (grep-поиск по `'@prisma/client'`)
- [ ] обновить `apps/api/src/common/filters/all-exceptions.filter.ts` (`Prisma` namespace)
- [ ] обновить `apps/api/src/common/filters/all-exceptions.filter.spec.ts`
- [ ] обновить все repository-файлы (`users.repository.ts`, `audit.repository.ts`, `verification.repository.ts`)
- [ ] обновить все spec-файлы что используют типы Prisma
- [ ] запустить typecheck и убедиться в 0 ошибок: `pnpm --filter @repo/api typecheck`

### Task 5: Разобраться с ESM (при необходимости)

> Выполняется только если typecheck или build падает из-за конфликта ESM/CJS.
> Если сгенерированный клиент совместим с CJS — этот шаг пропускается.

**Files:**

- Modify: `apps/api/tsconfig.json` или `.swcrc` (при необходимости)

- [ ] проверить что сгенерированные файлы содержат CJS (`require`/`module.exports`) или ESM (`import`/`export`)
- [ ] если ESM: исследовать опцию `output` Prisma на предмет CJS-генерации или `moduleResolution: bundler`
- [ ] при необходимости настроить SWC для транспиляции ESM-зависимостей из `generated/`
- [ ] добиться прохождения `pnpm --filter @repo/api build` без ошибок

### Task 6: Обновить seed.ts

**Files:**

- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json` (script `db:seed`)

- [ ] обновить импорт в `seed.ts`: `@prisma/client` → путь к сгенерированному клиенту
- [ ] при необходимости обновить инициализацию PrismaClient в seed с driver adapter
- [ ] проверить что `db:seed` скрипт корректен (ts-node может не поддерживать ESM — возможна замена на `tsx`)

### Task 7: Проверить тесты

**Files:**

- Modify: spec-файлы при необходимости (если изменились пути или API моков)

- [ ] запустить `pnpm --filter @repo/api test` и убедиться что все тесты проходят
- [ ] исправить тесты если сломались из-за изменения путей импорта или API
- [ ] запустить `pnpm build` (полный monorepo build)

### Task 8: Проверить принятые критерии (из issue #34)

- [ ] `pnpm --filter @repo/api db:generate` — зелёный
- [ ] `pnpm build` — зелёный
- [ ] `pnpm --filter @repo/api test` — все тесты проходят
- [ ] `pnpm typecheck` — 0 ошибок

### Task 9: [Final] Обновить документацию

- [ ] обновить `CLAUDE.md` если появились новые паттерны (путь к generated client)
- [ ] обновить `README.md` если Prisma-секция устарела
- [ ] перенести план в `docs/plans/completed/`

## Post-Completion

**Ручная проверка БД** (требует запущенного PostgreSQL):

- `pnpm --filter @repo/api db:migrate` — убедиться что миграции применяются
- `pnpm --filter @repo/api db:seed` — убедиться что seed работает
- Smoke-тест: запустить `pnpm dev`, проверить `/health` и `/api/docs`

**Предупреждение об автосидировании**: Prisma 7 убрала автоматический seed при `migrate dev`/`migrate reset`. Нужно запускать `db:seed` явно после `db:migrate`.
