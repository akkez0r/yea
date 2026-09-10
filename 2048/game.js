/* ==========================================================
   2048 — slide-and-merge puzzle
   ========================================================== */
(() => {
  'use strict';

  const SIZE = 4;
  const SAVE_KEY = 'jl_2048_v1';
  const VEC = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  const $ = id => document.getElementById(id);
  const boardEl   = $('board');
  const tileLayer = $('tile-layer');
  const scoreEl   = $('score');
  const bestEl    = $('best');
  const gainEl    = $('gain');
  const overlay   = $('overlay');
  const overTitle = $('over-title');
  const overSub   = $('over-sub');
  const overBtns  = $('over-btns');

  let grid;                 // SIZE x SIZE of tile objects or null
  let tiles;                // Map id -> tile
  let nextId, score, best;
  let busy = false;         // true while a move animates
  let reached2048 = false;
  let keepPlaying = false;
  let over = false;

  best = loadBest();

  // ── Board background cells ────────────────────────────────────────
  (function buildCells() {
    const frag = document.createDocumentFragment();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.setProperty('--r', r);
        cell.style.setProperty('--c', c);
        cell.innerHTML = '<div class="cell-inner"></div>';
        frag.appendChild(cell);
      }
    }
    boardEl.insertBefore(frag, tileLayer);
  })();

  // ── Helpers ───────────────────────────────────────────────────────
  const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  function emptyCells() {
    const out = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (!grid[r][c]) out.push([r, c]);
    return out;
  }

  function addTile(r, c, val) {
    const tile = { id: nextId++, val, r, c, el: null };
    const el = document.createElement('div');
    el.className = 'tile tile-new';
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
    el.innerHTML = '<div class="tile-inner"></div>';
    tile.el = el;
    paint(tile);
    tileLayer.appendChild(el);
    tiles.set(tile.id, tile);
    grid[r][c] = tile;
    return tile;
  }

  function paint(tile) {
    const inner = tile.el.firstChild;
    inner.textContent = tile.val;
    // cap the style bucket at 2048+, and shrink text for long numbers
    const bucket = Math.min(tile.val, 4096);
    tile.el.dataset.val = bucket;
    inner.className = 'tile-inner' +
      (tile.val >= 1024 ? ' t-sm' : tile.val >= 128 ? ' t-md' : '');
  }

  function place(tile) {
    tile.el.style.setProperty('--r', tile.r);
    tile.el.style.setProperty('--c', tile.c);
  }

  function spawnRandom() {
    const free = emptyCells();
    if (!free.length) return null;
    const [r, c] = free[(Math.random() * free.length) | 0];
    return addTile(r, c, Math.random() < 0.9 ? 2 : 4);
  }

  // ── Core move ─────────────────────────────────────────────────────
  function traversal(dr, dc) {
    const rs = [0, 1, 2, 3], cs = [0, 1, 2, 3];
    if (dr > 0) rs.reverse();
    if (dc > 0) cs.reverse();
    const out = [];
    for (const r of rs) for (const c of cs) out.push([r, c]);
    return out;
  }

  function findFarthest(r, c, dr, dc) {
    let pr = r, pc = c;
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc) && !grid[nr][nc]) {
      pr = nr; pc = nc;
      nr += dr; nc += dc;
    }
    return { far: [pr, pc], next: inBounds(nr, nc) ? [nr, nc] : null };
  }

  // Returns { moved, gained, absorbed[], survivors[] }
  function computeMove(dir) {
    const [dr, dc] = VEC[dir];
    let moved = false, gained = 0;
    const absorbed = [], survivors = [];

    for (const t of tiles.values()) t.mergedThisMove = false;

    for (const [r, c] of traversal(dr, dc)) {
      const tile = grid[r][c];
      if (!tile) continue;

      const { far, next } = findFarthest(r, c, dr, dc);

      if (next) {
        const other = grid[next[0]][next[1]];
        if (other.val === tile.val && !other.mergedThisMove) {
          // tile slides onto `other` and is absorbed
          grid[r][c] = null;
          other.val *= 2;
          other.mergedThisMove = true;
          gained += other.val;
          tile.r = next[0]; tile.c = next[1];
          absorbed.push(tile);
          survivors.push(other);
          moved = true;
          continue;
        }
      }

      const [fr, fc] = far;
      if (fr !== r || fc !== c) {
        grid[r][c] = null;
        grid[fr][fc] = tile;
        tile.r = fr; tile.c = fc;
        moved = true;
      }
    }
    return { moved, gained, absorbed, survivors };
  }

  function movesAvailable() {
    if (emptyCells().length) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = grid[r][c].val;
        if (c + 1 < SIZE && grid[r][c + 1].val === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c].val === v) return true;
      }
    }
    return false;
  }

  // ── Input → move ──────────────────────────────────────────────────
  function doMove(dir) {
    if (busy || over) return;
    if (reached2048 && !keepPlaying) return;

    const { moved, gained, absorbed, survivors } = computeMove(dir);
    if (!moved) return;

    busy = true;

    // animate: everything slides to its new cell
    for (const t of tiles.values()) {
      t.el.classList.remove('tile-new', 'tile-merged');
      place(t);
    }

    if (gained) {
      score += gained;
      showGain(gained);
      if (score > best) { best = score; saveBest(); }
      updateScores();
    }

    setTimeout(() => {
      // remove absorbed tiles, repaint survivors with a pop
      for (const t of absorbed) {
        t.el.remove();
        tiles.delete(t.id);
      }
      for (const s of survivors) {
        paint(s);
        s.el.classList.add('tile-merged');
      }

      spawnRandom();

      if (!reached2048 && [...tiles.values()].some(t => t.val >= 2048)) {
        reached2048 = true;
        showOverlay('win');
      } else if (!movesAvailable()) {
        over = true;
        showOverlay('lose');
      }
      busy = false;
    }, 120);
  }

  // ── Score UI ──────────────────────────────────────────────────────
  function updateScores() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  let gainTimer;
  function showGain(n) {
    gainEl.textContent = '+' + n;
    gainEl.classList.remove('show');
    void gainEl.offsetWidth;
    gainEl.classList.add('show');
    clearTimeout(gainTimer);
    gainTimer = setTimeout(() => gainEl.classList.remove('show'), 700);
  }

  // ── Overlay ───────────────────────────────────────────────────────
  function showOverlay(kind) {
    overlay.className = 'overlay active ' + kind;
    overBtns.innerHTML = '';
    if (kind === 'win') {
      overTitle.textContent = 'You reached 2048!';
      overSub.textContent = 'Score ' + score;
      addBtn('Keep going', () => { keepPlaying = true; hideOverlay(); }, 'primary');
      addBtn('New game', newGame, 'ghost');
    } else {
      overTitle.textContent = 'Game over';
      overSub.textContent = score >= best ? 'New best: ' + score : 'Score ' + score + ' · Best ' + best;
      addBtn('Try again', newGame, 'primary');
    }
  }
  function addBtn(label, fn, kind) {
    const b = document.createElement('button');
    b.className = 'ov-btn ' + kind;
    b.textContent = label;
    b.addEventListener('click', fn);
    overBtns.appendChild(b);
  }
  function hideOverlay() { overlay.className = 'overlay'; }

  // ── New game ──────────────────────────────────────────────────────
  function newGame() {
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    tiles = new Map();
    tileLayer.innerHTML = '';
    nextId = 1;
    score = 0;
    busy = false;
    over = false;
    reached2048 = false;
    keepPlaying = false;
    hideOverlay();
    spawnRandom();
    spawnRandom();
    updateScores();
  }

  // ── Persistence ───────────────────────────────────────────────────
  function loadBest() {
    try { return parseInt(localStorage.getItem(SAVE_KEY), 10) || 0; }
    catch (_) { return 0; }
  }
  function saveBest() {
    try { localStorage.setItem(SAVE_KEY, String(best)); } catch (_) {}
  }

  // ── Controls ──────────────────────────────────────────────────────
  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down',
    A: 'left', D: 'right', W: 'up', S: 'down'
  };

  window.addEventListener('keydown', e => {
    const dir = KEYMAP[e.key];
    if (!dir) return;
    e.preventDefault();
    doMove(dir);
  }, { passive: false });

  $('new-game').addEventListener('click', newGame);

  // touch swipe
  let tsx = 0, tsy = 0, touching = false;
  boardEl.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    tsx = e.touches[0].clientX; tsy = e.touches[0].clientY;
    touching = true;
  }, { passive: true });

  boardEl.addEventListener('touchend', e => {
    if (!touching) return;
    touching = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - tsx, dy = t.clientY - tsy;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < 24) return;   // too small, treat as tap
    doMove(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  // stop the page scrolling while swiping the board
  boardEl.addEventListener('touchmove', e => {
    if (touching) e.preventDefault();
  }, { passive: false });

  newGame();

  // expose a tiny surface for tests
  window.__2048 = {
    move: doMove,
    state: () => grid.map(row => row.map(t => (t ? t.val : 0))),
    setState: rows => {                       // test helper
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      tiles = new Map();
      tileLayer.innerHTML = '';
      nextId = 1;
      busy = false; over = false;
      reached2048 = false; keepPlaying = false;
      hideOverlay();
      rows.forEach((row, r) => row.forEach((v, c) => { if (v) addTile(r, c, v); }));
    },
    settle: () => { busy = false; },           // test helper: skip the anim lock
    score: () => score
  };
})();
