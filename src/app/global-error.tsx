'use client';

/** 根布局级兜底：连 AppShell 都渲染失败时仍能给出可操作提示 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN" data-theme="dark">
      <body style={{ margin: 0, background: '#050a14', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, padding: 28, border: '1px solid #21304a', borderRadius: 16, background: '#0c1424', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>应用暂时无法加载</div>
            <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7, color: '#94a3b8' }}>
              根布局初始化失败。请刷新页面重试；如果仍无法恢复，检查控制台错误与依赖完整性。
            </p>
            <button onClick={reset} style={{ marginTop: 20, padding: '9px 18px', borderRadius: 10, border: 0, background: '#436cf6', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              重新加载
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
