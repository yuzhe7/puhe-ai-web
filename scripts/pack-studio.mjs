#!/usr/bin/env node
/**
 * 生成「魔搭创空间干净上传包」
 * --------------------------------------------------------------------------
 * 为什么需要：创空间网页上传时不要把整个开发目录拖上去。
 * node_modules（数百 MB）、.next（构建产物）、docs、本地 .env 都应排除，
 * 否则上传慢、构建上下文膨胀，且存在把本地密钥带上去的风险。
 *
 *   npm run pack:studio                # 生成 studio-package/
 *   npm run pack:studio -- --force     # 目标目录已存在时覆盖重建
 *   npm run pack:studio -- --out=my-dir
 *
 * 脚本会：① 只复制运行必需文件 ② 生成带创空间 YAML 头的 README.md
 *        ③ 扫描疑似硬编码密钥，发现即中止 ④ 打印清单与体积。
 */
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const force = args.includes('--force');
const outName = outArg ? outArg.slice('--out='.length) : 'studio-package';
const outDir = path.resolve(cwd, outName);

// 防止误把输出指向工程根或源码目录
if (outDir === cwd || outDir === path.resolve(cwd, 'src') || outDir.startsWith(path.resolve(cwd, 'node_modules'))) {
  console.error('✗ 输出目录不安全，已中止。请使用项目内的独立目录，例如 studio-package/');
  process.exit(1);
}

const FILES = [
  'package.json', 'package-lock.json',
  'next.config.mjs', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.ts',
  '.eslintrc.json', 'next-env.d.ts',
  'Dockerfile', 'ms_deploy.json', '.dockerignore', '.env.example',
];
const DIRS = ['src'];
const EXTRA_SCRIPTS = ['check-modelscope.mjs', 'no-trace.cjs'];

const README = `---
title: 谱合产教 · AI 驱动的产教融合诊断平台
sdk: docker
app_port: 7860
pinned: false
---

# 谱合产教

面向高校与产业侧的 **AI Native 产教融合诊断平台**，由团队原创大创项目改造，
用于第九届传智杯「AI WEB 网页开发挑战赛」。

## 能力

- 双侧三层知识图谱、三维递进式诊断（专业同质化 → 培养目标偏差 → 知识点缺口）
- AI Copilot：SSE 流式输出、Function Calling 工具链、RAG 证据溯源、内容安全
- 培养方案改革沙盘、岗位能力路径规划、Deep Research、62 个专业目录（含法学门类专题扩样）
- 专业目录深链接自动匹配：跳转到沙盘 / 诊断 / 路径时自动带入最相关岗位与对比专业并开始分析
- 多模态文档接入（PDF / DOCX / 图片 / 文本）与端侧向量检索
- Xiaomi-OCR-0 文档解析通道（可选本地推理端点，图片 → 结构化文本 → RAG 语料）
- 深空 / 明亮双主题、全局命令面板

## 运行方式

本空间使用 **Docker** 部署，服务监听 \`0.0.0.0:7860\`（创空间约定端口）。
启动后访问首页，\`/api/status\` 可查看当前模型服务商与运行状态。

模型密钥通过创空间 **Secrets** 注入，仓库中不含任何真实凭证：

| 变量 | 类型 | 说明 |
|---|---|---|
| \`MODELSCOPE_SDK_TOKEN\` | Secret | 魔搭 SDK Token；不填则自动使用本地确定性引擎 |
| \`AI_PROVIDER\` | 明文 | 默认 \`modelscope\` |
| \`DEMO_MODE\` | 明文 | 设为 \`true\` 可强制完全离线演示 |
| \`OCR_BASE_URL\` / \`OCR_MODEL\` | 明文 | 可选：本地 Xiaomi-OCR-0 推理端点；容器内 loopback 不是宿主机，未填也可在 \`/ocr\` 页临时配置 |

**未配置密钥、断网或额度用尽时，全部页面与确定性算法仍可完整演示**，这是作品的保底设计。

## 数据声明

专业目录取自教育部、麦可思、央视等公开口径；课程、学时、在招数、薪资等均为
**教学演示抽样数据，非真实统计**，未穷尽全国 845 种本科专业。

## 本地开发

\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`

完整技术文档与部署手册见项目代码仓库。
`;

/** 疑似硬编码凭证：命中即中止打包，避免把密钥传到公开空间 */
const SECRET_PATTERNS = [
  { name: '魔搭 SDK Token', re: /ms-[A-Za-z0-9]{20,}/g },
  { name: 'OpenAI / DeepSeek 风格密钥', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'Bearer 明文凭证', re: /Bearer\s+[A-Za-z0-9._-]{24,}/g },
  { name: '赋值型密钥', re: /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*['"][A-Za-z0-9_-]{20,}['"]/gi },
];
const PLACEHOLDER = /xxx|your|placeholder|example|示例|你的|替换|fake|test|dummy|填|模板/i;

function scanSecrets(absPath, relPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const hits = [];
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const fragment = m[0];
      if (PLACEHOLDER.test(fragment)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      hits.push(`${relPath}:${line}  ${name}  ${fragment.slice(0, 24)}…`);
    }
  }
  return hits;
}

function copyFile(rel) {
  const src = path.join(cwd, rel);
  if (!fs.existsSync(src)) throw new Error(`缺少必需文件：${rel}`);
  const dst = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(rel) {
  const src = path.join(cwd, rel);
  if (!fs.existsSync(src)) throw new Error(`缺少必需目录：${rel}`);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relFile = path.relative(cwd, path.join(dir, entry.name));
      const target = path.join(outDir, relFile);
      if (entry.isDirectory()) { fs.mkdirSync(target, { recursive: true }); walk(path.join(dir, entry.name)); }
      else if (entry.isFile()) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(dir, entry.name), target);
      }
    }
  };
  fs.mkdirSync(path.join(outDir, rel), { recursive: true });
  walk(src);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.isFile()) out.push({ rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return out;
}

if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
  if (!force) {
    console.error(`✗ 输出目录已存在且非空：${outDir}`);
    console.error('  请先手动移除，或使用：npm run pack:studio -- --force');
    process.exit(1);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

try {
  FILES.forEach(copyFile);
  DIRS.forEach(copyDir);
  fs.mkdirSync(path.join(outDir, 'scripts'), { recursive: true });
  EXTRA_SCRIPTS.forEach((f) => copyFile(path.join('scripts', f)));
  fs.writeFileSync(path.join(outDir, 'README.md'), README, 'utf8');
} catch (e) {
  console.error(`✗ 打包失败：${e.message}`);
  process.exit(1);
}

const all = listFiles(outDir);
const suspicious = all.flatMap((f) => scanSecrets(path.join(outDir, f.rel), f.rel));
const total = all.reduce((s, f) => s + f.size, 0);

console.log('=== 魔搭创空间上传包 ===');
console.log(`输出目录  : ${outDir}`);
console.log(`文件数量  : ${all.length}`);
console.log(`总体积    : ${(total / 1024).toFixed(1)} KB`);
console.log('');
console.log('顶层内容：');
for (const f of all.filter((x) => !x.rel.includes(path.sep))) console.log(`  ${f.rel}`);
console.log(`  src/ (${all.filter((x) => x.rel.startsWith('src' + path.sep)).length} 个文件)`);
console.log(`  scripts/ (${all.filter((x) => x.rel.startsWith('scripts' + path.sep)).length} 个文件)`);
console.log('');

if (suspicious.length) {
  console.error('✗ 检测到疑似硬编码凭证，已中止，请改为环境变量后再打包：');
  suspicious.slice(0, 10).forEach((h) => console.error(`  ${h}`));
  process.exit(1);
}
console.log('✓ 敏感信息扫描通过：未发现硬编码密钥');
console.log('✓ README.md 已写入创空间 YAML 头（sdk: docker / app_port: 7860）');
console.log('');
console.log('下一步：把 studio-package/ 内的全部文件上传到创空间（不要把 node_modules、.next 一起拖）。');
console.log('详细步骤见 docs/08-创空间部署逐步操作手册.md。');
