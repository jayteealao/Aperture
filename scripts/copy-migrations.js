import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const src = join(projectRoot, 'src', 'migrations');
const dst = join(projectRoot, 'dist', 'migrations');

if (!existsSync(dst)) {
  mkdirSync(dst, { recursive: true });
}

const files = readdirSync(src).filter(f => f.endsWith('.sql'));

for (const file of files) {
  copyFileSync(join(src, file), join(dst, file));
}

console.log(`Copied ${files.length} migration files to dist/migrations/`);
