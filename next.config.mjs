/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 可指定独立构建目录，便于 CI/受限沙箱在不清理既有 .next 的情况下完成构建
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // standalone 产物用于魔搭创空间 Docker 部署（本地 next start 不受影响）
  output: 'standalone',
  // 图标按需引入，压缩首屏 JS 体积
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // 文档解析库只在服务端 API Route 使用，标记为外部包，避免进入浏览器 bundle
    serverComponentsExternalPackages: ['unpdf', 'mammoth'],
  },
  /**
   * 安全响应头（v3 审计修复）
   * - 不启用过严 CSP：Next.js 首帧内联脚本与 ECharts canvas 需要 inline/unsafe-inline，
   *   贸然加严格策略会破坏页面；生产部署前应在 CDN/WAF 层配合 nonce 方案完善 CSP。
   * - microphone=(self) 保留 Web Speech 语音提问能力，其余敏感权限一律关闭。
   */
  async headers() {
    const base = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
    ];
    return [
      // 更具体的路由必须排在前面，Next.js 按顺序取第一个匹配项
      { source: '/api/:path*', headers: [...base, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/:path*', headers: base },
    ];
  },
};

export default nextConfig;
