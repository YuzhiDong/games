// 迷宫生成与求解。纯函数，可在浏览器和 node 中 import。
import { makeRng } from './rng.js';

const DIRS = [
  { d: 'N', dx: 0, dy: -1, opp: 'S' },
  { d: 'E', dx: 1, dy: 0, opp: 'W' },
  { d: 'S', dx: 0, dy: 1, opp: 'N' },
  { d: 'W', dx: -1, dy: 0, opp: 'E' },
];

const inBounds = (n, x, y) => x >= 0 && y >= 0 && x < n && y < n;

// 递归回溯（迭代栈）生成完美迷宫。
// 返回 { n, walls }，walls[y][x] = { N, E, S, W }，true 表示有墙。
export function generate(n, seed) {
  const rng = makeRng(seed);
  const walls = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => ({ N: true, E: true, S: true, W: true }))
  );
  const visited = Array.from({ length: n }, () => new Array(n).fill(false));

  visited[0][0] = true;
  const stack = [{ x: 0, y: 0 }];

  while (stack.length > 0) {
    const { x, y } = stack[stack.length - 1];
    const options = DIRS.filter(({ dx, dy }) => {
      const nx = x + dx;
      const ny = y + dy;
      return inBounds(n, nx, ny) && !visited[ny][nx];
    });

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const dir = options[rng.int(options.length)];
    const nx = x + dir.dx;
    const ny = y + dir.dy;
    walls[y][x][dir.d] = false;
    walls[ny][nx][dir.opp] = false;
    visited[ny][nx] = true;
    stack.push({ x: nx, y: ny });
  }

  return { n, walls };
}

// 相邻且无墙的格子，返回 [{ x, y }...]
export function neighbors(maze, x, y) {
  const { n, walls } = maze;
  if (!inBounds(n, x, y)) return [];
  const out = [];
  for (const { d, dx, dy } of DIRS) {
    if (walls[y][x][d]) continue;
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(n, nx, ny)) out.push({ x: nx, y: ny });
  }
  return out;
}

// BFS 最短路。返回含起终点的 [{ x, y }...]，无路返回 null。
export function solve(maze, a, b) {
  const { n } = maze;
  if (!a || !b || !inBounds(n, a.x, a.y) || !inBounds(n, b.x, b.y)) return null;

  const key = (x, y) => y * n + x;
  const prev = new Map();
  const seen = new Uint8Array(n * n);
  const queue = [{ x: a.x, y: a.y }];
  seen[key(a.x, a.y)] = 1;

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur.x === b.x && cur.y === b.y) {
      const path = [];
      let cx = cur.x;
      let cy = cur.y;
      while (cx !== a.x || cy !== a.y) {
        path.push({ x: cx, y: cy });
        const p = prev.get(key(cx, cy));
        cx = p.x;
        cy = p.y;
      }
      path.push({ x: a.x, y: a.y });
      return path.reverse();
    }
    for (const nb of neighbors(maze, cur.x, cur.y)) {
      const k = key(nb.x, nb.y);
      if (seen[k]) continue;
      seen[k] = 1;
      prev.set(k, cur);
      queue.push(nb);
    }
  }

  return null;
}
