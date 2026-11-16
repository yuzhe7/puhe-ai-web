# Xiaomi-OCR-0 接入说明（文档解析 → RAG 语料通道）

> 适用版本：v6（2026-11-07）｜项目根目录：`E:\WorkBuddy\项目\谱合产教`
> 官方仓库：<https://github.com/SeerRay-Lab/Xiaomi-OCR-0>
> 模型卡：<https://huggingface.co/xiaomi-research/Xiaomi-OCR-0> ｜ <https://www.modelscope.cn/models/xiaomi-research/Xiaomi-OCR-0>

## 1. 为什么接这个模型

Xiaomi-OCR-0 是 0.8B 参数的 **文档理解专用**视觉语言模型（基于 Qwen3.5-0.8B，约 1.7 亿条 OCR 语料训练），一个模型同时支持三类任务：整页文档解析、关键信息抽取（KIE）、OCR 视觉问答（VQA）。官方 Real5-OmniDocBench 95.24、OmniDocBench v1.6 96.83，对扫描、翻拍、倾斜、光照不均等真实采集场景尤其稳健。

本项目的原始资料大量是 **图片 / 扫描件**：培养方案、课程大纲、招聘 JD 截图、政策文件。因此把它接成「文档采集通道」，而不是 Copilot 的文本对话模型：

```
图片/扫描件 → Xiaomi-OCR-0 解析 → 人工复核 → 注入防护 → RAG 语料
                                              ↓
                       Copilot / Deep Research / 诊断工作台检索到新证据
```

它与 `/models` 页配置的大模型 **相互独立**：OCR 只在文档采集时调用本地 0.8B 模型，不改变 Copilot、Deep Research 的对话模型；未启用 OCR 时平台其余功能照常离线运行。

## 2. 三条部署路线（模型跑在本机，不上传图片到公网）

| 路线 | 端点 | 模型 ID | 适用 |
| --- | --- | --- | --- |
| SGLang / vLLM · 官方权重 | `http://127.0.0.1:8000/v1` | `SeerRay-Lab/Xiaomi-OCR-0` | 精度优先，需兼容 `Qwen3_5ForConditionalGeneration` 的运行时与 GPU |
| Ollama · 社区 BF16（实验性） | `http://127.0.0.1:11434/v1` | `longwayxu/xiaomi-ocr-0:bf16` | 桌面机 / CPU，约 1.8GB，官方标注为实验性 |
| 自定义 OpenAI 兼容端点 | 自填（外部必须 https） | 自填 | 已有网关 / 自建服务 |

启动命令（官方 README，二者选一，保持终端开启）：

```bash
# vLLM
vllm serve SeerRay-Lab/Xiaomi-OCR-0 \
  --host 127.0.0.1 --port 8000 \
  --trust-remote-code --max-model-len 16384

# SGLang
python -m sglang.launch_server \
  --model-path SeerRay-Lab/Xiaomi-OCR-0 \
  --host 127.0.0.1 --port 8000 --context-length 16384
```

```bash
# Ollama（实验性、无需 GPU）
ollama pull longwayxu/xiaomi-ocr-0:bf16
# 保持 ollama serve 运行，OpenAI 兼容端点默认 /v1
```

> 首次启动 SGLang / vLLM 会下载约 0.8B 权重；请确认运行时版本支持 Qwen3.5 图像输入，并把监听地址绑定在 loopback（官方建议）。

## 3. 网页端启用（无需改 `.env`、无需重启）

1. 打开 `/ocr`（侧栏「OCR 文档解析」或 ⌘K 搜索「OCR」）。
2. 在「选择部署路线」点击对应预设，Base URL 与模型 ID 自动填入。
3. 本地网关 **API Key 留空**；外部网关才需要填密钥，且地址必须 https。
4. 点「测试连接」：优先探测 `GET /v1/models`，端点不支持时回落一条极短补全请求。返回「模型 ID 匹配」后再用真实图片验证。
5. 点「保存并启用」：配置写入服务端进程内存（重启失效），状态卡变为「OCR 已启用」。
6. 上传图片 → 选任务 → 开始解析 → 在文本框修正错字 → 「复核后入库 RAG」。

也可用环境变量固定配置（创空间 / Docker 推荐）：

```dotenv
OCR_BASE_URL=http://127.0.0.1:8000/v1
OCR_MODEL=SeerRay-Lab/Xiaomi-OCR-0
OCR_API_KEY=            # 本地网关可留空
```

优先级：`DEMO_MODE=true`（强制关闭） > 网页运行时配置 > `.env` / Secrets > 未启用。

## 4. 三类任务与提示词

统一走 OpenAI 兼容 `POST {baseUrl}/chat/completions`，`temperature: 0`、`max_tokens: 4096`、`stream: false`，消息体为 `image_url` + `text`（与官方 image–instruction–response 格式一致）：

```json
{
  "model": "SeerRay-Lab/Xiaomi-OCR-0",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
      { "type": "text", "text": "<任务指令>" }
    ]
  }],
  "temperature": 0,
  "max_tokens": 4096,
  "stream": false
}
```

| 任务 | 输出 | 指令 |
| --- | --- | --- |
| `parse` 整页解析 | Markdown（表格 OTSL、公式 LaTeX） | 官方原文：`Extract all information from the main body of the document image and represent it in markdown format, ignoring headers and footers. Tables should be expressed in OTSL format, formulas in the document should be represented using LATEX format, and the parsing should be organized according to the reading order.` |
| `kie` 关键信息抽取 | 单个 JSON 对象 | 指定字段后生成 schema 指令：`Extract the following key information ... Keys: {FIELDS} ... return ONE valid JSON object only`；留空则抽取全部键值对 |
| `vqa` 文档视觉问答 | 简洁文本 | `Answer the question ... using only information visible in the image ... Question: {QUESTION}` |

页面「查看 / 覆盖提示词」可展示官方模板，也允许现场填写自定义指令（上限 2000 字符）做对比实验。

## 5. 接口一览：`/api/ocr`

| 方法 | 参数 | 作用 |
| --- | --- | --- |
| `GET` | — | 当前脱敏配置、预设、任务模板、限制说明、语料统计 |
| `POST` | `action=save` + `preset/baseUrl/apiKey/model` | 校验并启用端点 |
| `POST` | `action=test` + 表单字段，或 `{useCurrent:true}` | 连通性自检 |
| `POST` | `action=parse` + `image`（dataUrl）/`task`/`fields`/`question`/`customPrompt` | 图片解析 |
| `POST` | `action=ingest` + `text`/`title` | 复核后入库（逐句拦截提示词注入） |
| `POST action=clear` / `DELETE` | — | 清除网页配置 |

约束：图片 ≤ 4MB、请求体 ≤ 8MB、文本 ≤ 20 万字符；配置/测试/解析/入库分别限流（测试 8 次/分、解析与入库 20 次/分）。错误只返回分类提示，不回传上游响应体、请求头或异常原文。

## 6. 安全设计

- **密钥**：只存在于当前 Node 进程内存，不写磁盘、不进浏览器存储、不进日志；响应仅返回 `maskToken()` 脱敏值（前 3 后 2）。
- **SSRF**：Base URL 禁止账号密码 / 查询参数 / 片段；外部端点强制 https，仅 `localhost` / `127.0.0.1` / `::1` 允许 http；协议白名单 http/https。
- **不可信输入**：OCR 文本属于外部内容，入库统一走 `ingestDocumentGuarded`，逐句检测并丢弃「间接提示词注入」片段，页面显示「已拦截 N 段可疑指令」。
- **人工复核**：解析结果先进入可编辑文本框，用户确认后才入库，避免识别错误污染知识库。
- **降级**：未配置端点 / DEMO_MODE / 服务不可达时，OCR 通道给出明确提示，其余 10 个工具、Copilot、诊断、沙盘全部不受影响。

## 7. 与官方 MCP 管线的边界（务必如实说明）

官方 MCP（`skills/xiaomi-ocr`）负责：提示词、图像与 PDF 预处理、**PP-DocLayoutV3 区域切分**、分块并发推理、阅读顺序还原、**OTSL → HTML 表格转换**、LaTeX 与重复输出处理。本项目实现的是「单张图片 → 一次 `/chat/completions`」的**轻量直连通道**，因此：

- 只支持单张图片，不支持 PDF 多页预处理与 region 模式；
- 解析结果保留官方模型输出的 OTSL 标记，未转 HTML（页面检测到会显示「含 OTSL 表格标记」）；
- 不负责官方的「非思考」解码设置，由推理服务自身的 chat template 决定；
- Ollama BF16 转换版与官方 HF 权重不保证数值等价，精度敏感场景请用 vLLM / SGLang 原始权重。

若需要完整的两阶段版面解析，可在同一推理服务上叠加官方 MCP，把其输出通过 `/api/ingest` 的「粘贴文本」通道入库——两条链路共用同一套 RAG 防护。

**Docker / 创空间注意**：容器内 `127.0.0.1` 指向容器自身，不是宿主机。若推理服务跑在宿主机，请填 `http://host.docker.internal:8000/v1`（需 Docker 支持）或把推理服务与容器放进同一网络；外部地址必须 https。

## 8. 端到端自测（无需真实 GPU）

`scripts/verify-ocr.mjs` 会在本机起一个 mock OpenAI 兼容端点，模拟 `/v1/models` 与 `/v1/chat/completions`，跑通「保存 → 测试 → 解析 → 入库 → 清除」全链路：

```bash
# 先启动项目（另一个终端）
npm start -- -p 3000

# 再运行自测
npm run verify:ocr
# 或：PUHE_BASE_URL=http://127.0.0.1:7860 node scripts/verify-ocr.mjs
```

自测覆盖：配置保存、表单与当前配置两种连通性探测、图片解析返回 Markdown、RAG 入库 chunks 增长、`/api/status` 出现 `xiaomi-ocr-0` 能力、清除配置回落。真实模型接入后，请再用一张实际扫描件确认 `image_url` 解析效果。

## 9. 故障排查

| 现象 | 排查 |
| --- | --- |
| 「网络不可达」 | 服务未启动 / 端口不对；`curl http://127.0.0.1:8000/v1/models` 确认 |
| 「端点或模型 ID 不存在」 | `/v1/models` 列出的实际模型名与表单不一致；vLLM 用完整权重路径，Ollama 用 tag |
| 「请求被拒绝 400」 | 端点不支持 OpenAI 兼容 `image_url`，或 `max-model-len` 小于 16384 |
| 「推理超时」 | 权重首次加载较慢；等日志出现 ready，或换更清晰的图片、提高 `timeoutMs` |
| 结果含 `<fcel>` / `<nl>` | 官方 OTSL 表格标记，轻量通道不做 HTML 后处理（见第 7 节） |
| 「输出被截断」 | `max_tokens=4096` 用尽；把文档分页截图后逐页解析 |
| 创空间连不上本地模型 | 容器内 loopback 不是宿主机，见第 7 节 |
