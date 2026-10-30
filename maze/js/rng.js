// 种子 PRNG：mulberry32。同一 seed 永远产生同一串随机数。
// 导出 makeRng(seed) -> rng()，并附带 rng.int(n) / rng.shuffle(arr)。

export function makeRng(seed) {
  let a = seed >>> 0;

  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // 返回 [0, n) 的整数
  rng.int = (n) => Math.floor(rng() * n);

  // 原地洗牌（Fisher-Yates），返回同一数组
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  return rng;
}
