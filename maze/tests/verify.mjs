// node tests/verify.mjs —— 验收清单 1-6
import { generate, solve, neighbors } from '../js/maze.js';
import { LEVELS, buildLevel, reachableAvoiding } from '../js/levels.js';

const EXPECTED = [
  { id: 1, n: 5, stars: 3 },
  { id: 2, n: 5, stars: 3 },
  { id: 3, n: 6, stars: 4 },
  { id: 4, n: 7, stars: 4 },
  { id: 5, n: 7, stars: 5 },
  { id: 6, n: 8, stars: 5 },
  { id: 7, n: 9, stars: 6 },
  { id: 8, n: 9, stars: 6 },
  { id: 9, n: 10, stars: 7 },
  { id: 10, n: 10, stars: 7 },
  { id: 11, n: 11, stars: 8 },
  { id: 12, n: 11, stars: 8 },
];

const key = (n, x, y) => y * n + x;

// 从起点 BFS，统计可达格子数
function reachableCount(maze) {
  const { n } = maze;
  const seen = new Set([key(n, 0, 0)]);
  const queue = [{ x: 0, y: 0 }];
  for (let i = 0; i < queue.length; i++) {
    for (const nb of neighbors(maze, queue[i].x, queue[i].y)) {
      const k = key(n, nb.x, nb.y);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(nb);
    }
  }
  return seen.size;
}

// 统计相邻格之间的开口数，并检查墙的对称性
function countEdges(maze) {
  const { n, walls } = maze;
  let edges = 0;
  let symmetric = true;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (x < n - 1) {
        if (!walls[y][x].E) edges++;
        if (walls[y][x].E !== walls[y][x + 1].W) symmetric = false;
      }
      if (y < n - 1) {
        if (!walls[y][x].S) edges++;
        if (walls[y][x].S !== walls[y + 1][x].N) symmetric = false;
      }
    }
  }
  return { edges, symmetric };
}

let failed = 0;

for (let i = 0; i < EXPECTED.length; i++) {
  const exp = EXPECTED[i];
  const problems = [];
  const ok = [];

  // 6. 关卡表一致
  const level = LEVELS.find((l) => l.id === exp.id);
  const tableOk = level && level.n === exp.n && level.stars === exp.stars;
  if (tableOk) ok.push('表格✓');
  else problems.push(`表格不符：期望 ${exp.n}×${exp.n} ${exp.stars}★，实际 ${level ? `${level.n}×${level.n} ${level.stars}★` : '缺失'}`);

  // 1. 起终点可达（同时得到 buildLevel 结果）
  let lv = null;
  try {
    lv = buildLevel(exp.id);
  } catch (e) {
    problems.push(`buildLevel 抛错：${e.message}`);
  }

  if (!lv) {
    console.log(`关卡 ${exp.id}  FAIL  ${problems.join('；')}`);
    failed++;
    continue;
  }

  const { n, maze, start, goal, stars } = lv;

  // 尺寸也来自 buildLevel，一并核对
  if (lv.n !== exp.n) problems.push(`buildLevel 尺寸 ${lv.n} ≠ ${exp.n}`);

  const path = solve(maze, start, goal);
  if (path && path.length > 0) ok.push('可达✓');
  else problems.push('起点→终点不可达');

  // 4. 两次生成相同
  const again = generate(n, level.seed);
  if (JSON.stringify(again) === JSON.stringify(maze)) ok.push('确定性✓');
  else problems.push('两次生成结果不同');

  // 3. 完美迷宫：边数 = n²-1，连通无孤立格，墙对称
  const { edges, symmetric } = countEdges(maze);
  const visited = reachableCount(maze);
  if (edges === n * n - 1 && visited === n * n && symmetric) {
    ok.push(`完美迷宫✓(${edges}边/${n * n}格)`);
  } else {
    problems.push(`非完美迷宫：边 ${edges}（应 ${n * n - 1}），可达 ${visited}/${n * n}，对称 ${symmetric}`);
  }

  // 2. 星星：数量、不重复、不在起终点、都可达
  const starProblems = [];
  const seenStars = new Set();
  if (stars.length !== exp.stars) starProblems.push(`数量 ${stars.length} ≠ ${exp.stars}`);
  for (const s of stars) {
    const k = key(n, s.x, s.y);
    if (seenStars.has(k)) starProblems.push(`重复 (${s.x},${s.y})`);
    seenStars.add(k);
    if ((s.x === start.x && s.y === start.y) || (s.x === goal.x && s.y === goal.y)) {
      starProblems.push(`在起终点 (${s.x},${s.y})`);
    }
    if (!solve(maze, start, s)) starProblems.push(`不可达 (${s.x},${s.y})`);
    if (!reachableAvoiding(maze, start, goal).some((c) => c.x === s.x && c.y === s.y)) starProblems.push(`要经过终点才能到 (${s.x},${s.y})`);
  }
  if (starProblems.length === 0) ok.push('星星✓');
  else problems.push(...starProblems);

  // 5. 至少 1 颗星不在最短路
  const onPath = new Set((path || []).map((p) => key(n, p.x, p.y)));
  const offPathStars = stars.filter((s) => !onPath.has(key(n, s.x, s.y))).length;
  if (offPathStars >= 1) ok.push(`路外星${offPathStars}✓`);
  else problems.push('没有星星在最短路之外');

  if (problems.length === 0) {
    console.log(`关卡 ${String(exp.id).padStart(2)}  ${n}×${n} ${exp.stars}★  PASS  ${ok.join(' ')}`);
  } else {
    failed++;
    console.log(`关卡 ${String(exp.id).padStart(2)}  ${n}×${n} ${exp.stars}★  FAIL  ${problems.join('；')}`);
  }
}

if (failed === 0) {
  console.log(`\n全部 ${EXPECTED.length} 关通过 ✅`);
  process.exit(0);
} else {
  console.log(`\n${failed} 关未通过 ❌`);
  process.exit(1);
}
