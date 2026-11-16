'use client';

import { useEffect, useRef } from 'react';

/**
 * 轻量 Canvas 神经网络背景：
 * - 纯 Canvas 2D，无第三方依赖，不进入服务端渲染
 * - 节点数随视口自适应，DPR 上限 2，页面不可见时自动暂停（性能优化）
 * - prefers-reduced-motion 时退化为静态一帧
 * 视觉语义：双侧知识图谱的「节点—关系」在后台持续演化。
 */
interface Particle { x: number; y: number; vx: number; vy: number; r: number; depth: number; hue: number }

export default function TechBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0, height = 0, dpr = 1;
    let particles: Particle[] = [];
    let raf = 0;
    let visible = !document.hidden;
    const mouse = { x: 0, y: 0 };

    // 确定性伪随机，保证每次挂载得到一致的初始构图
    let seed = 20261104;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(28, Math.min(72, Math.round((width * height) / 26000)));
      particles = Array.from({ length: count }, () => ({
        x: rand() * width, y: rand() * height,
        vx: (rand() - .5) * .16, vy: (rand() - .5) * .16,
        r: .9 + rand() * 1.7, depth: .3 + rand() * .9,
        hue: rand() > .78 ? 188 : 222,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 19000) continue;
          const alpha = (1 - Math.sqrt(d2) / 138) * .16;
          ctx.strokeStyle = `hsla(${p.hue}, 90%, 66%, ${Math.max(0, alpha).toFixed(3)})`;
          ctx.lineWidth = .6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
      for (const p of particles) {
        ctx.fillStyle = `hsla(${p.hue}, 95%, 70%, ${(.28 + p.depth * .35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    };

    const tick = () => {
      if (!visible) return;
      const mx = (mouse.x - width / 2) * .012;
      const my = (mouse.y - height / 2) * .012;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
        // 视差位移只作用于绘制位置，不累积到物理坐标
        p.x += mx * p.depth * .02;
        p.y += my * p.depth * .02;
      }
      draw();
      raf = requestAnimationFrame(tick);
    };

    const onMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
      else cancelAnimationFrame(raf);
    };

    resize();
    draw();
    if (!reduced) raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouse, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 grid-fade opacity-90" />
      <div className="hero-glow absolute inset-0" />
      <div className="absolute -left-40 top-[18%] h-[420px] w-[420px] rounded-full blur-2xl animate-drift"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(67,108,246,.13), transparent 68%)' }} />
      <div className="absolute -right-32 top-[52%] h-[380px] w-[380px] rounded-full blur-2xl animate-drift"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(34,211,238,.10), transparent 68%)' }} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-70" />
      <div className="scanline absolute inset-0 opacity-60" />
    </div>
  );
}
