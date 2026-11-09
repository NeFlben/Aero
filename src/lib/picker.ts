/** Unbiased integer in [0, n) from the platform CSPRNG, using rejection sampling. */
export function secureRandomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0) throw new Error("n must be a positive integer");
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

export function pickRandom<T>(pool: T[]): T | null {
  return pool.length ? pool[secureRandomInt(pool.length)] : null;
}

/**
 * The reel the animation plays: the winner is drawn first and placed last. The frames before it are
 * only decoration, so the animation can never influence the outcome. Frame delays ease out.
 */
export function buildReel<T>(pool: T[], winner: T, frames = 22): T[] {
  if (pool.length <= 1) return [winner];
  // Built backwards from the winner. No model appears twice in a row, which would read as a stutter.
  const reel: T[] = [winner];
  for (let i = 0; i < frames - 1; i++) {
    let prev = pool[secureRandomInt(pool.length)];
    if (prev === reel[0]) prev = pool[(pool.indexOf(prev) + 1) % pool.length];
    reel.unshift(prev);
  }
  return reel;
}

/** Delays summing to `total` ms, starting fast and braking towards the end. */
export function reelDelays(count: number, total = 3000): number[] {
  if (count <= 1) return [];
  const steps = count - 1;
  const weights = Array.from({ length: steps }, (_, i) => 1 + 9 * Math.pow(i / Math.max(1, steps - 1), 3));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

const fnv1a = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Final avalanche so consecutive dates do not map to neighbouring items.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
};

/** Stable for a user and calendar day. Sorted by id so insertion order does not reshuffle the day. */
export function aircraftOfTheDay<T extends { id: string }>(items: T[], userId: string, day: string): T | null {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[fnv1a(`${userId}:${day}`) % sorted.length];
}

export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
