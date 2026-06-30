import { resolve } from 'path';

export function getDataDir(modulePath) {
  return resolve(modulePath, 'public/data');
}

export function getDataFilePath(modulePath, fileName) {
  return resolve(modulePath, 'public/data', `${fileName}.json`);
}

export function getReportsDir(modulePath) {
  return resolve(modulePath, 'reports');
}
