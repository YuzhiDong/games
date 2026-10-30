// 小动物回家 · 游戏逻辑
// 状态、渲染、输入、存档、音效。依赖已验收的 levels.js / maze.js。

import { LEVELS, buildLevel } from './levels.js';
import { solve } from './maze.js';

const STORAGE_KEY = 'daisyMaze.v1';
const PETS = ['rabbit', 'cat', 'dog', 'panda'];
const PET_NAMES = { rabbit: '小兔', cat: '小猫', dog: '小狗', panda: '熊猫' };

const CELL = 100;          // 迷宫坐标单位
const PAD = 16;            // 迷宫内边距（坐标单位）
const SWIPE_MIN = 25;      // 滑动阈值 px
const HOLD_MS = 180;       // 按住方向键的连走间隔
const PET_SIZE = 1;        // 小动物占格子比例

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  home: $('#home'),
  levels: $('#levels'),
  game: $('#game'),
  win: $('#win'),
  allDone: $('#allDone'),
  levelGrid: $('#levelGrid'),
  startBtn: $('#startBtn'),
  homeBackBtn: $('#homeBackBtn'),
  backBtn: $('#backBtn'),
  soundBtn: $('#soundBtn'),
  levelTitle: $('#levelTitle'),
  hudCollected: $('#hudCollected'),
  hudTotal: $('#hudTotal'),
  board: $('#board'),
  mazeSvg: $('#mazeSvg'),
  pet: $('#pet'),
  hintBtn: $('#hintBtn'),
  winStars: $('#winStars'),
  winMsg: $('#winMsg'),
  nextBtn: $('#nextBtn'),
  replayBtn: $('#replayBtn'),
  toLevelsBtn: $('#toLevelsBtn'),
  allStars: $('#allStars'),
  allDoneLevelsBtn: $('#allDoneLevelsBtn'),
  allDoneHomeBtn: $('#allDoneHomeBtn'),
  totalStars: $('#totalStars'),
};

// ---------- 存档 ----------

function defaultSave() {
  return { unlocked: 1, stars: {}, pet: 'rabbit', sound: true };
}

function loadSave() {
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;

    const pet = PETS.includes(data.pet) ? data.pet : 'rabbit';
    const sound = typeof data.sound === 'boolean' ? data.sound : true;

    let unlocked = Number.isInteger(data.unlocked) ? data.unlocked : 1;
    unlocked = Math.max(1, Math.min(LEVELS.length, unlocked));

    const stars = {};
    if (data.stars && typeof data.stars === 'object' && !Array.isArray(data.stars)) {
      for (const lv of LEVELS) {
        const value = data.stars[lv.id] ?? data.stars[String(lv.id)];
        if (Number.isInteger(value) && value >= 1 && value <= 3) stars[lv.id] = value;
      }
    }

    return { unlocked, stars, pet, sound };
  } catch (err) {
    return fallback;
  }
}

const save = loadSave();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    /* 无痕模式或存储被禁用时静默忽略 */
  }
}

// ---------- 运行时状态 ----------

let screen = 'home';
let currentLevel = 1;
let levelData = buildLevel(1);
let pos = { x: levelData.start.x, y: levelData.start.y };
let collected = 0;
let starCells = new Set(levelData.stars.map((s) => s.y * levelData.n + s.x));
let finishing = false;
let winOpen = false;
let allDoneOpen = false;

let hintTimer = 0;
let winTimer = 0;
let allDoneTimer = 0;
let hopTimer = 0;
let bumpTimer = 0;

function isPlaying() {
  return screen === 'game' && !winOpen && !allDoneOpen && !finishing;
}

// ---------- 音效（WebAudio 合成） ----------

let audioCtx = null;

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC();
  } catch (err) {
    audioCtx = null;
  }
  return audioCtx;
}

function tone(freq, dur = 0.16, type = 'sine', vol = 0.07, delay = 0) {
  if (!save.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch (err) {
    /* 音效失败不影响游戏 */
  }
}

function playWinSound() {
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, i * 0.13));
}

function playAllDoneSound() {
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.34, 'sine', 0.08, i * 0.12));
}

function updateSoundBtn() {
  els.soundBtn.setAttribute('aria-pressed', String(save.sound));
  els.soundBtn.setAttribute('aria-label', save.sound ? '关闭声音' : '打开声音');
  els.soundBtn.classList.toggle('off', !save.sound);
  const use = els.soundBtn.querySelector('use');
  if (use) use.setAttribute('href', save.sound ? '#sound-on' : '#sound-off');
}

// ---------- 屏幕 ----------

function showScreen(name) {
  screen = name;
  document.body.dataset.screen = name;
  [els.home, els.levels, els.game].forEach((section) => {
    const on = section.id === name;
    section.classList.toggle('active', on);
    section.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
  if (name === 'home') renderHome();
  if (name === 'levels') renderLevels();
}

function renderHome() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  els.totalStars.textContent = String(total);
  applyPetArt();
}

function applyPetArt() {
  $$('[data-pet-art]').forEach((use) => use.setAttribute('href', `#pet-${save.pet}`));
  $$('.pet-option').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.pet === save.pet));
  });
}

function renderLevels() {
  els.levelGrid.innerHTML = LEVELS.map((lv) => {
    const unlocked = lv.id <= save.unlocked;
    const earned = save.stars[lv.id] || 0;

    if (!unlocked) {
      return `<button class="level-btn locked" type="button" data-level="${lv.id}" disabled aria-label="第 ${lv.id} 关，未解锁">
        <svg class="lock-icon" viewBox="0 0 30 30" aria-hidden="true"><use href="#lock"/></svg>
        <span class="lv-size">${lv.n}×${lv.n}</span>
      </button>`;
    }

    const stars = [0, 1, 2]
      .map((i) => `<svg class="lv-star" viewBox="0 0 40 40" aria-hidden="true"><use href="#${i < earned ? 'star' : 'star0'}"/></svg>`)
      .join('');

    return `<button class="level-btn" type="button" data-level="${lv.id}" aria-label="第 ${lv.id} 关，${lv.n}×${lv.n}，${earned} 颗星">
      <span class="lv-num">${lv.id}</span>
      <span class="lv-stars">${stars}</span>
      <span class="lv-size">${lv.n}×${lv.n}</span>
    </button>`;
  }).join('');
}

// ---------- 迷宫渲染 ----------

function renderMaze() {
  const { n, maze, goal } = levelData;
  const T = n * CELL + PAD * 2;
  const sw = CELL * 0.32;
  const goalKey = goal.y * n + goal.x;
  const cx = (k) => PAD + (k % n) * CELL + CELL / 2;
  const cy = (k) => PAD + Math.floor(k / n) * CELL + CELL / 2;

  // 只画每道共享墙一次
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const w = maze.walls[y][x];
      const px = PAD + x * CELL;
      const py = PAD + y * CELL;
      if (w.N) d += `M${px} ${py}h${CELL}`;
      if (w.W) d += `M${px} ${py}v${CELL}`;
      if (x === n - 1 && w.E) d += `M${px + CELL} ${py}v${CELL}`;
      if (y === n - 1 && w.S) d += `M${px} ${py + CELL}h${CELL}`;
    }
  }

  let svg = `<rect width="${T}" height="${T}" fill="url(#grass)"/>`;

  // 终点小屋
  svg += `<use href="#house" x="${cx(goalKey) - CELL * 0.48}" y="${cy(goalKey) - CELL * 0.52}" width="${CELL * 0.96}" height="${CELL * 0.96}"/>`;

  // 星星
  for (const star of levelData.stars) {
    const k = star.y * n + star.x;
    if (!starCells.has(k)) continue;
    svg += `<g class="star-item" data-cell="${k}">
      <ellipse cx="${cx(k)}" cy="${cy(k) + CELL * 0.28}" rx="${CELL * 0.18}" ry="${CELL * 0.05}" fill="#2F5D50" opacity=".18"/>
      <use href="#star" x="${cx(k) - CELL * 0.3}" y="${cy(k) - CELL * 0.32}" width="${CELL * 0.6}" height="${CELL * 0.6}"/>
    </g>`;
  }

  // 提示光点在星星之上、树篱之下，保证看得见
  svg += '<g id="hintLayer" class="hint-layer"></g>';

  // 树篱：模糊投影 + 深绿 + 亮绿 + 点状高光
  svg += `<path d="${d}" transform="translate(0 7)" stroke="#2E5B3F" stroke-width="${sw}" stroke-linecap="round" fill="none" opacity=".55" filter="url(#soft)"/>`;
  svg += `<path d="${d}" stroke="#3E7A45" stroke-width="${sw}" stroke-linecap="round" fill="none"/>`;
  svg += `<path d="${d}" stroke="#5E9E55" stroke-width="${sw * 0.62}" stroke-linecap="round" fill="none" transform="translate(0 -2)"/>`;
  svg += `<path d="${d}" stroke="#8CC46F" stroke-width="${sw * 0.18}" stroke-linecap="round" stroke-dasharray="2 ${sw * 0.9}" fill="none" transform="translate(0 -4)"/>`;

  els.mazeSvg.setAttribute('viewBox', `0 0 ${T} ${T}`);
  els.mazeSvg.innerHTML = svg;
}

function placePet(animate) {
  const { n } = levelData;
  const T = n * CELL + PAD * 2;
  const f = 100 / T;
  const size = CELL * PET_SIZE * f;
  const left = (PAD + pos.x * CELL) * f;
  const top = (PAD + pos.y * CELL - CELL * 0.06) * f;

  if (!animate) els.pet.style.transition = 'none';
  els.pet.style.width = `calc((100% - 24px) * ${size / 100})`;
  els.pet.style.height = `calc((100% - 24px) * ${size / 100})`;
  els.pet.style.left = `calc(12px + (100% - 24px) * ${left / 100})`;
  els.pet.style.top = `calc(12px + (100% - 24px) * ${top / 100})`;

  if (!animate) {
    void els.pet.offsetWidth;
    els.pet.style.transition = '';
  }
}

function updateHud() {
  els.hudCollected.textContent = String(collected);
}

// ---------- 游戏流程 ----------

function clearHint() {
  clearTimeout(hintTimer);
  hintTimer = 0;
  const layer = els.mazeSvg.querySelector('#hintLayer');
  if (layer) {
    layer.innerHTML = '';
    layer.classList.remove('fading');
  }
}

function clearTimers() {
  clearTimeout(hintTimer);
  clearTimeout(winTimer);
  clearTimeout(allDoneTimer);
  hintTimer = winTimer = allDoneTimer = 0;
}

function startLevel(id) {
  if (!Number.isInteger(id) || id < 1 || id > LEVELS.length || id > save.unlocked) return;

  clearTimers();
  closeWin();
  closeAllDone();

  currentLevel = id;
  levelData = buildLevel(id);
  pos = { ...levelData.start };
  collected = 0;
  finishing = false;
  starCells = new Set(levelData.stars.map((s) => s.y * levelData.n + s.x));

  els.levelTitle.textContent = `第 ${id} 关`;
  els.hudCollected.textContent = '0';
  els.hudTotal.textContent = String(levelData.stars.length);

  applyPetArt();
  renderMaze();
  placePet(false);
  showScreen('game');
}

function bump(dx, dy) {
  els.pet.classList.remove('bump');
  void els.pet.offsetWidth;
  els.pet.style.setProperty('--bx', `${dx * 14}%`);
  els.pet.style.setProperty('--by', `${dy * 14}%`);
  els.pet.classList.add('bump');
  clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => els.pet.classList.remove('bump'), 360);
  tone(150, 0.15, 'triangle', 0.07);
}

function hop() {
  const g = els.pet.querySelector('.pet-hop');
  if (!g) return;
  g.classList.remove('hop');
  void g.getBoundingClientRect();
  g.classList.add('hop');
  clearTimeout(hopTimer);
  hopTimer = setTimeout(() => g.classList.remove('hop'), 280);
}

function removeStar(k) {
  const el = els.mazeSvg.querySelector(`.star-item[data-cell="${k}"]`);
  if (el) el.remove();

  const layer = els.mazeSvg.querySelector('#hintLayer');
  if (!layer) return;
  const n = levelData.n;
  const x = PAD + (k % n) * CELL + CELL / 2;
  const y = PAD + Math.floor(k / n) * CELL + CELL / 2;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'star-pop');
  g.innerHTML = `<use href="#star" x="${x - CELL * 0.3}" y="${y - CELL * 0.32}" width="${CELL * 0.6}" height="${CELL * 0.6}"/>`;
  layer.appendChild(g);
  setTimeout(() => g.remove(), 560);
}

const MOVES = {
  up: { dx: 0, dy: -1, wall: 'N' },
  right: { dx: 1, dy: 0, wall: 'E' },
  down: { dx: 0, dy: 1, wall: 'S' },
  left: { dx: -1, dy: 0, wall: 'W' },
};

function tryMove(dir) {
  if (!isPlaying()) return;
  const move = MOVES[dir];
  if (!move) return;

  const walls = levelData.maze.walls[pos.y][pos.x];
  if (walls[move.wall]) {
    bump(move.dx, move.dy);
    return;
  }

  pos = { x: pos.x + move.dx, y: pos.y + move.dy };
  clearHint();

  const k = pos.y * levelData.n + pos.x;
  if (starCells.has(k)) {
    starCells.delete(k);
    collected += 1;
    removeStar(k);
    updateHud();
    tone(880, 0.1, 'sine', 0.07);
    tone(1174, 0.16, 'sine', 0.07, 0.07);
  } else {
    tone(560, 0.08, 'triangle', 0.045);
  }

  placePet(true);
  hop();

  if (pos.x === levelData.goal.x && pos.y === levelData.goal.y) {
    finishing = true;
    clearTimeout(winTimer);
    winTimer = setTimeout(win, 420);
  }
}

function showHint() {
  if (!isPlaying()) return;
  const path = solve(levelData.maze, pos, levelData.goal);
  const layer = els.mazeSvg.querySelector('#hintLayer');
  if (!path || path.length < 2 || !layer) return;

  const cells = path.slice(1, 4);
  layer.classList.remove('fading');
  layer.innerHTML = cells
    .map((c, i) => {
      const x = PAD + c.x * CELL + CELL / 2;
      const y = PAD + c.y * CELL + CELL / 2;
      return `<circle class="hint-dot" style="animation-delay:${i * 0.15}s" cx="${x}" cy="${y}" r="${CELL * 0.2}" fill="#FFE27A" stroke="#F5C04A" stroke-width="4" opacity=".95"/>`;
    })
    .join('');

  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    layer.classList.add('fading');
    hintTimer = setTimeout(() => {
      layer.innerHTML = '';
      layer.classList.remove('fading');
    }, 460);
  }, 2000);

  tone(880, 0.1, 'sine', 0.05);
}

function win() {
  if (winOpen) return;
  finishing = true;

  const total = levelData.stars.length;
  const rating = collected >= total ? 3 : collected >= total / 2 ? 2 : 1;

  save.stars[currentLevel] = Math.max(save.stars[currentLevel] || 0, rating);
  if (currentLevel < LEVELS.length && save.unlocked <= currentLevel) {
    save.unlocked = currentLevel + 1;
  }
  persist();

  els.winStars.innerHTML = [0, 1, 2]
    .map((i) => {
      const earned = i < rating;
      return `<svg class="star ${earned ? 'earned' : 'empty'}" style="animation-delay:${0.18 + i * 0.2}s" viewBox="0 0 40 40" aria-hidden="true"><use href="#${earned ? 'star' : 'star0'}"/></svg>`;
    })
    .join('');

  els.winMsg.textContent = `捡到 ${collected} 颗星星，${PET_NAMES[save.pet]}好开心！`;

  if (currentLevel < LEVELS.length) {
    els.nextBtn.hidden = false;
    els.nextBtn.textContent = '下一关';
  } else {
    els.nextBtn.hidden = false;
    els.nextBtn.textContent = '全部通关！';
  }

  winOpen = true;
  els.win.classList.add('open');
  els.win.setAttribute('aria-hidden', 'false');

  playWinSound();
  confetti();

  clearTimeout(allDoneTimer);
  if (currentLevel === LEVELS.length) {
    allDoneTimer = setTimeout(() => {
      if (winOpen && !allDoneOpen) openAllDone();
    }, 3000);
  }
}

function closeWin() {
  winOpen = false;
  els.win.classList.remove('open');
  els.win.setAttribute('aria-hidden', 'true');
  clearTimeout(allDoneTimer);
}

function openAllDone() {
  if (allDoneOpen) return;
  clearTimeout(allDoneTimer);
  allDoneOpen = true;

  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  els.allStars.textContent = String(total);
  els.allDone.classList.add('open');
  els.allDone.setAttribute('aria-hidden', 'false');

  confetti();
  playAllDoneSound();
}

function closeAllDone() {
  allDoneOpen = false;
  els.allDone.classList.remove('open');
  els.allDone.setAttribute('aria-hidden', 'true');
}

function goLevels() {
  clearTimers();
  clearHint();
  finishing = false;
  closeWin();
  closeAllDone();
  showScreen('levels');
}

function confetti() {
  if (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const colors = ['#F5C04A', '#E5869F', '#8CC46F', '#8EC5E0', '#FFFFFF', '#F7B9C8'];
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.background = colors[i % colors.length];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.setProperty('--dx', `${Math.random() * 120 - 60}px`);
    el.style.animationDelay = `${Math.random() * 0.7}s`;
    if (i % 3 === 0) el.style.borderRadius = '50%';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
}

// ---------- 输入 ----------

els.startBtn.addEventListener('click', () => {
  showScreen('levels');
});

els.homeBackBtn.addEventListener('click', () => {
  showScreen('home');
});

els.backBtn.addEventListener('click', goLevels);
els.toLevelsBtn.addEventListener('click', goLevels);

els.nextBtn.addEventListener('click', () => {
  if (currentLevel < LEVELS.length) startLevel(currentLevel + 1);
  else openAllDone();
});

els.replayBtn.addEventListener('click', () => {
  startLevel(currentLevel);
});

els.allDoneLevelsBtn.addEventListener('click', goLevels);

els.allDoneHomeBtn.addEventListener('click', () => {
  closeWin();
  closeAllDone();
  showScreen('home');
});

els.levelGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.level-btn');
  if (!btn || btn.disabled) return;
  const id = Number(btn.dataset.level);
  if (Number.isInteger(id)) startLevel(id);
});

$$('.pet-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    const pet = btn.dataset.pet;
    if (!PETS.includes(pet)) return;
    save.pet = pet;
    persist();
    applyPetArt();
    renderHome();
    tone(740, 0.1, 'sine', 0.06);
  });
});

els.soundBtn.addEventListener('click', () => {
  save.sound = !save.sound;
  persist();
  updateSoundBtn();
  if (save.sound) tone(660, 0.12, 'sine', 0.07);
});

els.hintBtn.addEventListener('click', showHint);

// 方向键：点一下走一步，按住每 180ms 走一步
const stopHolds = new Set();

$$('.dir-btn').forEach((btn) => {
  const dir = btn.dataset.dir;
  let repeat = 0;
  let held = false;

  const stop = () => {
    held = false;
    clearInterval(repeat);
    repeat = 0;
    btn.classList.remove('dn');
  };
  stopHolds.add(stop);

  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (held) return;
    held = true;
    btn.classList.add('dn');
    tryMove(dir);
    repeat = setInterval(() => tryMove(dir), HOLD_MS);
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 某些浏览器不支持捕获，交给 window 的兜底 */
    }
  });

  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('lostpointercapture', stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());

  // 键盘 Enter / 空格触发的 click（detail === 0）
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) tryMove(dir);
  });
});

window.addEventListener('pointerup', () => {
  Array.from(stopHolds).forEach((stop) => stop());
});
window.addEventListener('pointercancel', () => {
  Array.from(stopHolds).forEach((stop) => stop());
});

// 键盘
const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
  W: 'up',
  A: 'left',
  S: 'down',
  D: 'right',
};

window.addEventListener('keydown', (e) => {
  if (screen !== 'game' || winOpen || allDoneOpen) return;

  const dir = KEY_MAP[e.key];
  if (dir) {
    e.preventDefault();
    tryMove(dir);
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    showHint();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    goLevels();
  }
});

// 滑动：触摸事件（touchstart / touchend）
let touchStart = null;

els.board.addEventListener('touchstart', (e) => {
  if (!isPlaying() || e.touches.length !== 1) return;
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

els.board.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 'right' : 'left');
  else tryMove(dy > 0 ? 'down' : 'up');
}, { passive: true });

els.board.addEventListener('touchcancel', () => {
  touchStart = null;
}, { passive: true });

// 滑动：鼠标 / 触控笔（触摸交给上面的 touch 事件，避免走两步）
let pointerStart = null;

els.board.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || !isPlaying()) return;
  pointerStart = { x: e.clientX, y: e.clientY };
  try {
    els.board.setPointerCapture(e.pointerId);
  } catch (err) {
    /* ignore */
  }
});

els.board.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch' || !pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 'right' : 'left');
  else tryMove(dy > 0 ? 'down' : 'up');
});

els.board.addEventListener('pointercancel', () => {
  pointerStart = null;
});

// 首次交互后再创建 AudioContext
['pointerdown', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (save.sound) ensureAudio();
  }, { once: true, passive: true });
});

// ---------- 测试钩子 ----------

window.__maze = {
  state() {
    return {
      screen: allDoneOpen ? 'allDone' : winOpen ? 'win' : screen,
      level: currentLevel,
      pos: { x: pos.x, y: pos.y },
      collected,
      unlocked: save.unlocked,
      stars: { ...save.stars },
      pet: save.pet,
      sound: save.sound,
    };
  },
  level() {
    return levelData;
  },
};

// ---------- 启动 ----------

persist();
updateSoundBtn();
applyPetArt();
renderHome();
renderLevels();
showScreen('home');
