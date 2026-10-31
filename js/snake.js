/* 贪吃蛇 — 方向队列防 180° 反向、吃食增长、速度随分数提升 */
'use strict';
(() => {
  const GRID = 20;                 // 20 x 20 格
  const BASE_MS = 160;             // 初始步进间隔
  const MIN_MS = 60;               // 最快
  const SPEED_STEP = 6;            // 每 10 分加速 6ms
  const FOOD_SCORE = 10;

  const cv = document.getElementById('board');
  const ctx = cv.getContext('2d');
  const hud = {
    score: document.getElementById('hud-score'),
    len: document.getElementById('hud-len'),
    speed: document.getElementById('hud-speed'),
    best: document.getElementById('hud-best'),
  };
  const overlay = document.getElementById('overlay');
  const ov = {
    title: document.getElementById('ov-title'),
    score: document.getElementById('ov-score'),
    len: document.getElementById('ov-len'),
    best: document.getElementById('ov-best'),
    newbest: document.getElementById('ov-newbest'),
    main: document.getElementById('ov-main'),
    restart: document.getElementById('ov-restart'),
    home: document.getElementById('ov-home'),
  };

  let CELL = 16;
  function fitCanvas() {
    const stage = document.querySelector('.stage');
    const avail = Math.min(stage.clientWidth, window.innerHeight - 260, 440);
    CELL = Math.max(12, Math.floor(avail / GRID));
    cv.width = CELL * GRID;
    cv.height = CELL * GRID;
    draw();
  }
  window.addEventListener('resize', fitCanvas);

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const S = {
    snake: [], dir: 'right', queue: [],
    food: null, score: 0,
    state: 'ready', // ready | playing | paused | over
    acc: 0,
    best: parseInt(localStorage.getItem('snake.best.score') || '0', 10),
  };

  function speedMs() {
    return Math.max(MIN_MS, BASE_MS - Math.floor(S.score / FOOD_SCORE) * SPEED_STEP);
  }
  function speedLevel() {
    return Math.floor(S.score / FOOD_SCORE) + 1;
  }

  function placeFood() {
    const free = [];
    const body = new Set(S.snake.map(p => p.x + ',' + p.y));
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      if (!body.has(x + ',' + y)) free.push({ x, y });
    }
    S.food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function start() {
    const cy = Math.floor(GRID / 2);
    S.snake = [{ x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }];
    S.dir = 'right'; S.queue = [];
    S.score = 0; S.acc = 0;
    S.state = 'playing';
    placeFood();
    hideOverlay(); updateHud(); draw();
  }

  function setDir(d) {
    if (!DIRS[d]) return;
    if (S.state !== 'playing') return;
    const lastDir = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
    const [lx, ly] = DIRS[lastDir], [nx, ny] = DIRS[d];
    if (lx + nx === 0 && ly + ny === 0) return;  // 禁止 180° 反向
    if (d === lastDir) return;
    if (S.queue.length < 3) S.queue.push(d);
  }

  function step() {
    while (S.queue.length) {
      const d = S.queue.shift();
      const [cx, cy] = DIRS[S.dir], [nx, ny] = DIRS[d];
      if (!(cx + nx === 0 && cy + ny === 0) && d !== S.dir) { S.dir = d; break; }
    }
    const [dx, dy] = DIRS[S.dir];
    const head = { x: S.snake[0].x + dx, y: S.snake[0].y + dy };
    // 撞墙
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) return gameOver();
    const eating = S.food && head.x === S.food.x && head.y === S.food.y;
    // 撞自己（不吃时尾巴会移走，排除尾格）
    const body = eating ? S.snake : S.snake.slice(0, -1);
    if (body.some(p => p.x === head.x && p.y === head.y)) return gameOver();
    S.snake.unshift(head);
    if (eating) {
      S.score += FOOD_SCORE;
      placeFood();
      if (!S.food) return win(); // 吃满全场
      updateHud();
    } else {
      S.snake.pop();
    }
  }

  function updateHud() {
    hud.score.textContent = S.score;
    hud.len.textContent = S.snake.length;
    hud.speed.textContent = speedLevel();
    hud.best.textContent = Math.max(S.best, S.score);
  }
  function saveBest() {
    if (S.score > S.best) {
      S.best = S.score;
      localStorage.setItem('snake.best.score', String(S.best));
      return true;
    }
    return false;
  }
  function showOverlay(mode) {
    if (mode === 'pause') {
      ov.title.textContent = '已暂停';
      ov.main.style.display = '';
      ov.newbest.textContent = '';
      ov.best.textContent = S.best;
    } else {
      const isNew = saveBest();
      ov.title.textContent = '游戏结束';
      ov.main.style.display = 'none';
      ov.best.textContent = S.best;
      ov.newbest.textContent = isNew ? '🎉 新纪录！' : '';
    }
    ov.score.textContent = S.score;
    ov.len.textContent = S.snake.length;
    overlay.classList.add('show');
  }
  function hideOverlay() { overlay.classList.remove('show'); }
  function pause() { if (S.state === 'playing') { S.state = 'paused'; showOverlay('pause'); } }
  function resume() { if (S.state === 'paused') { S.state = 'playing'; hideOverlay(); } }
  function togglePause() {
    if (S.state === 'playing') pause(); else if (S.state === 'paused') resume();
  }
  function gameOver() { S.state = 'over'; showOverlay('over'); draw(); }
  function win() { S.state = 'over'; showOverlay('over'); }

  // ---- 渲染 ----
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue('--grid-line');
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, GRID * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(GRID * CELL, i * CELL); ctx.stroke();
    }
    if (S.food) {
      ctx.fillStyle = '#e05252';
      const pad = CELL * 0.15;
      ctx.beginPath();
      ctx.arc(S.food.x * CELL + CELL / 2, S.food.y * CELL + CELL / 2, CELL / 2 - pad, 0, Math.PI * 2);
      ctx.fill();
    }
    S.snake.forEach((p, i) => {
      const t = 1 - i / Math.max(S.snake.length, 1);
      ctx.fillStyle = i === 0 ? '#5fd08a' : `rgba(79,193,107,${0.55 + t * 0.45})`;
      const pad = i === 0 ? 1 : 1.5;
      ctx.fillRect(p.x * CELL + pad, p.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
    });
  }

  // ---- 主循环 ----
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    if (S.state === 'playing') {
      S.acc += dt;
      const ms = speedMs();
      while (S.acc >= ms && S.state === 'playing') {
        S.acc -= ms;
        step();
      }
      draw();
    }
    requestAnimationFrame(loop);
  }

  // ---- 输入：键盘 ----
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  document.addEventListener('keydown', e => {
    if (KEYMAP[e.key]) { setDir(KEYMAP[e.key]); e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'p' || e.key === 'P') { togglePause(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') start();
    else if (e.key === 'Enter') {
      if (S.state === 'over' || S.state === 'ready') start();
      else if (S.state === 'paused') resume();
    }
  });

  // ---- 输入：触屏滑动 ----
  let ts = null;
  cv.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    ts = { x: t.clientX, y: t.clientY };
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!ts) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ts.x, dy = t.clientY - ts.y;
    const th = CELL * 0.8;
    if (Math.abs(dx) > th || Math.abs(dy) > th) {
      setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      ts = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  cv.addEventListener('touchend', e => { e.preventDefault(); ts = null; }, { passive: false });

  document.getElementById('touchpad').addEventListener('click', e => {
    const act = e.target.dataset && e.target.dataset.act;
    if (act) setDir(act);
  });

  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', start);
  document.getElementById('btn-home').addEventListener('click', () => location.href = 'index.html');
  ov.main.addEventListener('click', () => { if (S.state === 'paused') resume(); });
  ov.restart.addEventListener('click', start);
  ov.home.addEventListener('click', () => location.href = 'index.html');

  fitCanvas();
  updateHud();
  start();
  requestAnimationFrame(loop);

  // ---- 测试钩子 ----
  window.__SNAKE__ = {
    get state() {
      return { score: S.score, len: S.snake.length, dir: S.dir, state: S.state,
               best: S.best, speedMs: speedMs(),
               head: { ...S.snake[0] }, food: S.food && { ...S.food },
               snake: S.snake.map(p => ({ ...p })) };
    },
    setDir, start, pause, resume, step,
    // 调试用：把食物放到蛇头正前方
    debugFoodAhead() {
      const [dx, dy] = DIRS[S.dir];
      S.food = { x: S.snake[0].x + dx, y: S.snake[0].y + dy };
      draw();
    },
  };
})();
