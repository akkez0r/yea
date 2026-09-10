/* ==========================================================
   Snake — neon arcade snake on canvas
   ========================================================== */
(() => {
  'use strict';

  const COLS = 22, ROWS = 22;
  const SAVE_KEY = 'jl_snake_v1';
  const BASE_MS = 140;      // ms per step at the start
  const MIN_MS  = 60;       // fastest it ever gets
  const RAMP    = 2.6;      // ms shaved off per food eaten

  const $ = id => document.getElementById(id);
  const canvas    = $('board');
  const ctx       = canvas.getContext('2d');
  const scoreEl   = $('score');
  const bestEl    = $('best');
  const lenEl     = $('len');
  const overlay   = $('overlay');
  const overTitle = $('over-title');
  const overSub   = $('over-sub');
  const overHint  = $('over-hint');

  let snake, dir, queued, food, score, best, alive, started, paused;
  let stepMs, acc, last, raf = null;
  let cell = 20;            // px per cell, recomputed on resize

  best = loadBest();

  // ── Sizing (device-pixel-ratio aware) ─────────────────────────────
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth;         // square via CSS aspect-ratio
    if (!size) return;
    cell = size / COLS;
    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  // ── Game setup ────────────────────────────────────────────────────
  function reset() {
    const mid = Math.floor(ROWS / 2);
    snake  = [{ x: 5, y: mid }, { x: 4, y: mid }, { x: 3, y: mid }];
    dir    = { x: 1, y: 0 };
    queued = [];
    score  = 0;
    stepMs = BASE_MS;
    alive  = true;
    started = false;
    paused = false;
    placeFood();
    updateHud();
    showOverlay('start');
    draw();
  }

  function placeFood() {
    const free = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    food = free.length ? free[(Math.random() * free.length) | 0] : null;
  }

  // ── Step ──────────────────────────────────────────────────────────
  function step() {
    // apply the next queued turn (queue prevents a fast double-tap
    // from reversing the snake into itself within one tick)
    if (queued.length) {
      const d = queued.shift();
      if (d.x !== -dir.x || d.y !== -dir.y) dir = d;
    }

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // walls
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return die();
    // self (tail tip is about to move away, so it is not a collision
    // unless we're about to grow this tick)
    const willGrow = food && head.x === food.x && head.y === food.y;
    const body = willGrow ? snake : snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) return die();

    snake.unshift(head);
    if (willGrow) {
      score += 10;
      stepMs = Math.max(MIN_MS, stepMs - RAMP);
      placeFood();
      if (!food) return win();
    } else {
      snake.pop();
    }
    updateHud();
  }

  function die() {
    alive = false;
    if (score > best) { best = score; saveBest(); }
    updateHud();
    showOverlay('dead');
  }

  function win() {
    alive = false;
    if (score > best) { best = score; saveBest(); }
    updateHud();
    showOverlay('win');
  }

  // ── Loop ──────────────────────────────────────────────────────────
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (!started || paused || !alive) { last = t; return; }
    if (last === undefined) last = t;
    acc += t - last;
    last = t;
    // guard against huge catch-up after a background tab
    if (acc > 500) acc = stepMs;
    while (acc >= stepMs && alive) {
      acc -= stepMs;
      step();
    }
    draw();
  }

  // ── Draw ──────────────────────────────────────────────────────────
  function draw() {
    const w = COLS * cell, h = ROWS * cell;
    ctx.clearRect(0, 0, w, h);

    // subtle grid
    ctx.strokeStyle = 'rgba(150,170,220,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) {
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, h);
      ctx.moveTo(0, i * cell); ctx.lineTo(w, i * cell);
    }
    ctx.stroke();

    // food (pulsing)
    if (food) {
      const pulse = 0.72 + Math.sin(performance.now() / 260) * 0.16;
      const cx = food.x * cell + cell / 2;
      const cy = food.y * cell + cell / 2;
      ctx.save();
      ctx.shadowColor = 'rgba(255,95,168,0.95)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ff5fa8';
      ctx.beginPath();
      ctx.arc(cx, cy, (cell * 0.32) * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // snake — brightest at the head, fading toward the tail
    const pad = Math.max(1, cell * 0.11);
    const r   = Math.max(2, cell * 0.26);
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const f = 1 - (i / Math.max(snake.length, 1)) * 0.62;   // 1 → 0.38
      ctx.save();
      if (i === 0) {
        ctx.shadowColor = 'rgba(0,245,180,0.9)';
        ctx.shadowBlur = 18;
      }
      ctx.fillStyle = alive
        ? `rgba(0,245,180,${f.toFixed(3)})`
        : `rgba(255,77,106,${f.toFixed(3)})`;
      roundRect(s.x * cell + pad, s.y * cell + pad, cell - pad * 2, cell - pad * 2, r);
      ctx.fill();
      ctx.restore();
    }

    // eyes on the head
    if (snake.length) {
      const hd = snake[0];
      const cx = hd.x * cell + cell / 2, cy = hd.y * cell + cell / 2;
      const off = cell * 0.16;
      // perpendicular offset so eyes sit either side of travel direction
      const px = -dir.y, py = dir.x;
      ctx.fillStyle = '#04120c';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + dir.x * off + px * off * s, cy + dir.y * off + py * off * s,
                Math.max(1, cell * 0.075), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // ── HUD / overlay ─────────────────────────────────────────────────
  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    lenEl.textContent = snake.length;
  }

  function showOverlay(kind) {
    overlay.className = 'overlay active ' + kind;
    if (kind === 'start') {
      overTitle.textContent = 'Snake';
      overSub.textContent = 'Eat the pink dots. Don’t hit the walls or yourself.';
      overHint.textContent = 'Press any arrow key, or tap to start';
    } else if (kind === 'dead') {
      overTitle.textContent = 'Game over';
      overSub.textContent = score >= best && score > 0
        ? 'New best: ' + score
        : 'Score ' + score + ' · Best ' + best;
      overHint.textContent = 'Press Space or tap to play again';
    } else if (kind === 'win') {
      overTitle.textContent = 'Perfect game!';
      overSub.textContent = 'You filled the whole board — score ' + score;
      overHint.textContent = 'Press Space or tap to play again';
    } else if (kind === 'paused') {
      overTitle.textContent = 'Paused';
      overSub.textContent = 'Score ' + score;
      overHint.textContent = 'Press Space or tap to resume';
    }
  }
  function hideOverlay() { overlay.className = 'overlay'; }

  // ── Controls ──────────────────────────────────────────────────────
  const DIRS = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp:   { x: 0, y: -1 }, ArrowDown:  { x: 0, y: 1 },
    a: { x: -1, y: 0 }, d: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
    A: { x: -1, y: 0 }, D: { x: 1, y: 0 }, W: { x: 0, y: -1 }, S: { x: 0, y: 1 }
  };

  function turn(d) {
    if (!alive) return;
    if (!started) { started = true; hideOverlay(); acc = 0; last = undefined; }
    if (paused) return;
    // compare against the last queued direction so rapid input still works
    const ref = queued.length ? queued[queued.length - 1] : dir;
    if (d.x === -ref.x && d.y === -ref.y) return;   // no 180° reversal
    if (d.x === ref.x && d.y === ref.y) return;     // no duplicate
    if (queued.length < 2) queued.push(d);
  }

  function togglePause() {
    if (!started || !alive) return;
    paused = !paused;
    if (paused) showOverlay('paused');
    else { hideOverlay(); last = undefined; acc = 0; }
  }

  function primary() {           // space / tap
    if (!alive) { reset(); started = true; hideOverlay(); acc = 0; last = undefined; return; }
    if (!started) { started = true; hideOverlay(); acc = 0; last = undefined; return; }
    togglePause();
  }

  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); primary(); return; }
    if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
    const d = DIRS[e.key];
    if (!d) return;
    e.preventDefault();
    turn(d);
  }, { passive: false });

  $('new-game').addEventListener('click', () => {
    reset();
    started = true;
    hideOverlay();
    acc = 0; last = undefined;
  });

  $('pause').addEventListener('click', togglePause);

  // touch: tap to start/pause, swipe to steer
  let tsx = 0, tsy = 0, moved = false;
  const stage = $('stage');
  stage.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    tsx = e.touches[0].clientX; tsy = e.touches[0].clientY; moved = false;
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - tsx, dy = e.touches[0].clientY - tsy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 22) return;
    turn(ax > ay ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
    tsx = e.touches[0].clientX; tsy = e.touches[0].clientY;
    moved = true;
  }, { passive: false });

  stage.addEventListener('touchend', () => { if (!moved) primary(); }, { passive: true });

  overlay.addEventListener('click', primary);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && alive && !paused) togglePause();
  });

  // ── Persistence ───────────────────────────────────────────────────
  function loadBest() {
    try { return parseInt(localStorage.getItem(SAVE_KEY), 10) || 0; }
    catch (_) { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem(SAVE_KEY, String(best)); } catch (_) {}
  }

  // ── Go ────────────────────────────────────────────────────────────
  acc = 0;
  reset();
  resize();
  raf = requestAnimationFrame(loop);

  // small surface for tests
  window.__snake = {
    step, turn,
    state: () => ({ snake: snake.map(s => ({ ...s })), food: { ...food }, score, alive }),
    setState: s => { snake = s.snake; food = s.food; dir = s.dir || dir; alive = true; queued = []; }
  };
})();
