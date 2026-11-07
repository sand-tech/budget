// Runs the Playwright CLI with browsers stored inside this project
// (node_modules/playwright-core/.local-browsers) instead of a global cache.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' };
if (env.FORCE_COLOR) delete env.NO_COLOR; // avoid a noisy Node warning when both are set

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env,
});
child.on('exit', (code) => process.exit(code ?? 1));
