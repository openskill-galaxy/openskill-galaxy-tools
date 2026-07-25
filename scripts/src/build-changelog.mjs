import { execSync } from "child_process";
import fs from "fs/promises";
import { join } from "path";

const rootDir = "C:/WJH/Wonderful/openskill-galaxy";
const templateDir = "C:/WJH/Wonderful/openskill-galaxy/00-平台与协作/模块模板";

async function main() {
  console.log("🌌 OpenSkill Galaxy • 自动化 Changelog 日志生成器\n");

  let rawLogs = "";
  try {
    rawLogs = execSync('git log -n 30 --pretty=format:"%h | %s | %an | %ad" --date=short', {
      cwd: templateDir,
      encoding: "utf-8",
    });
  } catch (e) {
    console.error("无法提取 git log 数据:", e.message);
    return;
  }

  const lines = rawLogs.trim().split("\n");
  let mdContent = `# OpenSkill Galaxy • 全站工程 Changelog 历史记录\n\n`;
  mdContent += `> 自动生成时间: ${new Date().toLocaleString("zh-CN")}\n\n`;
  mdContent += `| Commit Hash | Commit Description | Author | Date |\n`;
  mdContent += `| :--- | :--- | :--- | :--- |\n`;

  lines.forEach((line) => {
    const [hash, msg, author, date] = line.split(" | ");
    if (hash && msg) {
      mdContent += `| \`${hash}\` | ${msg.replace(/\|/g, "-")} | ${author || "Antigravity Agent"} | ${date || ""} |\n`;
    }
  });

  const targetPath = join(rootDir, "CHANGELOG.md");
  await fs.writeFile(targetPath, mdContent, "utf-8");
  console.log(`✅ CHANGELOG.md 已成功生成于: ${targetPath}`);
}

main().catch(console.error);
