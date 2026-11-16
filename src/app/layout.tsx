import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: '谱合产教 · AI Native 产教融合智能诊断平台',
  description: '基于双侧三层知识图谱 + 多 Agent + RAG + What-if 模拟的高校人才培养与产业需求精准分析平台（第九届传智杯 AI WEB 挑战赛作品）',
  keywords: ['AI Web', '知识图谱', '产教融合', 'RAG', 'AI Agent', 'Deep Research', '传智杯'],
};

export const viewport: Viewport = { themeColor: '#050a14', width: 'device-width', initialScale: 1 };

/** 在首帧前同步用户主题偏好，避免深色/浅色切换时的白屏闪烁 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('puhe-theme');if(t==='light')document.documentElement.dataset.theme='light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
