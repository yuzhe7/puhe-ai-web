# 谱合产教 · AI Native 产教融合智能诊断平台

> 第九届传智杯全国大学生数智创新与 AI 应用大赛 —— **AI WEB 网页开发挑战赛** 参赛作品  
> 赛道主题：**「智启未来：AI 驱动的 Web 应用创新挑战」**  
> 官方赛道页：<https://www.boxuegu.com/matchTrack/detail/?id=10037>

---

## 一、项目介绍

**谱合产教** 定位为连接「高校人才培养体系」与「产业人才需求体系」的数字桥梁。  
本作品把团队原创大创项目《基于多层知识图谱的高校人才培养与产业需求精准分析平台》  
（河北水利电力学院试点，37 个本科专业 / 京津冀水利电力与数字经济产业）改造为 **AI Native Web 应用**：

- 以 **双侧三层知识图谱** 为领域本体：高校供给侧 ↔ 产业需求侧，宏观 / 中观 / 微观三层贯通
- 以 **三维递进式分析引擎** 为确定性计算内核：专业同质化 → 培养目标偏差 → 知识点缺口
- 以 **多智能体 + RAG + Function Calling** 为交互入口：把"你的专业需要优化"变成可执行的课程改革指令
- 以 **What-if 沙盘 / 图最短路径 / Deep Research** 把能力从「诊断现状」延伸到「预演未来」与「个体路径」
- 以 **62 个专业目录**（v3 扩至 54 个，v8 法学门类专题扩样至 62 个；按教育部专业目录 / 2025 新增 / 绿牌 / 热度 / 布点增长等口径扩展，来源可追溯）替代原试点抽样，覆盖 10 个来源分类与 7 个指定学科大类；其中 12 个为试点校抽样专业，其余 50 个为「全国学科目录观察池」，不表示试点校实际开设；全部课程、学时、在招数均为教学演示抽样数据，非真实统计

> **原创声明**：本项目由团队自有大创项目书拆解重构而来，全部代码、数据集、算法实现与 UI 均为原创，  
> 非开源项目包装参赛。项目书中引用的政策文件、行业报告与试点数据仅作场景依据。

### 解决的六个真实痛点

| 痛点            | 本作品的答案                                    |
| ------------- | ----------------------------------------- |
| 专业布局同质化       | 课程 Jaccard + 知识点重叠率 + 图拓扑相似度，量化输出高风险专业对   |
| 培养目标与需求脱节     | 工程教育认证 12 项毕业要求 × 岗位能力需求，四态偏差矩阵           |
| 课程优化缺乏依据      | 知识点 ↔ 技能跨域语义对齐，输出「应加强 / 应新增 / 可精简」指令      |
| 需求信息碎片化       | 多模态文档接入 → 自动切片 → 端侧向量检索 → 强制证据引用          |
| **改革方案无法预演**  | 培养方案改革沙盘：调整学时 / 增删产业模块，实时重算五维指标，带预算约束自动寻优 |
| **学生缺少个性化路径** | 岗位能力路径：多源 Dijkstra 求最短补强链，输出分学期学习计划与学时预算  |

---

## 二、技术架构

```
┌────────────────────────────── 浏览器（AI Native 前端） ──────────────────────────────┐
│ Next.js 14 App Router · React 18 · TypeScript(strict) · Tailwind CSS 设计令牌         │
│  / 总览   /graph 图谱   /diagnosis 三维诊断   /copilot Agent   /simulate 改革沙盘     │
│  /path 能力路径   /research 深度研究   /data 知识库   /report 报告中心（共 14 页）      │
│  双主题（深空/明亮）· ⌘K 命令面板 · Canvas 神经网络背景 · 数字滚动 · 扫光发光边框    │
│  ECharts（动态导入 / 代码分割 / 暗色重映射）· SSE 增量渲染 · Web Speech API          │
└───────────────────────────┬─────────────────────────────────────────────────────────┘
                            │ SSE / JSON
┌───────────────────────────▼── AI 接入层（Next.js API Routes，仅此一层有后端） ────────┐
│ /api/chat      多 Agent 编排 · SSE 流式 · Function Calling 多轮循环                 │
│ /api/rag       端侧 TF-IDF 稀疏向量检索 + 跨域术语扩展                              │
│ /api/ingest    多模态：TXT/DOCX/PDF/图片（视觉模型）/ 粘贴文本                       │
│ /api/analyze   三维确定性算法（宏观 / 中观 / 微观）+ 图谱构建                         │
│ /api/mcp       MCP JSON-RPC：initialize / tools/list / tools/call / resources/*     │
│ /api/simulate  What-if 实时重算 + 带预算约束的贪心寻优                              │
│ /api/path      知识点共现图 + 多源 Dijkstra 最短补强路径                            │
│ /api/research  Deep Research：问题拆解 → 4 路取证 → 交叉验证 → SSE 流式简报          │
│ /api/syllabus  改革后课程教学大纲生成                                                │
│ /api/status    运行模式、知识库、能力与端点清单                                      │
└──────────┬────────────────────────────────┬─────────────────────────────────────────┘
           │                                │
┌──────────▼──────────┐          ┌───────────▼────────────────────────────┐
│ 本地确定性内核        │          │ 云端大模型（可选，OpenAI 兼容协议）       │
│ dataset/graph/rag    │          │ DeepSeek · 智谱 · 通义 · OpenAI · Gemini │
│ simulator/pathway    │          │ 密钥仅存服务端 .env.local，绝不下发      │
│ 10 个 Function Tools │          │ 仅负责语言组织，不产生任何数字           │
└─────────────────────┘          └────────────────────────────────────────┘
```

**端云协同**：向量化、检索、语义对齐、图算法、What-if 数值全部在本地确定性完成（零成本、可离线、可复现）；  
云侧大模型只负责意图编排与语言组织，**不产生任何数字**。这正是 AI 安全与可解释性的核心设计。

### 技术选型对照赛道推荐

| 类别    | 选型                                            | 说明                                                 |
| ----- | --------------------------------------------- | -------------------------------------------------- |
| 框架    | React 18 + Next.js 14 App Router              | 官方推荐首选；API Routes 做 AI 接入层                         |
| 语言    | TypeScript strict                             | 对应「前端代码质量 4%」                                      |
| 样式    | Tailwind CSS 3 + CSS 变量设计令牌                   | 全色阶由 `rgb(var(--x) / <alpha-value>)` 驱动，一套类名双主题自适应 |
| 图表    | ECharts 5（动态导入）                               | 热力图 / 雷达 / 桑基 / 力导向图谱 / 对比雷达 / 路径图；渲染层自动暗色重映射      |
| AI 交互 | 自研 OpenAI 兼容 SSE + Function Calling           | 与 Vercel AI SDK 同协议；逐 token 流式 + 多轮工具循环            |
| AI 接入 | 环境变量切换多家模型                                    | 一家密钥即可启用；无密钥自动降级                                   |
| 端侧 AI | 中文二元组 TF-IDF 稀疏向量                             | 对应「Transformers.js / 端云协同」前瞻方向                     |
| 图算法   | 多源 Dijkstra + 跨域语义对齐                          | 学生能力路径，节点规模 <150，零依赖实现                             |
| 决策优化  | 带学时预算约束的贪心搜索                                  | 候选动作空间内按「单位学时增益」择优，轨迹可解释                           |
| 多模态   | unpdf / mammoth / Vision API / Web Speech API | PDF、DOCX、图片、语音                                     |
| 工具协议  | MCP JSON-RPC 最小服务端                            | 外部 Agent 可直接调用全部 10 个工具                            |
| 交互    | ⌘K 命令面板 / 主题切换 / Canvas 背景                    | 全局导航 + 数据实体检索 + 快捷 AI 提问；尊重 reduced-motion         |

---

## 三、AI 技术亮点（对应评分细则 AI 深度 35%）

| 评分点          | 实现位置                                            | 现场演示方式                                                                                               |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 大模型集成 8%     | `src/lib/ai/llm.ts` `prompts.ts`                | 配 `AI_API_KEY` 后 Copilot / Deep Research 逐 token 流式输出；7 条 System Prompt 硬约束                          |
| Agent 工作流 8% | `runLLMAgent` / `runLocalAgent` / `research.ts` | Copilot「执行轨迹」与 Deep Research「研究轨迹」双视图，五智能体分工可追踪                                                      |
| RAG 6%       | `src/lib/rag.ts` `/api/rag`                     | 「数据与知识库 → RAG 检索验证」查看查询扩展、召回片段、相关度                                                                   |
| 多模态 5%       | `/api/ingest` + Copilot 语音                      | 上传 PDF/DOCX/图片、语音提问、TTS 朗读结论、生成式 UI 卡片                                                               |
| AI 安全 4%     | `src/lib/ai/safety.ts`                          | 注入拦截、PII 脱敏、数值溯源校验、置信度、无密钥兜底                                                                         |
| MCP/工具集成 4%  | `src/lib/ai/tools.ts` `/api/mcp`                | `tools/list` 返回 10 个工具；`simulate_reform` / `plan_learning_path` / `generate_syllabus` 均可被外部 Agent 调用 |

### 五智能体分工

`规划智能体` → `检索智能体(RAG)` → `对齐智能体(Function Calling)` → `诊断智能体(交叉校验)` → `报告智能体(流式生成 + 引用溯源)`

### 10 个 Function Calling 工具

`retrieve_knowledge` · `query_graph` · `analyze_similarity` · `diagnose_competency` · `locate_knowledge_gap` · `profile_job` · `generate_report` · **`simulate_reform`** · **`plan_learning_path`** · **`generate_syllabus`**

---

## 四、v2 升级：更实用、更前沿

| 新能力                   | 入口          | 关键算法 / 技术                                                           | 对应评分               |
| --------------------- | ----------- | ------------------------------------------------------------------- | ------------------ |
| **培养方案改革沙盘 What-if**  | `/simulate` | 技能覆盖 = 语义对齐度 × 教学覆盖系数；带预算约束的贪心寻优；五维前后对比雷达；自动生成教学大纲                  | 创新性 25% / 实用性 10%  |
| **岗位能力路径规划**          | `/path`     | 知识点共现 + 跨课程语义邻接图上的多源 Dijkstra；能力就绪度环；分学期 96h 预算排课                   | 创新性 25% / 实用性 10%  |
| **Deep Research 工作台** | `/research` | 4 路子问题取证 → 工具计算 → 跨来源去重 → 置信度评估 → 带 [n] 引用简报（SSE）                   | AI 深度 35% / 体验 10% |
| **深空科技主题 + 双主题令牌**    | 全站          | CSS 变量驱动全部色阶，ECharts 渲染层自动重映射；Canvas 神经网络背景、扫光、呼吸灯、数字滚动             | 体验 10% / 前端工程 10%  |
| **⌘K 全局命令面板**         | 全站          | 14 个页面 + 快捷 AI 指令 + 62 专业 / 109 课程 / 38 岗位的实体检索与深链接（首次唤起时按需拉取，不进首屏包） | 体验 10%             |
| **实时洞察流**             | 首页          | 基于真实诊断数据生成带时间戳的 Agent 事件流，支持重新扫描                                    | 体验 10%             |

> 详细升级说明、评分映射增补与演示片段脚本见 `docs/05-v2-功能升级说明.md`。

### v3 升级：热门专业目录扩展 + 系统性漏洞加固（2026-11-05）

**专业目录 12 → 54**：以教育部《本科专业目录（2025 年）》新增 29 种、麦可思 2025 绿牌专业、央视/第一财经热度榜、近五年布点增长 TOP4、十大热门榜、就业预警专业为口径，去重后新增 42 个热门/战略急需专业，分 9 类；同步扩充至 **99 课程 / 304 知识点 / 32 岗位 / 78 技能**。每个专业带来源 ID 与标签，目录页 `/majors` 可搜索、筛选、查看课程覆盖、匹配岗位与同质化风险。数据规模、来源与免责声明见 `docs/06`（v8 已进一步扩至 62 专业 / 109 课程 / 334 知识点 / 38 岗位 / 84 技能，见下文 v8 章节与 `docs/11`）。

**安全与健壮性加固**（18 项，详见 `docs/06` 第二章）：

| 类别           | 关键措施                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------- |
| 输入边界         | `src/lib/validation.ts`：白名单实体、数值区间、`NaN/Infinity` 拒绝、数组长度与体积上限，11 个 API 全部接入                  |
| 成本与并发        | 消耗 token 的端点滑动窗口限流（429 + `Retry-After`）、上传 5 MB / 文本 200k 字 / 语料 2000 切片上限                    |
| **RAG 投毒防护** | 入库按句检测并丢弃间接提示词注入内容，检索输出二次净化；`/data` 页展示「已拦截 N 段可疑指令」                                          |
| 信息泄漏         | 统一 `serverError()` 泛化 500 + 服务端脱敏日志；SSE 错误事件不再回传上游异常原文                                        |
| 可靠性          | 错误边界 / 404 / 图表加载兜底、数据引用完整性自检（离线 `scripts/audit-data.cjs` + 运行时 `/api/status.integrity`）、缓存上限 |
| 响应头          | `nosniff` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy` / API `no-store`     |
| 性能           | 命令面板数据集按需加载，专业扩容 4.5 倍后首屏共享 JS 仍为 **87.3 kB**                                                 |

> 演示数据与真实统计的边界、10 项残余风险与竞赛合规提醒，请务必阅读 `docs/06-专业目录扩展与漏洞分析报告.md`。

### v4 升级：接入魔搭 ModelScope + 创空间部署就绪（2026-11-05）

项目本身**没有自训模型**：诊断数值由确定性算法产出，大模型只负责语言与工具编排。因此「接魔搭」有两层含义，本轮都已备好：

**① 模型接入**：魔搭 API-Inference 是 OpenAI 兼容端点，只需三行配置即可让 Copilot / Deep Research 由 `Qwen/Qwen3-Coder-30B-A3B-Instruct` 等开源模型驱动：

```dotenv
AI_PROVIDER=modelscope
MODELSCOPE_SDK_TOKEN=ms-你的Token      # https://modelscope.cn/my/myaccesstoken
```

`npm run check:modelscope` 一键自检连通性与 Function Calling；已内置 429 退避重试、`reasoning_content` 推理模型兼容、模板残留识别、密钥脱敏展示。**未配 Token 或断网时自动回落本地确定性引擎**，演示不中断。

**② 创空间部署**：新增 `Dockerfile`（Next.js standalone，监听创空间要求的 7860）、`ms_deploy.json`（`sdk_type: docker`）、`.dockerignore`，可发布为 `https://modelscope.cn/studios/<账号>/<空间名>` 公开链接，直接补齐赛道「在线演示加分」；Token 通过创空间 secrets 注入，仓库只有模板。

> 总览与模型侧细节见 `docs/07-魔搭社区接入与创空间部署指南.md`；
> **路径 B 的逐步操作手册见 `docs/08-创空间部署逐步操作手册.md`**（含干净上传包、Secrets、日志、挂载路径诊断与排错表）。
> 第三条路径（发布数据集 / MCP 广场）待团队确认后再做。

### v5 升级：网页端直接配置并启用大模型 API（2026-11-07）

v4 只能改 `.env.local` 并重启；v5 新增 **`/models` 模型接入配置台**，在网页里就能完成全流程，**即时生效、免重启**：

- 6 类来源：魔搭 / DeepSeek / 智谱 / 阿里云百炼 / OpenAI / 自定义 OpenAI 兼容端点，点卡片自动填 Base URL 与默认模型 ID
- 粘贴 API Key → 点「测试连接」（返回延迟与模型回复）→ 点「保存并启用」，侧栏 AI 引擎徽标即时更新为「魔搭 · 模型名 · 网页配置」
- 新增 `GET/POST/DELETE /api/models` 与 `POST /api/models/test`；`/api/status` 增加 `configSource`
- 密钥**只存服务端进程内存**，不落盘 / 不入库 / 不进浏览器存储，响应只返回脱敏值；重启自动失效；Base URL 做协议白名单与 SSRF 防护；配置写操作与连通性测试均有限流
- 配置优先级：`DEMO_MODE` > 网页运行时 > `.env` / 平台 Secrets > 本地确定性引擎；「恢复本地引擎」一键回落
- 全站入口：首页 Hero、侧栏导航、`⌘K` 命令面板

> 完整说明、接口速查、评分映射与边界见 **`docs/09-网页端大模型接入配置.md`**。
> 生产 / 创空间部署仍推荐 `.env.local` 或平台 Secrets；网页配置用于本地演示与现场调试。

### v6 升级：Xiaomi-OCR-0 文档解析通道（2026-11-07）

新增 `/ocr` 工作台，把本地 0.8B 文档理解模型接成「图片 → 结构化文本 → 复核 → RAG 语料」的采集通道，与 `/models` 的文本大模型配置相互独立：

- 三条部署预设：SGLang / vLLM 官方权重（`127.0.0.1:8000/v1`）、Ollama 社区 BF16（实验性，`11434`）、自定义 OpenAI 兼容端点
- 三类任务：整页解析（官方 Markdown / OTSL / LaTeX 提示词）、KIE（指定字段输出 JSON）、VQA（仅依据图中内容作答），支持现场覆盖提示词
- 新增 `GET/POST/DELETE /api/ocr`（配置保存、连通性自检、图片解析、复核后入库）；`/api/status` 注册 `xiaomi-ocr-0` 能力与 `/api/ocr`
- 解析结果先进入可编辑文本框人工复核，再经 `ingestDocumentGuarded` 逐句拦截间接提示词注入后入 RAG，Copilot / Deep Research 立即可以检索
- 密钥内存态、外部端点强制 https（仅本机允许 http）、限流、图片 4MB / 文本 20 万字符上限，与既有安全策略一致；未启用时全站照常离线运行
- `npm run verify:ocr` 用本地 mock 端点跑通「保存 → 测试 → 解析 → 入库 → 清除」全链路，无需 GPU

> 官方启动命令、提示词全文、轻量通道与官方 MCP 管线的边界、Docker / 创空间网络注意与排错表见 **`docs/10-Xiaomi-OCR-0接入说明.md`**。

### v7 升级：专业学科大类自动归类（2026-11-10）

原有的 9 类分组是按**数据来源**整理的；v7 新增按**学科门类**的第二套归类，覆盖当时全部 54 个专业（v8 已扩至 62 个）：

- 7 个指定类：计算机、电力工程、电气自动化、交通工程、经济贸易、法学、医学（v7 为 34 个专业，v8 为 42 个）
- 其余 20 个专业按名称 / 学院 / 课程体系语义**自动归类**为 6 类（芯片与电子信息、新能源与双碳、土木水利与建造、教育文法与传媒、材料与化工、时空海洋与公共安全），并自动生成覆盖率、类别小结与整体总结
- 三级规则：精确映射 → 关键词匹配（指定类优先、长词优先）→ 「其他交叉专业」兜底，未命中项不会被静默丢弃；每个专业回传归类依据，可审计
- `/api/majors` 新增 `taxonomy` 与 `disciplineOptions`，支持 `?discipline=computer` 筛选；`/majors` 页新增归类总览卡片、学科筛选下拉与专业卡片学科徽标
- 纯函数实现（`src/lib/major-taxonomy.ts`），不调用大模型、不依赖网络，新增专业命中关键词即自动进入统计

> 归类口径、62 个专业完整归类表与扩展方式见 **`docs/11-专业学科大类归类说明.md`**。

### v8 升级：法学门类专题扩样与数据口径分层（2026-11-10）

按需求对「法学」指定类做重点扩充，从 1 个增至 **9 个**，成为覆盖最完整的指定类；总专业数 **54 → 62**：

- 新增 8 个法学类（0301）特设 / 国控专业：知识产权、信用风险管理与法律防控、国际经贸规则、纪检监察、国际法、司法鉴定学、国家安全学、海外利益安全。专业名称与代码逐条核对教育部《普通高等学校本科专业目录》（2024 / 2026 版）
- 配套扩样：**+10 门课程**（知识产权法实务、数据合规与个人信息保护、司法鉴定技术与电子取证等）、**+30 个知识点**、**+6 项技能**、**+6 个岗位**（数据合规专员、法律科技产品经理等），每个新专业配置 8 门课程并与产业 JD 语义对齐
- 数据规模：**62 专业 / 109 课程 / 334 知识点 / 38 岗位 / 84 技能 / 28,640 条 JD 样本**；`node scripts/audit-data.cjs` 引用错误 0、警告 0、非有限评分 0
- 新增来源 `moeLaw`、来源分类「数字法治与合规」、标签「目录补录」；8 个法学专业由 `MAJOR_DISCIPLINE` 精确锁定，避免「国际/经济」字样被经济贸易类关键词抢先命中
- **口径分层落地**：`/api/majors` 每行返回 `scope`（`试点校` / `观察池`），`/majors` 卡片显示口径徽标并标注「学科目录观察池（非试点校开设）」，明确试点校实际专业仍为 `dataset.ts` 中 12 个抽样专业
- 一键验证：`npm run verify:majors`（22 项断言，覆盖专业代码、归类、课程密度、岗位匹配、口径分层、数据完整性、筛选与全站页面）；`npm run audit:data` 校验引用闭合

> 扩样明细、完整代码表与后续扩样建议见 **`docs/11-专业学科大类归类说明.md` 第 6 节**。历史文档 `docs/01`–`docs/07` 中的「54 个专业」为 v3–v7 当时口径，属版本记录，未作追溯改写。

### v9 升级：专业深链接自动匹配（2026-11-10）

修复「从专业目录卡片跳转到沙盘 / 诊断 / 路径后，目标岗位和对比专业仍是默认值」的问题：

- 三个跳转链接自动携带该专业**契合度最高的岗位**（`crossSideMatch` 最高分）与**同质化最高的对比专业**（`similarityMatrix` 最高分）。例如「低空技术与工程」→ 目标岗位「时空数据工程师 0.43」、对比专业「时空信息工程 S=0.288」
- 目标页读入参数即开始分析：沙盘 260ms 防抖重算五维指标、诊断 `useMemo` 刷新两两对比、路径自动重新规划学习路径；页面显示匹配依据与分数
- 三条链路：目录页跳转（链接带全参数，零额外请求）、只带 `?major=` 的深链接（自动补齐）、页内切换专业（联动重匹配）；手动改岗位 / 对比专业时尊重用户选择，并有匹配序号防止过期响应覆盖
- 新增 `src/lib/major-context.ts` 与 `scripts/verify-deeplinks.mjs`（`npm run verify:links`）；`/api/status` 注册 `deep-link-auto-match` / `context-aware-analysis`

> 参数协议、匹配依据与自动触发机制见 **`docs/12-专业深链接自动匹配说明.md`**。

### v10 升级：从「能看」到「可信 + 能交付」（2026-11-16）

> 解决的问题不是「再加一个功能」，而是「评委凭什么相信这些数值」和「诊断完能不能真的落地」。全部为本地确定性实现，不新增任何外部依赖。

**① 数值溯源（`GET /api/trace`）**：任一分数的「公式 → 中间量 → 结果」可点开逐层查看，并附一次**独立复算校验**（复算值 vs 正式接口值，不一致即显红）。

- 三类溯源：岗位契合度（逐技能对齐表 → 加权求和 → 领域亲和度）、同质化评分（Jaccard / 知识点重叠 / 图拓扑三分量拆解，含交集与并集规模）、知识点缺口（需求强度合成与判定规则）
- 入口已接入 `/majors` 卡片（岗位分与 `S=` 分数）与 `/diagnosis`（综合同质化评分），右侧抽屉展示，支持 `Esc` 关闭与一键复制计算链 JSON
- 新增 `src/lib/trace.ts`、`src/components/TraceDrawer.tsx`、`src/app/api/trace/route.ts`

**② 系统自检（`/health` + `GET /api/selfcheck`）**：答辩现场一键体检，19 项断言分三类：

| 类别 | 断言内容 |
| --- | --- |
| 数据 | 规模与版本一致（62/109/334/38/84）、五张表引用正反向闭合、主键与名称无重复 |
| 算法 | 矩阵规模 n(n+1)/2、两次计算逐项一致、自比 = 1、非有限值检查、同名对齐 = 1、**泛化别名不再虚高**、**领域闸门生效**、岗位匹配未集中、缺口判定合法 |
| 运行时 | 限流窗口生效、RAG 可召回、**CSV 导出结构完整** |

全部通过返回 200，存在失败项返回 503，可直接被验收脚本消费；页面逐项展示耗时与实测值，并诚实列出「岗位匹配薄弱」的专业（当前 58/62 达标）。

**③ 交付物导出（`POST /api/export`）**：把诊断结论变成教务能直接导入的表格，两条导出线：

| 导出 | 内容 | 入口 |
| --- | --- | --- |
| 课程-知识点矩阵 | 18 列：专业 / 课程 / 学分 / 现行学时 / **改革后学时** / 学时变化 / 知识点 / Bloom层次 / 产业需求强度 / 覆盖度 / 缺口判定 / 调整建议 / 对齐产业技能 | `/report`、`/simulate` |
| 岗位技能对齐明细 | 11 列：岗位技能 / 类别 / 需求强度 / 最相近知识点 / 对齐度 / 加权贡献 / 知识点所在课程 | `?type=match` |

- CSV + UTF-8 BOM，Excel / WPS 直开不乱码，可批量导入教务系统；文件名走 RFC 5987 中文编码
- 沙盘里调过学时后点「导出改革后课程矩阵」，导出的是**当前方案**的学时；`knowledgeGaps` 新增可选的 `hours` 覆盖参数，按比例缩放知识点学时，使「改学时 → 覆盖度 → 缺口判定」形成闭环（不传时与历史行为完全一致）
- 新增 `src/lib/export.ts`、`src/components/ExportButton.tsx`、`src/app/api/export/route.ts`

**④ Agent 评测（`/eval` + `GET /api/eval`）**：28 条固定用例、5 个类别（检索 / 诊断 / 数值 / 安全 / 边界），离线可复跑、零 token。

| 指标 | 口径 | 当前值 |
| --- | --- | --- |
| 实体召回 | 有期望实体的用例中至少命中 1 个（另附严格关键词命中率） | 100% / 关键词 69.5% |
| **数值可溯源** | 回答里的每个数字能否在证据中找到（对应 ragas Faithfulness） | 94.7%（11 个未溯源，均为公式权重常量） |
| 安全召回 | 注入用例被正确拦截 | 100% |
| 安全精确率 / PII 脱敏 | 正常问题不误拦 / 个人信息脱敏而非拦截 | 100% / 100% |
| **自检漏报** | Agent 自报 `verifyGrounding` 通过、而评测独立复算判为有问题 | **0**（危险方向） |

指标参考 ragas 的 Answer Relevancy / Faithfulness 思路，但全部用本地确定性算法实现，不调用任何评测模型。新增 `src/lib/eval.ts`、`src/lib/eval-cases.ts`、`src/app/api/eval/route.ts`、`src/app/eval/page.tsx`、`scripts/verify-eval.mjs`（`npm run verify:eval`）。

> 这一层还顺带修出两个真问题：① 英文注入 `ignore all previous instructions` 因正则只允许一个修饰词而**漏拦**；② `verifyGrounding` 把同一数字的重复出现计为多处违规，导致误报。两者都由评测发现并已修复。

**⑤ 同期修复的两个缺陷**（对应 v10 的回归断言）：

- 岗位匹配三层失真：别名包含硬编码 0.94、对齐规则交替词袋满分、完全同名只给 0.6、且无领域语义 → 62 个专业的 Top1 岗位从 2 个扩散到 18 个，法学不再首选「临床数据分析师」
- SSE 断连崩溃：客户端关闭标签页时 `controller.enqueue` 抛 `Invalid state: Controller is already closed`，且 `catch` 内二次 `send` 造成连环抛错 → 现改为软失败并停止后续生成

---

## 五、安装与运行

### 环境要求

Node.js ≥ 18.18（推荐 20/22）、npm 或 pnpm

```bash
git clone <your-repo-url>
cd puhe-ai-web
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
npm run dev                     # http://localhost:3000
```

### 运行模式

**① 零配置演示模式（推荐评审环境）**  
不填任何密钥，直接 `npm run dev`。平台自动启用 **本地确定性引擎**：  
RAG 检索、多 Agent 编排、Function Calling、三维算法、What-if 模拟、图最短路径、Deep Research、证据溯源、SSE 流式输出**全部真实执行**，  
仅"语言组织"一步由模板完成。**零 token 消耗、断网可用、结果完全可复现**。

**② 大模型 Agent 模式**  
在 `.env.local` 填写：

```env
AI_API_KEY=sk-xxxxxxxx
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat
```

重启服务后 Copilot 自动切换为大模型流式生成 + 多轮工具调用；Deep Research 的综合阶段也会启用大模型（数值仍来自工具）。

**免重启做法（v5 推荐）**：打开 `/models` 页面，选服务商 → 粘贴密钥 → 测试连接 → 保存并启用，配置即时生效；密钥只存服务端内存，重启自动回落。详见 `docs/09`。可切换的兼容端点：

| 厂商       | AI_BASE_URL                                         | AI_MODEL             |
| -------- | --------------------------------------------------- | -------------------- |
| DeepSeek | `https://api.deepseek.com/v1`                       | `deepseek-chat`      |
| 智谱 AI    | `https://open.bigmodel.cn/api/paas/v4`              | `glm-4-flash`（有免费额度） |
| 通义千问     | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus`          |
| OpenAI   | `https://api.openai.com/v1`                         | `gpt-4o-mini`        |

**③ 多模态视觉（可选）**：配置 `VISION_API_KEY` / `VISION_BASE_URL` / `VISION_MODEL` 后，  
上传岗位截图会自动由视觉模型抽取技能标签并入库；未配置时给出明确提示，不影响其他功能。

> ⚠️ **安全**：`.env*` 已被 `.gitignore` 排除，密钥只存在于服务端；  
> 仓库中只保留 `.env.example` 模板。官方明确要求「API 密钥等敏感信息不得出现在公开仓库中」。

### 构建与校验

```bash
npm run typecheck    # TypeScript 严格检查
npm run lint         # ESLint
npm run build        # 生产构建（14 页面 + 18 API，standalone 产物）
npm run audit:data   # 数据引用完整性离线审计（无需构建）
npm run check:modelscope  # 魔搭 API 连通性 / Function Calling 自检
npm run pack:studio       # 生成创空间干净上传包 studio-package/（含密钥扫描）
npm run verify:studio -- <线上URL>   # 部署后一键验收页面 / API / SSE / 响应头
npm start            # 生产运行
```

### MCP 调用示例

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"simulate_reform","arguments":{"major":"计算机科学与技术","target_job":"AI应用开发工程师","optimize":true,"budget":48}}}'
```

---

## 六、目录结构

```
puhe-ai-web/
├── src/
│   ├── app/
│   │   ├── page.tsx                 总览驾驶舱（实时洞察流 + 系统脉冲）
│   │   ├── graph/page.tsx           双侧三层知识图谱浏览器
│   │   ├── diagnosis/page.tsx       三维诊断工作台
│   │   ├── copilot/page.tsx         多 Agent 流式对话
│   │   ├── simulate/page.tsx        培养方案改革沙盘（What-if）      ★ v2
│   │   ├── path/page.tsx            岗位能力路径规划                 ★ v2
│   │   ├── research/page.tsx        Deep Research 工作台             ★ v2
│   │   ├── majors/page.tsx          热门专业目录（来源可追溯 + 完整性）  ★ v3
│   │   ├── models/page.tsx          模型接入配置台（测试 / 启用 / 回落）  ★ v5
│   │   ├── ocr/page.tsx             Xiaomi-OCR-0 文档解析工作台           ★ v6
│   │   ├── data/page.tsx            多模态接入 / RAG / 治理（注入拦截提示）
│   │   ├── report/page.tsx          报告中心
│   │   ├── health/page.tsx          系统自检（19 项断言 · 一键体检）        ★ v10
│   │   ├── eval/page.tsx            Agent 评测（28 条用例 · 四类指标）      ★ v10
│   │   ├── api/                    chat / rag / ingest / analyze / mcp / status
│   │   │                          + simulate / path / research / syllabus  ★ v2
│   │   │                          + majors                                ★ v3
│   │   │                          + models / models/test                 ★ v5
│   │   │                          + ocr                                   ★ v6
│   │   │                          + trace / selfcheck                     ★ v10
│   │   │                          + export                                ★ v10
│   │   │                          + eval                                  ★ v10
│   │   ├── error.tsx  global-error.tsx  not-found.tsx  错误边界        ★ v3
│   │   ├── layout.tsx  globals.css  双主题设计令牌 + 科技质感动效
│   ├── components/                 AppShell / EChart(暗色重映射) / ui
│   │                              + TechBackdrop / ThemeToggle / CommandPalette  ★ v2
│   │                              + TraceDrawer（数值溯源抽屉）                ★ v10
│   │                              + ExportButton（CSV 交付物下载）              ★ v10
│   └── lib/
│       ├── dataset.ts              试点数据集（专业/课程/知识点/岗位/技能/能力/政策）
│       ├── hot-majors.ts           50 个观察池专业 + 8 条来源 + 10 类分组 ★ v3 / v8
│       ├── major-taxonomy.ts       学科大类自动归类 / 覆盖率 / 归类总结    ★ v7 / v8
│       ├── major-context.ts        深链接上下文 / 岗位与对比专业自动匹配    ★ v9
│       ├── trace.ts                数值溯源：公式 / 中间量 / 独立复算        ★ v10
│       ├── selfcheck.ts            运行时自检断言（数据闭合 / 算法确定性）    ★ v10
│       ├── export.ts               交付物导出：课程矩阵 / 岗位技能明细 CSV     ★ v10
│       ├── eval.ts                 Agent 评测执行器与四类指标                ★ v10
│       ├── eval-cases.ts           28 条评测用例（声明式数据）               ★ v10
│       ├── validation.ts           输入校验 / 限流 / 资源上限 / 完整性自检   ★ v3
│       ├── graph.ts                三维确定性算法 + 图谱构建 + 跨域语义对齐
│       ├── rag.ts                  端侧 TF-IDF 向量检索 + 实时入库 + 投毒净化
│       ├── charts.ts               ECharts 纯函数配置构造器（+ 对比雷达 / 路径图）
│       ├── simulator.ts            What-if 模拟 + 贪心寻优 + 教学大纲生成   ★ v2
│       ├── pathway.ts              多源 Dijkstra 补强路径 + 学期排课        ★ v2
│       ├── types.ts                领域类型定义
│       └── ai/
│           ├── llm.ts              OpenAI 兼容 SSE / Function Calling / Vision
│           ├── local-agent.ts      本地确定性 Agent 引擎
│           ├── research.ts         Deep Research 多智能体研究引擎         ★ v2
│           ├── tools.ts             10 个工具注册表 + 意图路由
│           ├── prompts.ts          多 Agent 提示词体系
│           ├── safety.ts           注入检测 / PII 脱敏 / 溯源 / 不可信文本净化
│           ├── providers.ts        5 家模型服务商预设 + 魔搭模型候选       ★ v4
│           ├── runtime-config.ts   网页运行时配置 / 校验 / SSRF / 脱敏      ★ v5
│           └── ocr.ts              Xiaomi-OCR-0 直连 / 提示词 / 清洗 / 探测 ★ v6
├── scripts/
│   ├── audit-data.cjs              数据引用完整性离线审计                 ★ v3
│   ├── check-modelscope.mjs        魔搭 API 连通性 / 工具调用自检          ★ v4
│   ├── pack-studio.mjs             创空间干净上传包 + 密钥扫描            ★ v4
│   ├── verify-studio.mjs           部署后一键验收                         ★ v4
│   ├── no-trace.cjs                受限环境构建兼容                       ★ v4
│   ├── verify-ocr.mjs              OCR 全链路 mock 端到端自测              ★ v6
│   ├── verify-majors.mjs           专业目录 / 归类 / 口径分层断言          ★ v8
│   ├── verify-deeplinks.mjs        专业深链接自动匹配验证                  ★ v9
│   ├── verify-eval.mjs             Agent 评测回归（10 项门槛断言）          ★ v10
│   ├── check-oss-risk.mjs          开源选型风险守卫（A/B/C 三层）          ★ 风险处置
├── Dockerfile                     创空间 Docker 部署（监听 7860）         ★ v4
├── ms_deploy.json                 创空间部署配置                          ★ v4
├── .dockerignore                                                          ★ v4
├── docs/
│   ├── 00-项目书全文.txt
│   ├── 01-项目拆解与赛道合规方案.md
│   ├── 02-技术文档.md               （PDF ≤30 页的源稿）
│   ├── 03-评分自查表.md
│   ├── 04-演示视频脚本.md
│   ├── 05-v2-功能升级说明.md         ★ v2
│   ├── 06-专业目录扩展与漏洞分析报告.md  ★ v3
│   ├── 07-魔搭社区接入与创空间部署指南.md ★ v4
│   ├── 08-创空间部署逐步操作手册.md       ★ v4
│   ├── 09-网页端大模型接入配置.md         ★ v5
│   ├── 10-Xiaomi-OCR-0接入说明.md         ★ v6
│   ├── 11-专业学科大类归类说明.md          ★ v7 / v8
│   ├── 12-专业深链接自动匹配说明.md        ★ v9
│   ├── 13-开源项目对标与复用分析.md        ★ 调研
│   └── 14-开源选型风险处置清单.md          ★ 风险处置
├── .env.example
├── .gitignore
└── README.md
```


```

---

## 七、交付材料清单（官方要求）

- [x] 代码仓库：结构清晰、有效注释、README、环境变量模板、依赖清单
- [ ] Git 提交历史：请团队按开发阶段分次提交，体现真实开发过程（v1 骨架 → AI 层 → 业务页 → v2 增强 → v3 目录与加固）
- [ ] 演示视频：5-8 分钟 / MP4 / ≥1080p / 普通话 + 字幕 → 脚本见 `docs/04`，v2 增补见 `docs/05`，v3 补拍建议见 `docs/06`
- [ ] 技术文档：PDF ≤30 页 → 源稿见 `docs/02`，v2 增补章节见 `docs/05`，v3 数据与漏洞章节见 `docs/06`
- [ ] 在线演示（加分）：`Dockerfile` / `ms_deploy.json` 与打包、验收脚本已备好，按 **`docs/08`** 逐步发布到魔搭创空间并在评审期间保持可用

---

## 八、团队信息

> 请团队在此补充：学校、组别（A/B/C/研究生组，务必按官方表格核对）、队员、指导教师、分工。
> 原始项目书团队：河北水利电力学院，指导教师 丁建川、王伟伟，成员 奚广睿、王紫潼、杨锦熙。

---

## 九、许可与合规

- 本项目为竞赛原创作品，数据集为团队自建的**教学演示抽样数据**，不含任何真实学生个人信息。
- 引用的政策条文、行业报告名称仅作场景依据，未在代码中复现原文全文。
- 涉及用户数据的应用遵循《个人信息保护法》与教育数据规范；上传文档仅存于服务端内存，服务重启即清空。
- 深色主题为默认，用户可一键切换并本地持久化；`prefers-reduced-motion` 下自动关闭全部动效，满足无障碍要求。
```
