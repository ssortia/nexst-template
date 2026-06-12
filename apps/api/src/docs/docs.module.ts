import * as path from 'node:path';

import { Module } from '@nestjs/common';

import { RolesGuard } from '../auth/guards/roles.guard';

import { DOCS_ROOT } from './docs.constants';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

@Module({
  controllers: [DocsController],
  providers: [
    RolesGuard,
    DocsService,
    // Корень docs внедряется через токен, чтобы тесты задавали путь к фикстурам,
    // а не зависели от __dirname. SWC даёт плоский dist (dist/docs/docs.module.js),
    // поэтому до корня монорепо ровно 4 уровня вверх → <repo>/docs (в образе → /app/docs).
    { provide: DOCS_ROOT, useValue: path.resolve(__dirname, '../../../../docs') },
  ],
})
export class DocsModule {}
