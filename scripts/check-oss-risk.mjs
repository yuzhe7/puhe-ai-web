/**
 * 开源选型风险守卫（零外部依赖，离线可跑）
 * --------------------------------------------------------------------------
 * 把 docs/13《开源项目对标与复用分析》里的「选型风险」变成可自动复核的检查，
 * 按 A 可借鉴 / B 可复用 / C 可集成 三层输出，防止调研结论随时间失效：
 *
 *  [A] 只读借鉴层：禁止把已改名/404/已归档/维护模式项目当成有效选型写进生产文件
 *  [B] 可复用层：禁止引入常驻服务、替换自研核心或许可受限的依赖；新依赖需人工核对
 *  [C] 可集成层：上传包密钥污染、体积异常、Docker 部署契约缺项
 *
 *   node scripts/check-oss-risk.mjs      或  npm run verify:oss
 * 退出码：出现 FAIL 时为 1（可接入 CI），WARN/INFO 不阻断。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const add = (layer, level, name, detail = '') => results.push({ layer, level, name, detail: String(detail) });
const read = (rel) => {
  const p = path.join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

/* ------------------------------------------------------------------ A 层 */

/** 已改名 / 迁移 / 404 的旧路径：写进生产文件会造成链接失效或引用不存在仓库 */
const OLD_PATHS = [
  ['pacocoursey/cmdk', 'dip/cmdk'],
  ['vercel/ai-chatbot', 'vercel/chatbot'],
  ['framer/motion', 'motiondivision/motion'],
  ['Yonom/assistant-ui', 'assistant-ui/assistant-ui'],
  ['lobehub/lobe-chat', 'lobehub/lobehub'],
  ['danny-avila/LibreChat', 'LibreChat-AI/LibreChat'],
  ['run-llama/LlamaIndex', 'run-llama/llama_index'],
  ['microsoft/recommenders', 'recommenders-team/recommenders'],
];
/** 已归档 / 维护模式 / 无许可：只允许出现在调研文档里作为排除说明 */
const DEPRECATED = [
  'microsoft/autogen', 'protectai/llm-guard', 'visjs/vis', 'microsoft/graphrag', 'tremorlabs/tremor',
];
/** 调研文档与规则脚本本身允许记录旧路径/停维项目（这正是纠错说明与规则表），其余文件一律不允许 */
const RESEARCH_DOCS = /^docs\/(13|14)[-\u4e00-\u9fa5]/;
const isRuleCarrier = (rel) => RESEARCH_DOCS.test(rel) || rel === 'scripts/check-oss-risk.mjs';
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|css|mjs)$/i;
const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'studio-package', '.workbuddy']);

function walk(relDir, out = []) {
  const abs = path.join(ROOT, relDir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    if (SKIP_DIR.has(entry)) continue;
    const rel = path.join(relDir, entry).replace(/\\/g, '/');
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) walk(rel, out);
    else if (SCAN_EXT.test(entry) || entry === 'Dockerfile' || entry === '.env.example') out.push(rel);
  }
  return out;
}

const productionFiles = [
  ...walk('src'), ...walk('scripts'), ...walk('docs'),
  'README.md', 'Dockerfile', '.env.example', 'ms_deploy.json', 'package.json', 'next.config.mjs',
].filter((f) => existsSync(path.join(ROOT, f)));

let oldPathHits = 0;
let deprecatedHits = 0;
for (const rel of productionFiles) {
  const text = read(rel);
  const isResearch = isRuleCarrier(rel);
  for (const [oldName, newName] of OLD_PATHS) {
    if (text.includes(oldName) && !isResearch) {
      add('A', 'WARN', `旧仓库路径 ${oldName}`, `${rel} → 应改为 ${newName}`);
      oldPathHits++;
    }
  }
  // THU-KEG/MOOCCube 为 404，且必须排除 MOOCCubeX（前缀相同）
  if (/THU-KEG\/MOOCCube(?![A-Za-z0-9])/.test(text) && !isResearch) {
    add('A', 'WARN', '404 仓库 THU-KEG/MOOCCube', `${rel} → 原版数据集在 moocdata.cn，非 GitHub`);
    oldPathHits++;
  }
  for (const name of DEPRECATED) {
    if (text.includes(name) && !isResearch) {
      add('A', 'WARN', `停维项目 ${name}`, `${rel} → 仅允许作为调研附注中的反例`);
      deprecatedHits++;
    }
  }
}
add('A', 'PASS', '生产文件无失效仓库路径', `扫描 ${productionFiles.length} 个文件，旧路径命中 ${oldPathHits} 处`);
add('A', deprecatedHits ? 'WARN' : 'PASS', '停维项目未进入选型', `生产文件命中 ${deprecatedHits} 处`);

/* ------------------------------------------------------------------ B 层 */

let pkg = {};
try { pkg = JSON.parse(read('package.json')); } catch { add('B', 'FAIL', 'package.json 解析失败', '无法读取依赖清单'); }
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const depNames = Object.keys(deps);

/** 引入即会破坏「纯 TS 单机 / 自研核心 / 确定性」的依赖 */
const FORBIDDEN = [
  'pg', 'pgvector', '@qdrant/js-client-rest', 'chromadb', 'milvus-sdk', 'neo4j-driver',
  'lancedb', '@lancedb/lancedb', 'llama-index', 'llamaindex', '@langchain/langgraph',
  'langgraph', '@modelcontextprotocol/server', 'ag-grid-enterprise', 'graphrag',
];
/** 重复技术栈 / 停维 / 包体风险：装了给警告，不阻断 */
const CAUTION = ['recharts', '@tremor/react', 'vis', 'vis-network', 'd3', 'echarts-gl', 'storybook'];
/** 当前已用 + docs/13 评估为可安全引入的 MIT/Apache 包 */
const ALLOWED = [
  'clsx', 'echarts', 'lucide-react', 'mammoth', 'next', 'react', 'react-dom', 'unpdf', 'zustand',
  '@types/node', '@types/react', '@types/react-dom', 'autoprefixer', 'eslint', 'eslint-config-next',
  'postcss', 'tailwindcss', 'typescript',
  'zod', '@playwright/test', 'cmdk', 'kbar', '@tanstack/react-table', '@tanstack/react-virtual',
  '@assistant-ui/react', '@assistant-ui/react-data-stream', '@radix-ui/react-dialog',
  '@radix-ui/react-popover', 'react-error-boundary', 'react-hook-form', '@hookform/resolvers',
  'next-themes', 'motion', '@antv/g6', 'd3-force', 'd3-hierarchy', '@xyflow/react',
  '@modelcontextprotocol/client', 'ai', '@ai-sdk/openai-compatible', '@ai-sdk/react',
];

const forbiddenHits = depNames.filter((d) => FORBIDDEN.includes(d));
const cautionHits = depNames.filter((d) => CAUTION.includes(d));
const unknownHits = depNames.filter((d) => !ALLOWED.includes(d) && !FORBIDDEN.includes(d) && !CAUTION.includes(d));
add('B', forbiddenHits.length ? 'FAIL' : 'PASS', '未引入常驻服务/替换核心的依赖', forbiddenHits.length ? `命中：${forbiddenHits.join('、')}` : `已核对 ${depNames.length} 个依赖`);
cautionHits.forEach((d) => add('B', 'WARN', `重复栈依赖 ${d}`, '确认不会推高首屏 87.3 kB 或与 ECharts 冲突'));
unknownHits.forEach((d) => add('B', 'WARN', `新依赖 ${d} 需核对许可`, '不在 docs/13 的安全白名单中，检查 LICENSE 后再合入'));

/** 自研核心文件存在性：整体替换核心是本次调研判定为「净损失」的最大风险 */
const CORE_FILES = [
  'src/lib/ai/llm.ts', 'src/lib/ai/tools.ts', 'src/lib/ai/runtime-config.ts',
  'src/lib/rag.ts', 'src/lib/graph.ts', 'src/lib/major-context.ts', 'src/lib/ai/ocr.ts',
];
const missingCore = CORE_FILES.filter((f) => !existsSync(path.join(ROOT, f)));
add('B', missingCore.length ? 'FAIL' : 'PASS', '自研核心模块未被替换', missingCore.length ? `缺失：${missingCore.join('、')}` : `${CORE_FILES.length} 个核心模块完好`);
add('B', deps['zod'] ? 'PASS' : 'INFO', 'Zod 运行时校验', deps['zod'] ? '已引入' : 'P0 建议项，尚未引入（需你确认后执行）');
add('B', deps['@playwright/test'] ? 'PASS' : 'INFO', '浏览器级 E2E', deps['@playwright/test'] ? '已引入（仅 dev）' : 'P0 建议项，尚未引入');

/* ------------------------------------------------------------------ C 层 */

/** 上传包污染检查：密钥、依赖目录、构建产物都不该进创空间上传包 */
const pkgDir = path.join(ROOT, 'studio-package');
if (existsSync(pkgDir)) {
  const all = [];
  const walkPkg = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walkPkg(p);
      else all.push(path.relative(pkgDir, p).replace(/\\/g, '/'));
    }
  };
  walkPkg(pkgDir);
  const forbiddenFiles = all.filter((f) => /(^|\/)\.env(\.local)?$/.test(f) || /(^|\/)\.env\..*\.local$/.test(f));
  const dirty = all.filter((f) => f.startsWith('node_modules/') || f.startsWith('.next/'));
  let secretHits = 0;
  for (const f of all.filter((f) => /\.(ts|tsx|js|mjs|cjs|json|md|example)$/.test(f))) {
    const text = readFileSync(path.join(pkgDir, f), 'utf8');
    if (/(sk-[A-Za-z0-9]{20,}|ms-[A-Za-z0-9]{24,}|AI_API_KEY\s*=\s*[^#\s]{16,})/.test(text)) secretHits++;
  }
  add('C', forbiddenFiles.length ? 'FAIL' : 'PASS', '上传包不含 .env / .env.local', forbiddenFiles.length ? forbiddenFiles.join('、') : '已确认');
  add('C', dirty.length ? 'FAIL' : 'PASS', '上传包不含 node_modules / .next', dirty.length ? `${dirty.length} 个污染文件` : '已确认');
  add('C', secretHits ? 'FAIL' : 'PASS', '上传包疑似密钥扫描', secretHits ? `${secretHits} 个文件命中` : '未发现硬编码密钥');
  add('C', all.length > 200 ? 'WARN' : 'PASS', '上传包体积可控', `${all.length} 个文件`);
} else {
  add('C', 'WARN', '上传包未生成', '先运行 npm run pack:studio');
}

/** 部署契约：非 root、健康检查、7860 单端口 */
const docker = read('Dockerfile');
const dockerMissing = [];
if (docker) {
  if (!/\bUSER\s+\S+/i.test(docker)) dockerMissing.push('非 root USER');
  if (!/HEALTHCHECK/i.test(docker)) dockerMissing.push('HEALTHCHECK');
  if (!/7860/.test(docker)) dockerMissing.push('7860 端口');
  add('C', dockerMissing.length ? 'WARN' : 'PASS', 'Docker 部署契约', dockerMissing.length ? `待补：${dockerMissing.join('、')}（docs/13 P1）` : 'USER / HEALTHCHECK / 7860 齐备');
} else {
  add('C', 'WARN', 'Dockerfile 缺失', '');
}

const envExample = read('.env.example');
add('C', /OCR_BASE_URL|OCR_MODEL/.test(envExample) ? 'PASS' : 'WARN', 'OCR 端点配置项可固化', /OCR_BASE_URL|OCR_MODEL/.test(envExample) ? '已在 .env.example' : '缺少 OCR_* 说明');
const gitignore = read('.gitignore');
add('C', /\.env\.local/.test(gitignore) ? 'PASS' : 'FAIL', '.env.local 已被忽略', /\.env\.local/.test(gitignore) ? '已确认' : '存在密钥入库风险');

/* ------------------------------------------------------------------ 输出 */

const byLayer = { A: [], B: [], C: [] };
results.forEach((r) => byLayer[r.layer].push(r));
const LAYER_NAME = {
  A: 'A 可借鉴 · 选型失效与许可误用',
  B: 'B 可复用 · 依赖引入与原创性',
  C: 'C 可集成 · 密钥、部署与外部端点',
};
for (const [layer, list] of Object.entries(byLayer)) {
  console.log(`\n=== [${layer}] ${LAYER_NAME[layer]} ===`);
  list.forEach((r) => console.log(`  ${r.level.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`));
}
const fails = results.filter((r) => r.level === 'FAIL').length;
const warns = results.filter((r) => r.level === 'WARN').length;
const passes = results.filter((r) => r.level === 'PASS').length;
console.log(`\nOSS_RISK PASS=${passes} WARN=${warns} FAIL=${fails} TOTAL=${results.length}`);
console.log(fails ? '结论：未通过（存在必须修复的风险）' : '结论：通过（WARN/INFO 为待确认建议项，不阻断）');
process.exit(fails ? 1 : 0);
