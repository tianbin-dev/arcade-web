/* 俄罗斯方块 — SRS 旋转踢墙 + 7-Bag + 连消计分 + 等级加速 */
'use strict';
(() => {
  const COLS = 10, ROWS = 20;
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  const COLORS = {
    I: '#38c6d9', O: '#e8c33a', T: '#a05fd6', S: '#4fc16b',
    Z: '#e05a5a', J: '#4f7fe0', L: '#e8923f',
  };
  // SRS 踢墙表（dy 已取反为「行向下为正」坐标系）。key: from>to
  const KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '1>0': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '2>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '3>2': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '0>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  };
  const KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  };
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const LOCK_DELAY = 400, MAX_LOCK_RESETS = 15;

  // ---- DOM ----
  const boardCv = document.getElementById('board');
  const bctx = boardCv.getContext('2d');
  const nextCv = document.getElementById('next');
  const nctx = nextCv.getContext('2d');
  const hud = {
    score: document.getElementById('hud-score'),
    lines: document.getElementById('hud-lines'),
    level: document.getElementById('hud-level'),
    best: document.getElementById('hud-best'),
  };
  const overlay = document.getElementById('overlay');
  const ov = {
    title: document.getElementById('ov-title'),
    score: document.getElementById('ov-score'),
    lines: document.getElementById('ov-lines'),
    best: document.getElementById('ov-best'),
    newbest: document.getElementById('ov-newbest'),
    main: document.getElementById('ov-main'),
    restart: document.getElementById('ov-restart'),
    home: document.getElementById('ov-home'),
  };

  // ---- 画布尺寸 ----
  let CELL = 24;
  function fitCanvas() {
    const stage = document.querySelector('.stage');
    const sideW = document.querySelector('.side').offsetWidth || 96;
    const availW = Math.min(stage.clientWidth - sideW - 10, 420);
    const availH = window.innerHeight - 260;
    CELL = Math.max(12, Math.floor(Math.min(availW / COLS, availH / ROWS)));
    boardCv.width = COLS * CELL;
    boardCv.height = ROWS * CELL;
    const pc = Math.max(10, Math.floor(CELL * 0.8));
    nextCv.width = pc * 4; nextCv.height = pc * 4;
    nextCv.dataset.cell = pc;
    draw();
  }
  window.addEventListener('resize', fitCanvas);

  // ---- 游戏状态 ----
  const S = {
    board: [], piece: null, next: null, bag: [],
    score: 0, lines: 0, level: 1, combo: -1,
    state: 'ready', // ready | playing | paused | over
    fallAcc: 0, lockAt: null, lockResets: 0,
    best: parseInt(localStorage.getItem('tetris.best.score') || '0', 10),
  };

  function newBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }
  function refillBag() {
    S.bag = Object.keys(SHAPES);
    for (let i = S.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [S.bag[i], S.bag[j]] = [S.bag[j], S.bag[i]];
    }
  }
  function takeType() {
    if (S.bag.length === 0) refillBag();
    return S.bag.pop();
  }
  function rotateMatrix(m, dir) { // dir: 1 cw, -1 ccw
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (dir === 1) r[x][n - 1 - y] = m[y][x];
      else r[n - 1 - x][y] = m[y][x];
    }
    return r;
  }
  function makePiece(type) {
    return { type, m: SHAPES[type].map(r => r.slice()), rot: 0,
             row: type === 'I' ? -1 : 0, col: type === 'O' ? 4 : 3 };
  }
  function collides(m, row, col) {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
      if (!m[y][x]) continue;
      const r = row + y, c = col + x;
      if (c < 0 || c >= COLS || r >= ROWS) return true;
      if (r >= 0 && S.board[r][c]) return true;
    }
    return false;
  }
  function gravityMs() {
    return Math.pow(0.8 - (S.level - 1) * 0.007, S.level - 1) * 1000;
  }

  function spawn() {
    const p = makePiece(S.next || takeType());
    S.next = takeType();
    S.piece = p;
    S.lockAt = null; S.lockResets = 0;
    if (collides(p.m, p.row, p.col)) { gameOver(); return false; }
    drawNext();
    return true;
  }

  function onGround() {
    return collides(S.piece.m, S.piece.row + 1, S.piece.col);
  }
  function resetLock() {
    if (S.lockAt !== null && S.lockResets < MAX_LOCK_RESETS) {
      S.lockAt = performance.now();
      S.lockResets++;
    }
  }

  function move(dx) {
    if (S.state !== 'playing') return false;
    const p = S.piece;
    if (!collides(p.m, p.row, p.col + dx)) {
      p.col += dx; resetLock(); draw(); return true;
    }
    return false;
  }
  function rotate(dir) {
    if (S.state !== 'playing') return false;
    const p = S.piece;
    if (p.type === 'O') return true;
    const nm = rotateMatrix(p.m, dir);
    const to = (p.rot + (dir === 1 ? 1 : 3)) % 4;
    const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    const kicks = table[p.rot + '>' + to] || [[0, 0]];
    for (const [dx, dy] of kicks) {
      if (!collides(nm, p.row + dy, p.col + dx)) {
        p.m = nm; p.row += dy; p.col += dx; p.rot = to;
        resetLock(); draw(); return true;
      }
    }
    return false;
  }
  function stepDown() { // 重力/软降一步，返回是否还能继续下落
    const p = S.piece;
    if (!collides(p.m, p.row + 1, p.col)) {
      p.row++; S.lockAt = null; return true;
    }
    return false;
  }
  function softDrop() {
    if (S.state !== 'playing') return;
    if (stepDown()) { S.score += 1; S.fallAcc = 0; hud.score.textContent = S.score; draw(); }
  }
  function hardDrop() {
    if (S.state !== 'playing') return;
    const p = S.piece;
    let d = 0;
    while (!collides(p.m, p.row + 1, p.col)) { p.row++; d++; }
    S.score += d * 2;
    lockPiece();
  }

  function lockPiece() {
    const p = S.piece;
    let lockedAbove = false;
    for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
      if (!p.m[y][x]) continue;
      const r = p.row + y, c = p.col + x;
      if (r < 0) { lockedAbove = true; continue; }
      S.board[r][c] = p.type;
    }
    if (lockedAbove) { gameOver(); return; }
    const cleared = clearLines();
    if (cleared > 0) {
      S.combo = Math.min(S.combo + 1, 99);
      S.lines += cleared;
      S.score += LINE_SCORE[cleared] * S.level;
      if (S.combo > 0) S.score += 50 * S.combo * S.level;
      S.level = Math.floor(S.lines / 10) + 1;
    } else {
      S.combo = -1;
    }
    updateHud();
    if (S.state === 'playing') spawn();
    draw();
  }
  function clearLines() {
    let n = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (S.board[r].every(c => c)) {
        S.board.splice(r, 1);
        S.board.unshift(Array(COLS).fill(0));
        n++; r++;
      }
    }
    return n;
  }

  // ---- 流程 ----
  function updateHud() {
    hud.score.textContent = S.score;
    hud.lines.textContent = S.lines;
    hud.level.textContent = S.level;
    hud.best.textContent = Math.max(S.best, S.score);
  }
  function saveBest() {
    const bestLevel = parseInt(localStorage.getItem('tetris.best.level') || '1', 10);
    if (S.score > S.best) {
      S.best = S.score;
      localStorage.setItem('tetris.best.score', String(S.best));
      localStorage.setItem('tetris.best.level', String(S.level));
      return true;
    } else if (S.level > bestLevel) {
      localStorage.setItem('tetris.best.level', String(S.level));
    }
    return false;
  }
  function showOverlay(mode) {
    if (mode === 'pause') {
      ov.title.textContent = '已暂停';
      ov.main.textContent = '继续';
      ov.main.style.display = '';
      ov.score.textContent = S.score;
      ov.lines.textContent = S.lines + ' / ' + S.level;
      ov.best.textContent = S.best;
      ov.newbest.textContent = '';
    } else if (mode === 'over') {
      const isNew = saveBest();
      ov.title.textContent = '游戏结束';
      ov.main.style.display = 'none';
      ov.score.textContent = S.score;
      ov.lines.textContent = S.lines + ' / ' + S.level;
      ov.best.textContent = S.best;
      ov.newbest.textContent = isNew ? '🎉 新纪录！' : '';
    }
    overlay.classList.add('show');
  }
  function hideOverlay() { overlay.classList.remove('show'); }

  function start() {
    S.board = newBoard();
    S.score = 0; S.lines = 0; S.level = 1; S.combo = -1;
    S.bag = []; S.next = null; S.fallAcc = 0;
    S.state = 'playing';
    spawn();
    updateHud(); hideOverlay(); draw();
  }
  function pause() {
    if (S.state !== 'playing') return;
    S.state = 'paused';
    showOverlay('pause');
  }
  function resume() {
    if (S.state !== 'paused') return;
    S.state = 'playing';
    hideOverlay();
  }
  function togglePause() {
    if (S.state === 'playing') pause();
    else if (S.state === 'paused') resume();
  }
  function gameOver() {
    S.state = 'over';
    showOverlay('over');
    draw();
  }

  // ---- 渲染 ----
  function drawCell(ctx, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x * size, y * size, size, Math.max(2, size * 0.12));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
  }
  function draw() {
    bctx.clearRect(0, 0, boardCv.width, boardCv.height);
    bctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--grid-line');
    bctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      bctx.beginPath(); bctx.moveTo(c * CELL, 0); bctx.lineTo(c * CELL, ROWS * CELL); bctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      bctx.beginPath(); bctx.moveTo(0, r * CELL); bctx.lineTo(COLS * CELL, r * CELL); bctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (S.board[r] && S.board[r][c]) drawCell(bctx, c, r, CELL, COLORS[S.board[r][c]]);
    }
    const p = S.piece;
    if (p && S.state !== 'over') {
      // 幽灵落点
      let gr = p.row;
      while (!collides(p.m, gr + 1, p.col)) gr++;
      bctx.globalAlpha = 0.18;
      for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
        if (p.m[y][x] && gr + y >= 0) drawCell(bctx, p.col + x, gr + y, CELL, COLORS[p.type]);
      }
      bctx.globalAlpha = 1;
      for (let y = 0; y < p.m.length; y++) for (let x = 0; x < p.m.length; x++) {
        if (p.m[y][x] && p.row + y >= 0) drawCell(bctx, p.col + x, p.row + y, CELL, COLORS[p.type]);
      }
    }
  }
  function drawNext() {
    const pc = parseInt(nextCv.dataset.cell || '20', 10);
    nctx.clearRect(0, 0, nextCv.width, nextCv.height);
    if (!S.next) return;
    const m = SHAPES[S.next];
    let minX = 9, maxX = -1, minY = 9, maxY = -1;
    m.forEach((row, y) => row.forEach((v, x) => {
      if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x);
               minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }));
    const ox = (4 - (maxX - minX + 1)) / 2 - minX;
    const oy = (4 - (maxY - minY + 1)) / 2 - minY;
    m.forEach((row, y) => row.forEach((v, x) => {
      if (v) drawCell(nctx, x + ox, y + oy, pc, COLORS[S.next]);
    }));
  }

  // ---- 主循环 ----
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    if (S.state === 'playing') {
      S.fallAcc += dt;
      if (onGround()) {
        if (S.lockAt === null) S.lockAt = now;
        else if (now - S.lockAt >= LOCK_DELAY) { lockPiece(); }
      } else {
        S.lockAt = null;
        if (S.fallAcc >= gravityMs()) {
          S.fallAcc = 0;
          stepDown();
        }
      }
      // 软降长按
      if (keys.down) { softAcc += dt; if (softAcc > 40) { softAcc = 0; softDrop(); } }
      // DAS/ARR
      for (const dir of ['left', 'right']) {
        const k = keys[dir];
        if (!k.down) continue;
        if (now - k.at < 130) continue;
        k.arr = (k.arr || 0) + dt;
        if (k.arr >= 40) { k.arr = 0; move(dir === 'left' ? -1 : 1); }
      }
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---- 输入：键盘 ----
  const keys = {
    left: { down: false, at: 0 }, right: { down: false, at: 0 }, down: false,
  };
  let softAcc = 0;
  document.addEventListener('keydown', e => {
    if (e.repeat && !['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.key)) return;
    switch (e.key) {
      case 'ArrowLeft':
        keys.left = { down: true, at: performance.now(), arr: 0 };
        if (!e.repeat) move(-1);
        e.preventDefault(); break;
      case 'ArrowRight':
        keys.right = { down: true, at: performance.now(), arr: 0 };
        if (!e.repeat) move(1);
        e.preventDefault(); break;
      case 'ArrowDown':
        keys.down = true;
        if (!e.repeat) softDrop();
        e.preventDefault(); break;
      case 'ArrowUp': case 'x': case 'X': rotate(1); e.preventDefault(); break;
      case 'z': case 'Z': rotate(-1); e.preventDefault(); break;
      case ' ': hardDrop(); e.preventDefault(); break;
      case 'p': case 'P': togglePause(); break;
      case 'r': case 'R': start(); break;
      case 'Enter':
        if (S.state === 'ready' || S.state === 'over') start();
        else if (S.state === 'paused') resume();
        break;
    }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') keys.left.down = false;
    if (e.key === 'ArrowRight') keys.right.down = false;
    if (e.key === 'ArrowDown') keys.down = false;
  });

  // ---- 输入：触屏（滑动 + 按钮）----
  let ts = null;
  boardCv.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    ts = { x: t.clientX, y: t.clientY, t: performance.now(), moved: 0, lastX: t.clientX };
  }, { passive: false });
  boardCv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!ts) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ts.lastX;
    if (Math.abs(dx) >= CELL * 0.9) {
      move(dx > 0 ? 1 : -1);
      ts.lastX = t.clientX; ts.moved++;
    }
    const dy = t.clientY - ts.y;
    if (dy > CELL * 1.2 && performance.now() - ts.t > 120) softDrop();
  }, { passive: false });
  boardCv.addEventListener('touchend', e => {
    e.preventDefault();
    if (!ts) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - ts.y;
    const dur = performance.now() - ts.t;
    if (dy > CELL * 3 && dur < 250) hardDrop();          // 快速下甩
    else if (ts.moved === 0 && Math.abs(dy) < CELL) rotate(1); // 点按
    ts = null;
  }, { passive: false });

  document.getElementById('touchpad').addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    if (act === 'left') move(-1);
    else if (act === 'right') move(1);
    else if (act === 'rotate') rotate(1);
    else if (act === 'down') softDrop();
    else if (act === 'drop') hardDrop();
    else if (act === 'pause') togglePause();
  });

  // ---- 按钮 ----
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', start);
  document.getElementById('btn-home').addEventListener('click', () => location.href = 'index.html');
  ov.main.addEventListener('click', () => { if (S.state === 'paused') resume(); });
  ov.restart.addEventListener('click', start);
  ov.home.addEventListener('click', () => location.href = 'index.html');

  // ---- 启动 ----
  fitCanvas();
  updateHud();
  start();
  requestAnimationFrame(loop);

  // ---- 测试钩子 ----
  window.__TETRIS__ = {
    get state() {
      return { score: S.score, lines: S.lines, level: S.level, state: S.state,
               best: S.best, board: S.board.map(r => r.slice()),
               piece: S.piece && { type: S.piece.type, row: S.piece.row, col: S.piece.col, m: S.piece.m.map(r => r.slice()) },
               next: S.next };
    },
    move, rotate, softDrop, hardDrop, start, pause, resume,
    // 调试用：填入底部若干行并留出洞口，放置指定方块（可指定旋转次数与最终左列）
    debugSetupGap(type, col, filledRows, rot = 0) {
      S.board = newBoard();
      for (let r = ROWS - filledRows; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (c !== col) S.board[r][c] = 'J';
      const p = makePiece(type);
      for (let i = 0; i < rot; i++) { p.m = rotateMatrix(p.m, 1); p.rot = (p.rot + 1) % 4; }
      p.col = col - (type === 'I' ? 2 : 1);
      p.row = 0;
      S.piece = p;
      S.state = 'playing';
      draw();
    },
  };
})();
