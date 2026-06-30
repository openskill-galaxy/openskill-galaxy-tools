import fs from 'fs/promises';
import { resolve } from 'path';

export async function writeJson(filePath, data, spaces = 2) {
  await fs.writeFile(resolve(filePath), JSON.stringify(data, null, spaces), 'utf8');
}

export async function writeModuleData(modulePath, fileName, data, spaces = 2) {
  await writeJson(resolve(modulePath, 'public/data', `${fileName}.json`), data, spaces);
}
