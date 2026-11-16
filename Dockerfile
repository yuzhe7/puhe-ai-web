# 谱合产教 · 魔搭创空间 Docker 部署
# 创空间 Docker 类型硬性要求：服务监听 7860 端口，且前后端合并进同一个容器。
# 本项目是 Next.js App Router 全栈应用（页面 + API Routes），天然满足「单容器」要求。
#
# 本地验证：
#   docker build -t puhe-ai-web .
#   docker run -p 7860:7860 -e MODELSCOPE_SDK_TOKEN=ms-xxx puhe-ai-web

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--require=/app/scripts/no-trace.cjs"
# no-trace.cjs 把 Next.js 构建追踪写入转为内存空流，避免个别平台上
# 多个 build worker 并发追加 .next/trace 造成 EPERM；对产物无任何影响。
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=7860 \
    HOSTNAME=0.0.0.0 \
    AI_PROVIDER=modelscope

# 以官方镜像内置的 node 用户（uid 1000）非 root 运行，降低容器逃逸风险。
RUN chown -R node:node /app

# standalone 已自带精简 node_modules；额外整包复制是为了保证
# unpdf / mammoth 等仅在 API Route 动态 import 的文档解析依赖在运行时一定可解析。
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/scripts ./scripts

USER node
EXPOSE 7860
# 探活走 /api/status，能同时验证页面服务与数据完整性自检；用 Node 内置 fetch，不额外装 curl/wget。
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7860/api/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
