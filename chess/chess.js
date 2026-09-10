(() => {
    'use strict';

    // ── Constants ────────────────────────────────────────────
    const GLYPH = {
      w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
      b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
    };
    const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    // simple piece-square bonus: prefer central squares
    const CENTER = [
      0,1,2,3,3,2,1,0,
      1,2,3,4,4,3,2,1,
      2,3,4,5,5,4,3,2,
      3,4,5,6,6,5,4,3,
      3,4,5,6,6,5,4,3,
      2,3,4,5,5,4,3,2,
      1,2,3,4,4,3,2,1,
      0,1,2,3,3,2,1,0
    ];

    // ── Game state ──────────────────────────────────────────
    let S;                 // current state
    let undoStack = [];    // snapshots for undo
    let selected = null;   // selected square index
    let legalForSelected = [];
    let vsAI = false;
    let aiThinking = false;
    let pendingPromo = null; // {move} awaiting user choice

    function initialState() {
      const board = new Array(64).fill(null);
      const back = ['r','n','b','q','k','b','n','r'];
      for (let c = 0; c < 8; c++) {
        board[c]      = { t: back[c], c: 'b' };
        board[8 + c]  = { t: 'p', c: 'b' };
        board[48 + c] = { t: 'p', c: 'w' };
        board[56 + c] = { t: back[c], c: 'w' };
      }
      return {
        board,
        turn: 'w',
        castling: { wK: true, wQ: true, bK: true, bQ: true },
        ep: -1,                 // en-passant target square index, or -1
        lastMove: null,         // {from,to}
        capturedByW: [],
        capturedByB: [],
        moveLog: [],            // SAN strings
        over: null              // null | {result, reason}
      };
    }

    const idx = (r, c) => r * 8 + c;
    const rowOf = i => i >> 3;
    const colOf = i => i & 7;
    const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const sqName = i => 'abcdefgh'[colOf(i)] + (8 - rowOf(i));

    // ── Move generation ──────────────────────────────────────
    // Returns pseudo-legal moves: {from, to, piece, capture, promo, castle, ep}
    function pseudoMoves(st, color) {
      const moves = [];
      const B = st.board;
      for (let i = 0; i < 64; i++) {
        const p = B[i];
        if (!p || p.c !== color) continue;
        const r = rowOf(i), c = colOf(i);

        if (p.t === 'p') {
          const dir = color === 'w' ? -1 : 1;
          const startRow = color === 'w' ? 6 : 1;
          const promoRow = color === 'w' ? 0 : 7;
          // forward
          if (onBoard(r + dir, c) && !B[idx(r + dir, c)]) {
            addPawn(moves, i, idx(r + dir, c), false, promoRow);
            if (r === startRow && !B[idx(r + 2 * dir, c)]) {
              moves.push({ from: i, to: idx(r + 2 * dir, c), dbl: true });
            }
          }
          // captures
          for (const dc of [-1, 1]) {
            if (!onBoard(r + dir, c + dc)) continue;
            const t = idx(r + dir, c + dc);
            if (B[t] && B[t].c !== color) addPawn(moves, i, t, true, promoRow);
            else if (t === st.ep) moves.push({ from: i, to: t, ep: true, capture: true });
          }
        } else if (p.t === 'n') {
          for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
            if (!onBoard(r + dr, c + dc)) continue;
            const t = idx(r + dr, c + dc);
            if (!B[t] || B[t].c !== color) moves.push({ from: i, to: t, capture: !!B[t] });
          }
        } else if (p.t === 'k') {
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            if (!onBoard(r + dr, c + dc)) continue;
            const t = idx(r + dr, c + dc);
            if (!B[t] || B[t].c !== color) moves.push({ from: i, to: t, capture: !!B[t] });
          }
          // castling
          const home = color === 'w' ? 56 : 0;
          if (i === home + 4 && !inCheck(st, color)) {
            const rights = st.castling;
            const K = color === 'w' ? rights.wK : rights.bK;
            const Q = color === 'w' ? rights.wQ : rights.bQ;
            if (K && !B[home + 5] && !B[home + 6] &&
                B[home + 7] && B[home + 7].t === 'r' && B[home + 7].c === color &&
                !attacked(st, home + 5, color) && !attacked(st, home + 6, color)) {
              moves.push({ from: i, to: home + 6, castle: 'K' });
            }
            if (Q && !B[home + 3] && !B[home + 2] && !B[home + 1] &&
                B[home] && B[home].t === 'r' && B[home].c === color &&
                !attacked(st, home + 3, color) && !attacked(st, home + 2, color)) {
              moves.push({ from: i, to: home + 2, castle: 'Q' });
            }
          }
        } else {
          // sliding pieces
          const rays = p.t === 'r' ? [[-1,0],[1,0],[0,-1],[0,1]]
                     : p.t === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
                     : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
          for (const [dr, dc] of rays) {
            let nr = r + dr, nc = c + dc;
            while (onBoard(nr, nc)) {
              const t = idx(nr, nc);
              if (!B[t]) moves.push({ from: i, to: t });
              else {
                if (B[t].c !== color) moves.push({ from: i, to: t, capture: true });
                break;
              }
              nr += dr; nc += dc;
            }
          }
        }
      }
      return moves;
    }

    function addPawn(moves, from, to, capture, promoRow) {
      if (rowOf(to) === promoRow) {
        for (const promo of ['q', 'r', 'b', 'n']) moves.push({ from, to, capture, promo });
      } else {
        moves.push({ from, to, capture });
      }
    }

    // Is `square` attacked by the opponent of `color`?
    function attacked(st, square, color) {
      const B = st.board;
      const enemy = color === 'w' ? 'b' : 'w';
      const r = rowOf(square), c = colOf(square);

      // pawns
      const dir = enemy === 'w' ? 1 : -1; // enemy pawn attacks from this row offset
      for (const dc of [-1, 1]) {
        if (onBoard(r + dir, c + dc)) {
          const p = B[idx(r + dir, c + dc)];
          if (p && p.c === enemy && p.t === 'p') return true;
        }
      }
      // knights
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        if (!onBoard(r + dr, c + dc)) continue;
        const p = B[idx(r + dr, c + dc)];
        if (p && p.c === enemy && p.t === 'n') return true;
      }
      // king
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        if (!onBoard(r + dr, c + dc)) continue;
        const p = B[idx(r + dr, c + dc)];
        if (p && p.c === enemy && p.t === 'k') return true;
      }
      // sliders
      const lines = [
        { dirs: [[-1,0],[1,0],[0,-1],[0,1]], types: ['r', 'q'] },
        { dirs: [[-1,-1],[-1,1],[1,-1],[1,1]], types: ['b', 'q'] }
      ];
      for (const { dirs, types } of lines) {
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (onBoard(nr, nc)) {
            const p = B[idx(nr, nc)];
            if (p) {
              if (p.c === enemy && types.includes(p.t)) return true;
              break;
            }
            nr += dr; nc += dc;
          }
        }
      }
      return false;
    }

    function kingSquare(st, color) {
      return st.board.findIndex(p => p && p.t === 'k' && p.c === color);
    }
    function inCheck(st, color) {
      return attacked(st, kingSquare(st, color), color);
    }

    function legalMoves(st, color) {
      return pseudoMoves(st, color).filter(m => {
        const next = applyMove(st, m, true);
        return !inCheck(next, color);
      });
    }

    // Apply move; if `sim` is true skip log/captured bookkeeping for speed
    function applyMove(st, m, sim) {
      const B = st.board.slice();
      const piece = B[m.from];
      const color = piece.c;
      let capturedPiece = B[m.to];

      B[m.to] = m.promo ? { t: m.promo, c: color } : piece;
      B[m.from] = null;

      if (m.ep) {
        const capSq = m.to + (color === 'w' ? 8 : -8);
        capturedPiece = B[capSq];
        B[capSq] = null;
      }
      if (m.castle) {
        const home = color === 'w' ? 56 : 0;
        if (m.castle === 'K') { B[home + 5] = B[home + 7]; B[home + 7] = null; }
        else { B[home + 3] = B[home]; B[home] = null; }
      }

      const castling = { ...st.castling };
      if (piece.t === 'k') {
        if (color === 'w') { castling.wK = castling.wQ = false; }
        else { castling.bK = castling.bQ = false; }
      }
      for (const sq of [m.from, m.to]) {
        if (sq === 56) castling.wQ = false;
        if (sq === 63) castling.wK = false;
        if (sq === 0)  castling.bQ = false;
        if (sq === 7)  castling.bK = false;
      }

      const next = {
        board: B,
        turn: color === 'w' ? 'b' : 'w',
        castling,
        ep: m.dbl ? (m.from + m.to) / 2 : -1,
        lastMove: { from: m.from, to: m.to },
        capturedByW: st.capturedByW,
        capturedByB: st.capturedByB,
        moveLog: st.moveLog,
        over: null
      };

      if (!sim) {
        next.capturedByW = st.capturedByW.slice();
        next.capturedByB = st.capturedByB.slice();
        if (capturedPiece) {
          (color === 'w' ? next.capturedByW : next.capturedByB).push(capturedPiece);
        }
        next.moveLog = st.moveLog.concat(san(st, m, next));
        // game end detection
        const opp = next.turn;
        const oppMoves = legalMoves(next, opp);
        if (oppMoves.length === 0) {
          if (inCheck(next, opp)) {
            next.over = { result: color === 'w' ? '1-0' : '0-1', reason: 'checkmate' };
            next.moveLog[next.moveLog.length - 1] += '#';
          } else {
            next.over = { result: '½-½', reason: 'stalemate' };
          }
        } else if (inCheck(next, opp)) {
          next.moveLog[next.moveLog.length - 1] += '+';
        }
        // insufficient material (kings only)
        const pieces = B.filter(Boolean);
        if (pieces.length === 2) next.over = { result: '½-½', reason: 'insufficient material' };
      }
      return next;
    }

    // Simplified SAN
    function san(st, m, next) {
      if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
      const piece = st.board[m.from];
      let s = '';
      if (piece.t !== 'p') {
        s += piece.t.toUpperCase();
        // disambiguation: other same-type pieces that can also reach m.to
        const others = legalMoves(st, piece.c).filter(x =>
          x.to === m.to && x.from !== m.from && st.board[x.from] && st.board[x.from].t === piece.t);
        if (others.length) {
          const sameFile = others.some(x => colOf(x.from) === colOf(m.from));
          const sameRank = others.some(x => rowOf(x.from) === rowOf(m.from));
          if (!sameFile) s += sqName(m.from)[0];
          else if (!sameRank) s += sqName(m.from)[1];
          else s += sqName(m.from);
        }
      }
      if (m.capture || m.ep) {
        if (piece.t === 'p') s += sqName(m.from)[0];
        s += 'x';
      }
      s += sqName(m.to);
      if (m.promo) s += '=' + m.promo.toUpperCase();
      return s;
    }

    // ── AI (depth-2 minimax + alpha-beta) ────────────────────────────
    function evaluate(st) {
      // positive = good for white
      let score = 0;
      for (let i = 0; i < 64; i++) {
        const p = st.board[i];
        if (!p) continue;
        const v = VAL[p.t] + CENTER[i] * (p.t === 'p' || p.t === 'n' ? 4 : 2);
        score += p.c === 'w' ? v : -v;
      }
      return score;
    }

    function aiBestMove(st) {
      const color = st.turn; // AI plays this color (black)
      const moves = legalMoves(st, color);
      if (!moves.length) return null;
      let best = [], bestScore = -Infinity;
      for (const m of moves) {
        const n1 = applyMove(st, m, true);
        // opponent replies (minimize for AI)
        const score = -searchMax(n1, 1, -Infinity, Infinity, color === 'w' ? 'b' : 'w', color);
        const jitter = Math.random() * 6; // small randomness so games vary
        if (score + jitter > bestScore) { bestScore = score + jitter; best = [m]; }
      }
      return best[0];
    }

    // returns best score from `mover`'s perspective relative to aiColor sign handling
    function searchMax(st, depth, alpha, beta, mover, aiColor) {
      const moves = legalMoves(st, mover);
      if (!moves.length) {
        if (inCheck(st, mover)) return -100000 + depth; // mover is mated: bad for mover
        return 0; // stalemate
      }
      if (depth === 0) {
        const e = evaluate(st);
        return mover === 'w' ? e : -e;
      }
      let best = -Infinity;
      for (const m of moves) {
        const n = applyMove(st, m, true);
        const score = -searchMax(n, depth - 1, -beta, -alpha, mover === 'w' ? 'b' : 'w', aiColor);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }

    // ── UI ────────────────────────────────────────────────
    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const historyEl = document.getElementById('history');
    const gameoverEl = document.getElementById('gameover');
    const promoOverlay = document.getElementById('promo-overlay');
    const promoChoices = document.getElementById('promo-choices');

    // build 64 squares once
    const squares = [];
    for (let i = 0; i < 64; i++) {
      const r = rowOf(i), c = colOf(i);
      const el = document.createElement('div');
      el.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      el.dataset.i = i;
      if (r === 7) {
        const f = document.createElement('span');
        f.className = 'coord file';
        f.textContent = 'abcdefgh'[c];
        el.appendChild(f);
      }
      if (c === 0) {
        const rk = document.createElement('span');
        rk.className = 'coord rank';
        rk.textContent = 8 - r;
        el.appendChild(rk);
      }
      el.addEventListener('click', () => onSquareClick(i));
      boardEl.appendChild(el);
      squares.push(el);
    }

    function draw() {
      const checkSq = inCheck(S, S.turn) ? kingSquare(S, S.turn) : -1;
      for (let i = 0; i < 64; i++) {
        const el = squares[i];
        el.classList.remove('selected', 'move-dot', 'move-capture', 'last-move', 'in-check');
        // piece
        let pieceEl = el.querySelector('.piece');
        const p = S.board[i];
        if (p) {
          if (!pieceEl) {
            pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            el.appendChild(pieceEl);
          }
          pieceEl.textContent = GLYPH[p.c][p.t];
          pieceEl.className = 'piece ' + p.c;
        } else if (pieceEl) pieceEl.remove();

        if (S.lastMove && (i === S.lastMove.from || i === S.lastMove.to)) el.classList.add('last-move');
        if (i === checkSq) el.classList.add('in-check');
      }
      if (selected !== null) {
        squares[selected].classList.add('selected');
        for (const m of legalForSelected) {
          squares[m.to].classList.add(S.board[m.to] || m.ep ? 'move-capture' : 'move-dot');
        }
      }

      // status + turn
      document.getElementById('turn-dot').className = 'turn-dot ' + S.turn;
      document.getElementById('turn-label').textContent = S.turn === 'w' ? 'White' : 'Black';
      statusEl.classList.remove('check', 'mate');
      if (S.over) {
        statusEl.classList.add('mate');
        statusEl.textContent = S.over.reason === 'checkmate'
          ? (S.over.result === '1-0' ? 'CHECKMATE — WHITE WINS' : 'CHECKMATE — BLACK WINS')
          : 'DRAW — ' + S.over.reason.toUpperCase();
        gameoverEl.textContent = statusEl.textContent + '  (' + S.over.result + ')';
        gameoverEl.classList.add('active');
      } else {
        gameoverEl.classList.remove('active');
        if (inCheck(S, S.turn)) {
          statusEl.classList.add('check');
          statusEl.textContent = (S.turn === 'w' ? 'WHITE' : 'BLACK') + ' IN CHECK!';
        } else {
          statusEl.textContent = (S.turn === 'w' ? 'WHITE' : 'BLACK') + ' TO MOVE';
        }
      }

      // captured
      document.getElementById('cap-w').innerHTML =
        S.capturedByW.map(p => `<span class="piece ${p.c}">${GLYPH[p.c][p.t]}</span>`).join('') || '<span class="history-empty">—</span>';
      document.getElementById('cap-b').innerHTML =
        S.capturedByB.map(p => `<span class="piece ${p.c}">${GLYPH[p.c][p.t]}</span>`).join('') || '<span class="history-empty">—</span>';

      // history
      if (!S.moveLog.length) {
        historyEl.innerHTML = '<span class="history-empty">No moves yet.</span>';
      } else {
        let html = '';
        for (let i = 0; i < S.moveLog.length; i += 2) {
          html += `<div class="move-row"><span class="num">${i / 2 + 1}.</span><span class="mv">${S.moveLog[i]}</span><span class="mv">${S.moveLog[i + 1] || ''}</span></div>`;
        }
        historyEl.innerHTML = html;
        historyEl.scrollTop = historyEl.scrollHeight;
      }
    }

    function onSquareClick(i) {
      if (S.over || aiThinking || pendingPromo) return;
      if (vsAI && S.turn === 'b') return; // AI's turn

      const p = S.board[i];

      // try move to clicked square
      if (selected !== null) {
        const candidates = legalForSelected.filter(m => m.to === i);
        if (candidates.length) {
          if (candidates[0].promo) {
            // open promotion picker
            pendingPromo = { candidates };
            openPromo(S.turn);
            return;
          }
          makeMove(candidates[0]);
          return;
        }
      }

      // (re)select own piece
      if (p && p.c === S.turn) {
        selected = i;
        legalForSelected = legalMoves(S, S.turn).filter(m => m.from === i);
      } else {
        selected = null;
        legalForSelected = [];
      }
      draw();
    }

    function openPromo(color) {
      promoChoices.innerHTML = '';
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.textContent = GLYPH[color][t];
        b.addEventListener('click', () => {
          const m = pendingPromo.candidates.find(x => x.promo === t);
          pendingPromo = null;
          promoOverlay.classList.remove('active');
          makeMove(m);
        });
        promoChoices.appendChild(b);
      }
      promoOverlay.classList.add('active');
    }

    function makeMove(m) {
      undoStack.push(S);
      S = applyMove(S, m, false);
      selected = null;
      legalForSelected = [];
      draw();
      if (vsAI && !S.over && S.turn === 'b') scheduleAI();
    }

    function scheduleAI() {
      aiThinking = true;
      statusEl.textContent = 'AI THINKING…';
      setTimeout(() => {
        const m = aiBestMove(S);
        aiThinking = false;
        if (m) {
          undoStack.push(S);
          S = applyMove(S, m, false);
        }
        draw();
      }, 350 + Math.random() * 450);
    }

    // ── Controls ────────────────────────────────────────────
    document.getElementById('new-game').addEventListener('click', reset);
    document.getElementById('undo').addEventListener('click', () => {
      if (aiThinking || !undoStack.length) return;
      // in AI mode, undo both AI's reply and the player's move
      S = undoStack.pop();
      if (vsAI && S.turn === 'b' && undoStack.length) S = undoStack.pop();
      selected = null;
      legalForSelected = [];
      pendingPromo = null;
      promoOverlay.classList.remove('active');
      draw();
    });
    document.getElementById('mode-2p').addEventListener('click', () => setMode(false));
    document.getElementById('mode-ai').addEventListener('click', () => setMode(true));

    function setMode(ai) {
      vsAI = ai;
      document.getElementById('mode-2p').classList.toggle('active', !ai);
      document.getElementById('mode-ai').classList.toggle('active', ai);
      reset();
    }

    function reset() {
      S = initialState();
      undoStack = [];
      selected = null;
      legalForSelected = [];
      aiThinking = false;
      pendingPromo = null;
      promoOverlay.classList.remove('active');
      draw();
    }

    reset();
  })();
