import { resolve } from 'path';
import { getModuleDirs } from './workspace.mjs';

export function hasFlag(argv, flag) {
  return argv.includes(flag);
}

export function getArgValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < argv.length && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  const prefix = `${flag}=`;
  const eqArg = argv.find((a) => a.startsWith(prefix));
  return eqArg ? eqArg.slice(prefix.length) : undefined;
}

export function getPositionalArgs(argv, flagsWithValues = []) {
  const skip = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (
      arg.startsWith('--') &&
      flagsWithValues.includes(arg) &&
      i + 1 < argv.length &&
      !argv[i + 1].startsWith('--')
    ) {
      skip.add(i + 1);
    }
  }
  return argv.filter((a, i) => !a.startsWith('--') && !skip.has(i));
}

export function resolveTargetModules(argv, usageLine, flagsWithValues = []) {
  const all = hasFlag(argv, '--all');
  const includeTemplate = hasFlag(argv, '--include-template');
  const positional = getPositionalArgs(argv, flagsWithValues);

  if (all) {
    return getModuleDirs(undefined, { includeTemplate }).map((m) => ({
      name: m.name,
      path: m.path,
    }));
  }

  if (positional.length > 0) {
    return positional.map((p) => {
      const abs = resolve(p);
      return { name: abs.split(/[/\\]/).pop(), path: abs };
    });
  }

  if (usageLine) {
    console.error(usageLine);
  }
  return null;
}
