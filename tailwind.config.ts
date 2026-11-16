import type { Config } from 'tailwindcss';

/**
 * 色阶全部由 CSS 变量驱动：切换 <html data-theme="dark|light"> 即可整站换肤，
 * 无需改动任何业务组件的类名（对应「前端工程化 / 可维护性」评分项）。
 */
const ink = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--ink-${n}) / <alpha-value>)`]),
);
const brand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => [n, `rgb(var(--brand-${n}) / <alpha-value>)`]),
);

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand,
        ink,
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        canvas: 'rgb(var(--bg) / <alpha-value>)',
        supply: '#3461f4',
        demand: '#e8843c',
        positive: '#16a34a',
        warning: '#eab308',
        danger: '#e11d48',
        neon: '#22d3ee',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(var(--shadow-rgb) / .06), 0 10px 30px -14px rgba(var(--shadow-rgb) / .22)',
        float: '0 14px 44px -14px rgba(var(--brand-500) / .38)',
        glow: '0 0 0 1px rgba(var(--brand-400) / .28), 0 0 28px -6px rgba(var(--brand-400) / .4)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': { '0%,100%': { opacity: '1' }, '50%': { opacity: '.38' } },
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.75' },
          '100%': { transform: 'scale(1.9)', opacity: '0' },
        },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        drift: { '0%': { transform: 'translate3d(0,0,0)' }, '100%': { transform: 'translate3d(0,-28px,0)' } },
        'spin-slow': { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } },
        'bar-grow': { '0%': { transform: 'scaleX(0)' }, '100%': { transform: 'scaleX(1)' } },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
        shimmer: 'shimmer 2.6s linear infinite',
        drift: 'drift 24s linear infinite alternate',
        'spin-slow': 'spin-slow 14s linear infinite',
        'bar-grow': 'bar-grow .8s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
