/**
 * 受限构建环境专用预加载脚本（仅本地/CI 使用，不进入生产运行时）
 * --------------------------------------------------------------------------
 * Next.js 14 的 build worker 会用 `fs.createWriteStream(file, { flags: 'a' })`
 * 并发追加同一个 `<distDir>/trace` 文件。在部分 Windows 沙箱 / 杀软环境下，
 * 多个进程同时以追加方式打开该文件会触发 EPERM，导致构建在编译前就崩溃。
 *
 * 追踪数据只用于 Next.js 内部性能分析，对产物没有任何影响；这里把它改成
 * 内存中的空 Writable，等价于关闭构建追踪。
 *
 * 用法（仅在遇到 EPERM 时）：
 *   NODE_OPTIONS="--require=./scripts/no-trace.cjs" npm run build
 * 正常环境直接 `npm run build` 即可，Docker 构建也不需要此脚本。
 */
const fs = require('node:fs');
const { Writable } = require('node:stream');

const original = fs.createWriteStream;
const isTraceFile = (p) => typeof p === 'string' && /(?:^|[\\/])trace$/.test(p);

fs.createWriteStream = function patchedCreateWriteStream(path, options) {
  const flags = options && typeof options === 'object' ? options.flags : undefined;
  if (isTraceFile(path) && (!flags || flags === 'a')) {
    return new Writable({ write(_chunk, _enc, cb) { cb(); } });
  }
  return original.apply(this, arguments);
};
