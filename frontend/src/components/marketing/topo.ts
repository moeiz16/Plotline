/**
 * Deterministic topography for the landing story and the auth/error grounds.
 * Contour rings are generated once at module load (no randomness at render), so the
 * server and client draw the same map and nothing shifts on hydration.
 */

type Pt = [number, number];

/** Small seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Closed Catmull-Rom spline through the points, as cubic Béziers. */
export function closedPath(pts: Pt[]) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** Open Catmull-Rom spline (rivers, tracks). */
export function openPath(pts: Pt[]) {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

export type Contour = { d: string; index: boolean; level: number };

/**
 * One hill: nested, non-crossing rings. Inner rings drift toward `drift` so the slope is
 * asymmetric, like real terrain. Every `indexEvery`th ring is an index contour (drawn heavier).
 */
export function hill({
  cx,
  cy,
  r,
  rings,
  seed,
  drift = [0, 0],
  squash = 1,
  indexEvery = 4,
  baseLevel = 0,
}: {
  cx: number;
  cy: number;
  r: number;
  rings: number;
  seed: number;
  drift?: Pt;
  squash?: number;
  indexEvery?: number;
  baseLevel?: number;
}): Contour[] {
  const rand = rng(seed);
  const harmonics = [2, 3, 4, 5, 7].map((k) => ({ k, a: (0.05 + rand() * 0.11) / Math.sqrt(k - 1), ph: rand() * Math.PI * 2, drift: (rand() - 0.5) * 0.9 }));
  const out: Contour[] = [];
  const steps = 56;
  for (let ring = 0; ring < rings; ring++) {
    const s = 1 - ring / rings; // outermost first
    const ox = cx + drift[0] * (1 - s);
    const oy = cy + drift[1] * (1 - s);
    const pts: Pt[] = [];
    for (let i = 0; i < steps; i++) {
      const th = (i / steps) * Math.PI * 2;
      let k = 1;
      for (const h of harmonics) k += h.a * Math.sin(h.k * th + h.ph + h.drift * (1 - s));
      const rr = r * s * k;
      pts.push([ox + Math.cos(th) * rr, oy + Math.sin(th) * rr * squash]);
    }
    out.push({ d: closedPath(pts), index: ring % indexEvery === 0, level: baseLevel + ring * 20 });
  }
  return out;
}

/** Hero sheet (viewBox 1600 × 1000): three hills, a valley river, the surveyed plot near the centre-right. */
export const HERO_VIEW = { w: 1600, h: 1000 };
export const HERO_CONTOURS: Contour[] = [
  ...hill({ cx: 1120, cy: 640, r: 820, rings: 17, seed: 11, drift: [-140, -60], squash: 0.78, baseLevel: 120 }),
  ...hill({ cx: 250, cy: 210, r: 470, rings: 11, seed: 7, drift: [60, 40], squash: 0.9, baseLevel: 140 }),
  ...hill({ cx: 1490, cy: 90, r: 300, rings: 7, seed: 23, drift: [-30, 20], baseLevel: 160 }),
  ...hill({ cx: 140, cy: 930, r: 330, rings: 8, seed: 31, drift: [40, -30], squash: 0.85, baseLevel: 120 }),
];
export const HERO_RIVER = openPath([
  [-20, 520],
  [160, 560],
  [330, 500],
  [520, 560],
  [640, 700],
  [760, 760],
  [900, 940],
  [960, 1040],
]);
/** Where the story zooms in: the plot's place on the hero sheet (as % of the sheet). */
export const HERO_PLOT_ORIGIN = { x: 0.785, y: 0.7 };
export const HERO_PLOT: Pt[] = [
  [1226, 666],
  [1282, 656],
  [1310, 694],
  [1300, 738],
  [1250, 750],
  [1218, 714],
];

/** Story scene basemap (viewBox 800 × 600): the same land, zoomed in. */
export const SCENE_CONTOURS: Contour[] = [
  ...hill({ cx: 640, cy: 470, r: 620, rings: 14, seed: 41, drift: [-120, -70], squash: 0.82, baseLevel: 180 }),
  ...hill({ cx: 90, cy: 80, r: 260, rings: 7, seed: 43, drift: [40, 30], baseLevel: 200 }),
];
export const SCENE_RIVER = openPath([
  [-10, 300],
  [80, 330],
  [150, 420],
  [190, 520],
  [260, 610],
]);

/** Small ground for auth cards and error pages (viewBox 1200 × 800). */
export const GROUND_VIEW = { w: 1200, h: 800 };
export const GROUND_CONTOURS: Contour[] = [
  ...hill({ cx: 980, cy: 260, r: 560, rings: 13, seed: 5, drift: [-90, 50], squash: 0.84, baseLevel: 100 }),
  ...hill({ cx: 160, cy: 700, r: 420, rings: 10, seed: 9, drift: [70, -40], squash: 0.9, baseLevel: 100 }),
];
