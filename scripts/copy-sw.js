/**
 * Copy arc-pwa-sw.js from the arc-pwa dist into the extension's public/
 * directory so the Service Worker is served from the extension root scope.
 *
 * Run: node scripts/copy-sw.js
 * Auto-run: included in dev / build npm scripts.
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', '..', 'arc-pwa', 'dist', 'arc-pwa-sw.js');
const dest = join(__dirname, '..', 'public', 'arc-pwa-sw.js');

mkdirSync(dirname(dest), { recursive: true });

if (!existsSync(src)) {
  console.warn(
    '[copy-sw] Warning: arc-pwa/dist/arc-pwa-sw.js not found.\n' +
    '          Build arc-pwa first: cd ../arc-pwa && npm run build',
  );
  process.exit(0);
}

copyFileSync(src, dest);
console.log('[copy-sw] Copied arc-pwa-sw.js → public/arc-pwa-sw.js');
