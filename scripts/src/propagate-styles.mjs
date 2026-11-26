#!/usr/bin/env node
// Legacy wrapper kept for backward compatibility; delegates to propagate.mjs using workspace template discovery.
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getTemplateDir } from './utils/workspace.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = getTemplateDir();
const propagateScript = join(__dirname, 'propagate.mjs');

console.log(`[propagate-styles] Delegating to propagate.mjs (template: ${templateDir})`);
const res = spawnSync(process.execPath, [propagateScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
