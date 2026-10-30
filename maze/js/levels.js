// 关卡表 + 星星摆放。种子固定 → 每关每次生成同一张图。
import { makeRng } from './rng.js';
import { generate, solve, neighbors } from './maze.js';

export const LEVELS = [
  { id: 1, n: 5, stars: 3, seed: 7 },
  { id: 2, n: 5, stars: 3, seed: 19 },
  { id: 3, n: 6, stars: 4, seed: 31 },
  { id: 4, n: 7, stars: 4, seed: 43 },
  { id: 5, n: 7, stars: 5, seed: 59 },
  { id: 6, n: 8, stars: 5, seed: 71 },
  { id: 7, n: 9, stars: 6, seed: 83 },
  { id: 8, n: 9, stars: 6, seed: 97 },
  { id: 9, n: 10, stars: 7, seed: 109 },
  { id: 10, n: 10, stars: 7, seed: 127 },
  { id: 11, n: 11, stars: 8, seed: 139 },
  { id: 12, n: 11, stars: 8, seed: 151 },
];

// 确定性摆星：不在起终点、不重复，至少 1 颗在最短路之外，
// 优先选岔路死胡同，其余按种子洗牌补齐。
function placeStars(maze, n, seed, count, start, goal) {
  const rng = makeRng(seed + 1);
  const path = solve(maze, start, goal) || [];
  const onPath = new Set(path.map((p) => p.y * n + p.x));

  // 只在「不经过终点就能走到」的格子放星：到家即过关，终点后面的星永远捡不到。
  const eligible = reachableAvoiding(maze, start, goal)
    .filter((c) => !(c.x === start.x && c.y === start.y));

  const isOffPath = (c) => !onPath.has(c.y * n + c.x);
  const isDeadEnd = (c) => neighbors(maze, c.x, c.y).length === 1;

  const offDeadEnds = rng.shuffle(eligible.filter((c) => isOffPath(c) && isDeadEnd(c)));
  const offPath = rng.shuffle(eligible.filter(isOffPath));
  const rest = rng.shuffle(eligible.filter((c) => !isOffPath(c)));

  const picked = [];
  const used = new Set();
  const take = (pool) => {
    for (const c of pool) {
      if (picked.length >= count) return;
      const k = c.y * n + c.x;
      if (used.has(k)) continue;
      used.add(k);
      picked.push({ x: c.x, y: c.y });
    }
  };

  take(offDeadEnds);
  take(offPath);
  take(rest);

  // 保持坐标顺序稳定（方便调试），不影响随机性
  return picked.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function reachableAvoiding(maze, start, block) {
  const n = maze.n;
  const seen = new Set([start.y * n + start.x]);
  const out = [];
  const q = [start];
  while (q.length) {
    const c = q.shift();
    out.push({ x: c.x, y: c.y });
    for (const nb of neighbors(maze, c.x, c.y)) {
      const k = nb.y * n + nb.x;
      if (seen.has(k) || (nb.x === block.x && nb.y === block.y)) continue;
      seen.add(k);
      q.push({ x: nb.x, y: nb.y });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function buildLevel(id) {
  const level = LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`未知关卡：${id}`);

  const { n, seed } = level;
  const maze = generate(n, seed);
  const start = { x: 0, y: 0 };
  const goal = { x: n - 1, y: n - 1 };
  const stars = placeStars(maze, n, seed, level.stars, start, goal);

  return { id, n, maze, start, goal, stars };
}
