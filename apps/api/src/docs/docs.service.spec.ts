import fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { DocsService } from './docs.service';

describe('DocsService', () => {
  let docsRoot: string;
  let service: DocsService;

  beforeEach(async () => {
    // Временный каталог-фикстура — не зависим от __dirname/реального docs/.
    docsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'docs-fixture-'));

    await fs.mkdir(path.join(docsRoot, 'adr'), { recursive: true });
    await fs.mkdir(path.join(docsRoot, 'guides'), { recursive: true });

    await fs.writeFile(path.join(docsRoot, 'README.md'), '# root readme');
    await fs.writeFile(path.join(docsRoot, 'DOCUMENTATION.md'), '# docs meta');
    await fs.writeFile(path.join(docsRoot, 'adr', '012-error.md'), '# adr 12');
    await fs.writeFile(path.join(docsRoot, 'adr', '001-init.md'), '# adr 1');
    await fs.writeFile(path.join(docsRoot, 'guides', 'audit.md'), '# guide');
    // Не-.md рядом — не должен попасть в дерево.
    await fs.writeFile(path.join(docsRoot, 'guides', 'image.png'), 'binary');

    service = new DocsService(docsRoot);
  });

  afterEach(async () => {
    await fs.rm(docsRoot, { recursive: true, force: true });
  });

  describe('getTree', () => {
    it('группирует по первому сегменту (корень → root) и детерминированно сортирует', async () => {
      const tree = await service.getTree();

      expect(tree.groups.map((g) => g.group)).toEqual(['adr', 'guides', 'root']);

      const adr = tree.groups.find((g) => g.group === 'adr')!;
      expect(adr.files.map((f) => f.path)).toEqual(['adr/001-init.md', 'adr/012-error.md']);
      expect(adr.files[0]).toEqual({ path: 'adr/001-init.md', name: '001-init.md', group: 'adr' });

      const root = tree.groups.find((g) => g.group === 'root')!;
      expect(root.files.map((f) => f.path)).toEqual(['DOCUMENTATION.md', 'README.md']);
    });

    it('игнорирует не-.md файлы', async () => {
      const tree = await service.getTree();
      const guides = tree.groups.find((g) => g.group === 'guides')!;
      expect(guides.files.map((f) => f.path)).toEqual(['guides/audit.md']);
    });
  });

  describe('getFile', () => {
    it('возвращает содержимое валидного .md', async () => {
      const file = await service.getFile('adr/012-error.md');
      expect(file).toEqual({ path: 'adr/012-error.md', content: '# adr 12' });
    });

    it('бросает BadRequestException на не-.md', async () => {
      await expect(service.getFile('guides/image.png')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('бросает NotFoundException на отсутствующий файл', async () => {
      await expect(service.getFile('adr/999-missing.md')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['../package.json', 'относительный traversal'],
      ['../secret.md', 'traversal к соседу'],
      ['/etc/passwd', 'абсолютный путь'],
      ['%2e%2e/secret.md', 'URL-encoded traversal'],
    ])('бросает ошибку на path traversal: %s (%s)', async (input) => {
      await expect(service.getFile(input)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('бросает ошибку на ложный префикс каталога (docs-secret)', async () => {
      // Каталог-сосед с похожим префиксом не должен проходить проверку startsWith(root + sep).
      const sibling = `${docsRoot}-secret`;
      await fs.mkdir(sibling, { recursive: true });
      await fs.writeFile(path.join(sibling, 'leak.md'), 'secret');
      try {
        const rel = path.join('..', `${path.basename(docsRoot)}-secret`, 'leak.md');
        await expect(service.getFile(rel)).rejects.toBeInstanceOf(BadRequestException);
      } finally {
        await fs.rm(sibling, { recursive: true, force: true });
      }
    });
  });
});
