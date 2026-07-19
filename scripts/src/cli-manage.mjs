import { execSync } from 'child_process';
import { resolve } from 'path';

const command = process.argv[2] || 'help';

console.log('🌌 OpenSkill Galaxy • 工程与架构统一 CLI 维护工具\n');

switch (command) {
  case 'sync':
    console.log('📦 正在一键全量同步模版样式与核心组件至 60 个子模块...');
    try {
      execSync('node src/propagate-styles.mjs', { stdio: 'inherit' });
      console.log('✅ 模板全量同步成功！');
    } catch (e) {
      console.error('❌ 同步过程中出错:', e.message);
    }
    break;

  case 'audit':
    console.log('🔍 正在运行全站数据结构 Zod Schema 与考题有效性校验...');
    try {
      execSync('node src/audit-and-fix-content.mjs', { stdio: 'inherit' });
      console.log('✅ 数据结构与考题有效性校验完成！');
    } catch (e) {
      console.error('❌ 校验过程中出错:', e.message);
    }
    break;

  case 'push':
    console.log('🚀 正在将全站 62 个 Git 仓库安全提交并推送到 GitHub 远程端...');
    try {
      execSync('node src/git-push-all.mjs', { stdio: 'inherit' });
      console.log('✅ Git 远程同步全部完成！');
    } catch (e) {
      console.error('❌ 推送过程中出错:', e.message);
    }
    break;

  case 'build-portal':
    console.log('🏗️ 正在构建 Portal 门户生产包...');
    try {
      execSync('npm run build', { cwd: resolve('../../官网门户'), stdio: 'inherit' });
      console.log('✅ Portal 构建成功！');
    } catch (e) {
      console.error('❌ Portal 构建失败:', e.message);
    }
    break;

  default:
    console.log(`用法: node src/cli-manage.mjs <command>

可用命令列表:
  sync          - 一键全量同步模块模板的所有组件、样式、Hook 与配置至 60 个子模块
  audit         - 运行全站数据 Zod Schema 校验与考题有效性修正引擎
  push          - 自动扫描全站 62 个 Git 仓库并全量推送至 GitHub
  build-portal  - 构建主入口官网门户生产环境 Bundle

示例:
  node src/cli-manage.mjs sync
  node src/cli-manage.mjs audit
  node src/cli-manage.mjs push
`);
    break;
}
