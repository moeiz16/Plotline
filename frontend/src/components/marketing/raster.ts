/**
 * Stylised satellite raster for the landing story: a 32 × 24 grid of 25 px land-cover cells
 * over an 800 × 600 scene, before (31 Dec 2020) and after (2026). Generated once,
 * deterministically, and emitted as a handful of compound paths (one per land-cover class)
 * so the scene stays light in the DOM.
 */
import { rng } from "./topo";

type Pt = [number, number];

export const SCENE = { w: 800, h: 600, cell: 25, cols: 32, rows: 24 };

/** The surveyed plot, CI-NAW-0007 (scene coordinates), staked in this order. */
export const PARCEL: Pt[] = [
  [250, 170],
  [455, 140],
  [560, 250],
  [530, 420],
  [350, 465],
  [225, 360],
];
export const PARCEL_D = `M${PARCEL.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

/** The stakes' coordinates as a reader would see them on the phone (decimal degrees). */
export const STAKE_COORDS = PARCEL.map(([x, y]) => ({
  lat: (5.8124 - y * 0.0000118).toFixed(4),
  lon: (6.6031 - x * 0.0000118).toFixed(4),
}));

/** The corner cleared in 2022, as an ellipse. */
const CLEAR = { cx: 462, cy: 330, rx: 122, ry: 90 };

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

type Cls = "forestDeep" | "forest" | "forestThin" | "farm" | "farmAlt" | "cleared";

function cellPath(c: number, r: number) {
  const g = SCENE.cell;
  return `M${c * g + 0.5} ${r * g + 0.5}h${g - 1}v${g - 1}h-${g - 1}Z`;
}

function build() {
  const rand = rng(2020);
  const before: Record<Cls, string[]> = { forestDeep: [], forest: [], forestThin: [], farm: [], farmAlt: [], cleared: [] };
  const after: Record<Cls, string[]> = { forestDeep: [], forest: [], forestThin: [], farm: [], farmAlt: [], cleared: [] };
  const loss: string[] = [];
  for (let r = 0; r < SCENE.rows; r++) {
    for (let c = 0; c < SCENE.cols; c++) {
      const x = c * SCENE.cell + SCENE.cell / 2;
      const y = r * SCENE.cell + SCENE.cell / 2;
      const n = rand();
      const field = 0.52 + 0.22 * Math.sin(x / 95 + 0.6) * Math.cos(y / 80 - 0.4) + 0.2 * Math.sin((x + y) / 140) + (rand() - 0.5) * 0.34;
      const inPlot = inside([x, y], PARCEL);
      const forest = inPlot ? n < 0.86 : field > 0.5;
      const density = rand();
      const forestCls: Cls = density > 0.62 ? "forestDeep" : density > 0.25 ? "forest" : "forestThin";
      const farmCls: Cls = (c + r * 3) % 5 === 0 || n > 0.8 ? "farmAlt" : "farm";
      const cls: Cls = forest ? forestCls : farmCls;
      const p = cellPath(c, r);
      before[cls].push(p);

      const inClear = ((x - CLEAR.cx) / CLEAR.rx) ** 2 + ((y - CLEAR.cy) / CLEAR.ry) ** 2 <= 1;
      // Outside the plot: a new track and a small field opened after 2020 (not this plot's concern).
      const track = Math.abs(y - (520 - x * 0.12)) < 13 && x > 380;
      const field2 = ((x - 690) / 70) ** 2 + ((y - 110) / 55) ** 2 <= 1;
      if (forest && ((inPlot && inClear) || (!inPlot && (track || field2)))) {
        after.cleared.push(p);
        if (inPlot) loss.push(p);
      } else after[cls].push(p);
    }
  }
  const join = (rec: Record<Cls, string[]>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v.join("")])) as Record<Cls, string>;
  return { before: join(before), after: join(after), loss: loss.join("") };
}

export const RASTER = build();

/** Fill and opacity per land-cover class (theme tokens; forest reads as forest in both sheets). */
export const CLASS_STYLE: Record<Cls, { fill: string; opacity: number }> = {
  forestDeep: { fill: "var(--compliant)", opacity: 0.86 },
  forest: { fill: "var(--compliant)", opacity: 0.64 },
  forestThin: { fill: "var(--compliant)", opacity: 0.44 },
  farm: { fill: "var(--sheet-3)", opacity: 1 },
  farmAlt: { fill: "var(--ink)", opacity: 0.1 },
  cleared: { fill: "var(--rule-strong)", opacity: 0.9 },
};
