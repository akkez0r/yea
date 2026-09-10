/* ==========================================================
   Jesper.live — animated particle constellation background
   Injects the background layers and renders drifting particles
   that link into a constellation and react to the cursor.
   ========================================================== */
(() => {
  'use strict';

  // ── Inject background layers so every page just needs <script src="bg.js"> ──
  if (!document.querySelector('.bg-layers')) {
    const layers = document.createElement('div');
    layers.className = 'bg-layers';
    layers.setAttribute('aria-hidden', 'true');
    layers.innerHTML =
      '<div class="aurora a1"></div>' +
      '<div class="aurora a2"></div>' +
      '<div class="aurora a3"></div>' +
      '<canvas id="bg-canvas"></canvas>' +
      '<div class="bg-grid"></div>' +
      '<div class="bg-vignette"></div>';
    document.body.insertBefore(layers, document.body.firstChild);
  }

  const canvas = document.getElementById('bg-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return;
  // getContext can return null (no 2d support, too many live contexts).
  // The aurora/grid/vignette layers are already in the DOM, so the
  // background still looks right — we just skip the particle field.
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LINK_DIST = 132;     // px within which particles connect
  const MOUSE_DIST = 170;    // cursor influence radius
  const COLORS = ['0,245,180', '160,107,255', '255,95,168'];

  let w = 0, h = 0, dpr = 1;
  let particles = [];
  let raf = null;
  const mouse = { x: -9999, y: -9999, active: false };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    // scale count with viewport area, but keep it cheap on phones
    const count = Math.max(24, Math.min(96, Math.round((w * h) / 16000)));
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.7 + 0.7,
        c: COLORS[Math.random() < 0.72 ? 0 : (Math.random() < 0.6 ? 1 : 2)],
        tw: Math.random() * Math.PI * 2   // twinkle phase
      });
    }
  }

  function step(t) {
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      // wrap around edges
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;

      // gentle push away from cursor
      if (mouse.active) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_DIST * MOUSE_DIST && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (1 - d / MOUSE_DIST) * 0.55;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        }
      }

      const twinkle = 0.55 + Math.sin(t * 0.0014 + p.tw) * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + p.c + ',' + twinkle.toFixed(3) + ')';
      ctx.fill();
    }

    // constellation links
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST * LINK_DIST) continue;
        const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(' + a.c + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // link to cursor for an interactive feel
      if (mouse.active) {
        const dx = a.x - mouse.x, dy = a.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MOUSE_DIST * MOUSE_DIST) {
          const alpha = (1 - Math.sqrt(d2) / MOUSE_DIST) * 0.32;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = 'rgba(0,245,180,' + alpha.toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(step);
  }

  function start() { if (raf === null && !reduced) raf = requestAnimationFrame(step); }
  function stop()  { if (raf !== null) { cancelAnimationFrame(raf); raf = null; } }

  // ── Events ──
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  window.addEventListener('pointermove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }, { passive: true });

  window.addEventListener('pointerleave', () => { mouse.active = false; });

  // don't burn battery in a hidden tab
  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });

  resize();
  if (reduced) {
    // draw a single static frame instead of animating
    step(0);
    stop();
  } else {
    start();
  }
})();
