import fs from 'fs/promises';
import { resolve } from 'path';

export async function readJson(filePath) {
  const raw = await fs.readFile(resolve(filePath), 'utf8');
  return JSON.parse(raw);
}

export async function readModuleData(modulePath, fileName) {
  return readJson(resolve(modulePath, 'public/data', `${fileName}.json`));
}
