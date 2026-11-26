#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPortalDir } from './utils/workspace.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const extraArgs = argv.slice(1);

function runNode(scriptName, args = []) {
  const scriptPath = join(__dirname, scriptName);
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit' });
  return res.status ?? 1;
}

function runNpm(args, cwd) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npmCmd, args, { cwd, stdio: 'inherit' });
  return res.status ?? 1;
}

console.log('🌌 OpenSkill Galaxy • 工程与架构统一 CLI 维护工具\n');

switch (command) {
  case 'sync': {
    console.log('📦 正在同步模块模板 (propagate.mjs)...');
    const code = runNode('propagate.mjs', extraArgs);
    if (code !== 0) {
      console.error(`❌ 模板同步失败 (exit ${code})`);
      process.exitCode = code;
    } else {
      console.log('✅ 模板同步完成！');
    }
    break;
  }

  case 'audit': {
    console.log('🔍 正在运行全站非破坏性数据校验（Schema / 引用 / 题库 / 内容审计）...');
    const steps = [
      ['validate-module.mjs', ['--all', ...extraArgs]],
      ['audit-questions.mjs', []],
      ['audit-and-fix-content.mjs', []],
    ];
    let failed = 0;
    for (const [script, args] of steps) {
      console.log(`\n▶ Running ${script} ${args.join(' ')}`);
      const code = runNode(script, args);
      if (code !== 0) failed = code;
    }
    if (failed !== 0) {
      console.error('\n❌ 审计发现问题，请查看上方输出。');
      process.exitCode = 1;
    } else {
      console.log('\n✅ 全站数据校验全部通过！');
    }
    break;
  }

  case 'build-portal': {
    const portalDir = getPortalDir();
    console.log(`🏗️ 正在构建 Portal 门户 (${portalDir})...`);
    const code = runNpm(['run', 'build'], portalDir);
    if (code !== 0) {
      console.error(`❌ Portal 构建失败 (exit ${code})`);
      process.exitCode = code;
    } else {
      console.log('✅ Portal 构建成功！');
    }
    break;
  }

  case 'build-all': {
    console.log('🏗️ 正在批量构建模块与平台项目 (buildall.mjs)...');
    const code = runNode('buildall.mjs', extraArgs);
    if (code !== 0) {
      console.error(`❌ 批量构建存在失败项目 (exit ${code})`);
      process.exitCode = code;
    } else {
      console.log('✅ 批量构建完成！');
    }
    break;
  }

  case 'push': {
    const hasConfirm = extraArgs.includes('--confirm');
    const args = hasConfirm ? extraArgs : ['--dry-run', ...extraArgs.filter((a) => a !== '--dry-run')];
    console.log(
      hasConfirm
        ? '🚀 正在执行 git-push-all.mjs (--confirm)...'
        : 'ℹ️  未传入 --confirm，默认以 --dry-run 预览模式运行 git-push-all.mjs...'
    );
    const code = runNode('git-push-all.mjs', args);
    if (code !== 0) {
      console.error(`❌ git-push-all.mjs 返回失败 (exit ${code})`);
      process.exitCode = code;
    }
    break;
  }

  default:
    console.log(`用法: node src/cli-manage.mjs <command> [options]

可用命令列表:
  sync          - 运行 propagate.mjs 同步模块模板（支持 --dry-run / --check）
  audit         - 运行非破坏性全站校验 (validate-module --all, audit-questions, audit-and-fix-content)
  build-portal  - 构建 Portal 门户 (openskill-galaxy.github.io)
  build-all     - 运行 buildall.mjs 批量构建（支持 --include-platform / --dry-run / --filter）
  push          - 调用 git-push-all.mjs（默认 --dry-run，需显式 --confirm 才提交/推送）

示例:
  node src/cli-manage.mjs sync --check
  node src/cli-manage.mjs audit
  node src/cli-manage.mjs build-all --dry-run
  node src/cli-manage.mjs push
`);
    if (command !== 'help' && command !== '--help' && command !== '-h') {
      process.exitCode = 1;
    }
    break;
}
