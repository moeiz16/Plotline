"use client";

import type { Map as MLMap } from "maplibre-gl";
import { Crosshair, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AtlasMap, type FrameCommand, type Padding } from "@/components/map/atlas-map";
import { StatusLine } from "@/components/map/status-line";
import type { Basemap } from "@/components/map/base";
import { LedgerPanel, LedgerPeek } from "@/components/map/ledger-panel";
import { PlotInspector } from "@/components/map/plot-inspector";
import { CUTOFF_YEAR, NO_LOSS, RULER_LAST, enrich, regionBounds, regionOf, regionsWithPlots } from "@/components/map/plot-style";
import { TimeRuler } from "@/components/map/time-ruler";
import { boundsOf } from "@/components/map/base";
import { PageContainer } from "@/components/shell/app-shell";
import { SPRING_DRAWER } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { EmptyState, FloatingPanel, Segmented, Skeleton } from "@/components/ui/display";
import { useDashboard, usePlots, usePlotsMap } from "@/lib/api/hooks";
import { useSession } from "@/lib/api/session";
import type { Geometry, Verdict } from "@/lib/api/types";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const PANEL_W = 340;
const INSPECTOR_W = 420;

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

function typingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable=true], [role=slider], [role=dialog]");
}

export default function AtlasPage() {
  const { me } = useSession();
  const dash = useDashboard();
  const mapQ = usePlotsMap();
  const plotsQ = usePlots();
  const desktop = useDesktop();
  const reduce = useReducedMotion();

  const hints = useMemo(() => new Map((plotsQ.data ?? []).map((p) => [p.id, { headline: p.headline, country: p.country }])), [plotsQ.data]);
  const data = useMemo(() => (mapQ.data ? enrich(mapQ.data, hints) : undefined), [mapQ.data, hints]);

  const [year, setYear] = useState(RULER_LAST);
  const [hidden, setHidden] = useState<Verdict[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("map");
  const [frame, setFrame] = useState<FrameCommand | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [mapObj, setMapObj] = useState<MLMap | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [boxH, setBoxH] = useState(700);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBoxH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padding: Padding = desktop
    ? { top: 32, left: PANEL_W + 56, bottom: 150, right: selected ? INSPECTOR_W + 64 : 200 }
    : { top: 72, left: 28, right: 28, bottom: selected ? 0 : 210 };
  // On phones the inspector covers the lower part of the map: fly into the band above it.
  if (!desktop && selected) padding.bottom = Math.round(boxH * 0.64);

  /* ── Selection from the URL (?plot=) on first load, and back into it ── */
  const urlRead = useRef(false);
  useEffect(() => {
    if (urlRead.current) return;
    urlRead.current = true;
    const id = new URLSearchParams(window.location.search).get("plot");
    if (id) setSelected(id);
  }, []);
  const select = useCallback((id: string | null) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("plot", id);
    else url.searchParams.delete("plot");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, []);

  // An id in the link that isn't one of this organisation's plots is ignored.
  useEffect(() => {
    if (data && selected && !data.features.some((f) => f.properties.id === selected)) select(null);
  }, [data, selected, select]);

  /* ── First framing: the region holding most plots (or the selected plot's) ── */
  const regions = useMemo(() => (data ? regionsWithPlots(data).sort((a, b) => b.plots - a.plots) : []), [data]);
  const framed = useRef(false);
  useEffect(() => {
    if (!data || framed.current || !data.features.length) return;
    framed.current = true;
    const sel = selected ? data.features.find((f) => f.properties.id === selected) : undefined;
    const key = sel ? regionOf(sel.properties.country) : regions[0]?.key ?? null;
    setRegion(key);
    setFrame({ key: `first-${key}`, bounds: regionBounds(data, key), maxZoom: 9.5, instant: true });
  }, [data, regions, selected]);

  const jump = (key: string | null) => {
    if (!data) return;
    setRegion(key);
    setFrame({ key: `${key}-${Date.now()}`, bounds: regionBounds(data, key), maxZoom: 11 });
  };

  /* ── Plot order for [ and ] ─────────────────────────────────────────── */
  const order = useMemo(() => (data?.features ?? []).filter((f) => !hidden.includes(f.properties.verdict)).map((f) => f.properties.id), [data, hidden]);
  const step = useCallback(
    (dir: -1 | 1) => {
      if (!order.length) return;
      const i = selected ? order.indexOf(selected) : -1;
      select(order[(i + dir + order.length) % order.length]);
    },
    [order, selected, select],
  );

  /* ── Keyboard: ←/→ ruler, [ ] plots, Esc closes ─────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingTarget(e.target)) return;
      if (e.key === "Escape" && selected) select(null);
      else if (e.key === "[") step(-1);
      else if (e.key === "]") step(1);
      else if (e.key === "ArrowLeft") setYear((y) => Math.max(2018, y - 1));
      else if (e.key === "ArrowRight") setYear((y) => Math.min(RULER_LAST, y + 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, select, step]);

  /* ── Ruler figures ──────────────────────────────────────────────────── */
  const visible = useMemo(() => (data?.features ?? []).filter((f) => !hidden.includes(f.properties.verdict)), [data, hidden]);
  const histogram = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of visible) for (const [y, v] of Object.entries(f.properties.lossByYear ?? {})) out[y] = (out[y] ?? 0) + Number(v || 0);
    return out;
  }, [visible]);
  const upTo = visible.filter((f) => f.properties.lossYear !== NO_LOSS && f.properties.lossYear <= year);
  const haUpTo = Object.entries(histogram).reduce((s, [y, v]) => (Number(y) <= year ? s + v : s), 0);
  const rulerNote =
    year <= CUTOFF_YEAR
      ? "Before the cut-off"
      : upTo.length
        ? `${upTo.length} ${upTo.length === 1 ? "plot" : "plots"} · ${num(haUpTo, 1)} ha cleared`
        : "No forest cleared yet";

  const onNote = (i: { href?: string | null }) => {
    const m = i.href?.match(/^\/app\/plots\?verdict=(\w+)/);
    if (!m || !data) return false;
    const v = m[1] as Verdict;
    const feats = data.features.filter((f) => f.properties.verdict === v);
    const b = boundsOf(feats.map((f) => f.geometry as Geometry));
    if (!b) return false;
    setHidden([]);
    setYear(RULER_LAST);
    setRegion(null);
    setFrame({ key: `note-${v}-${Date.now()}`, bounds: b, maxZoom: 11 });
    return true;
  };

  const d = dash.data;
  const title = `${(me?.activeOrg?.name ?? "Your").split(/\s+/)[0]} atlas`;
  const countries = new Set((data?.features ?? []).map((f) => f.properties.country)).size;
  const areaHa = d?.kpis.areaHa ?? (data?.features ?? []).reduce((s, f) => s + Number(f.properties.areaHa || 0), 0);
  const selIndex = selected ? order.indexOf(selected) : -1;
  const empty = mapQ.isSuccess && !mapQ.data.features.length;

  const panel = d ? (
    <LedgerPanel
      d={d}
      title={title}
      areaHa={areaHa}
      countries={countries}
      hidden={hidden}
      onToggle={(v) => setHidden((h) => (h.includes(v) ? h.filter((x) => x !== v) : [...h, v]))}
      onNote={onNote}
    />
  ) : dash.isError ? (
    <p className="text-[14px] italic text-ink-muted">
      The ledger couldn’t be loaded.{" "}
      <button className="underline" onClick={() => dash.refetch()}>
        Try again
      </button>
    </p>
  ) : (
    <div role="status" aria-label="Loading the ledger">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-5 h-10 w-full" />
      <Skeleton className="mt-3 h-2.5 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="mt-3 h-3.5 w-full" />
      ))}
    </div>
  );

  const ruler = <TimeRuler year={year} onYear={setYear} lossByYear={histogram} note={rulerNote} compact={!desktop} />;

  return (
    <PageContainer bleed>
      <h1 className="sr-only">Atlas</h1>
      <div ref={box} className="relative h-[calc(100dvh-var(--masthead-h)-var(--tabbar-h))] min-h-[480px] overflow-hidden">
        <AtlasMap
          data={data}
          year={year}
          hidden={hidden}
          selectedId={selected}
          onSelect={select}
          frame={frame}
          padding={padding}
          basemap={basemap}
          onMap={setMapObj}
          className={cn(
            "absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:transition-[right] [&_.maplibregl-ctrl-bottom-right]:duration-500",
            desktop
              ? cn("[&_.maplibregl-ctrl-bottom-right]:!bottom-[150px] [&_.maplibregl-ctrl-bottom-right]:!right-1", selected && "[&_.maplibregl-ctrl-bottom-right]:!right-[446px]")
              : "[&_.maplibregl-ctrl-bottom-right]:!bottom-auto [&_.maplibregl-ctrl-bottom-right]:!top-12",
          )}
        />

        {/* ── Desktop: ledger panel ─────────────────────────────────────── */}
        {desktop ? (
          <FloatingPanel
            className="absolute left-4 top-4 z-10 overflow-y-auto overscroll-contain p-4 scrollbar-thin"
            style={{ width: PANEL_W, maxHeight: "calc(100% - 172px)" }}
          >
            {panel}
          </FloatingPanel>
        ) : null}

        {/* ── Instruments: background, regions, zoom ────────────────────── */}
        {desktop ? (
          <div
            className="absolute top-4 z-10 flex w-[168px] flex-col items-end gap-2 transition-[right] duration-[var(--dur-slow)] ease-[var(--ease-survey)]"
            style={{ right: selected ? INSPECTOR_W + 28 : 16 }}
          >
            <Segmented
              label="Background"
              value={basemap}
              onChange={setBasemap}
              className="shadow-pop"
              options={[
                { value: "map", label: "Map" },
                { value: "satellite", label: "Satellite" },
              ]}
            />
            {regions.length > 1 ? (
              <FloatingPanel className="w-full px-3 pb-2 pt-2.5">
                <p className="label-caps mb-1 text-ink-muted">Region</p>
                <ul>
                  {regions.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        onClick={() => jump(r.key)}
                        aria-pressed={region === r.key}
                        className={cn(
                          "flex w-full items-center gap-2 py-1 text-left font-mono text-[11px] uppercase tracking-[0.07em] outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
                          region === r.key ? "text-ink" : "text-ink-muted",
                        )}
                      >
                        <span aria-hidden className={cn("size-2 rotate-45 transition-colors", region === r.key ? "bg-marker" : "border border-rule-strong")} />
                        <span className="flex-1">{r.label}</span>
                        <span className="numerals text-[11px] text-ink-subtle">{r.plots}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => jump(null)}
                      className="mt-1 w-full border-t border-rule pt-1.5 text-left font-mono text-[10.5px] uppercase tracking-[0.07em] text-ink-subtle outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      All plots
                    </button>
                  </li>
                </ul>
              </FloatingPanel>
            ) : null}
            <FloatingPanel className="flex flex-col p-0.5">
              <Button size="icon-sm" variant="ghost" onClick={() => mapObj?.zoomIn()} aria-label="Zoom in">
                <Plus />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => mapObj?.zoomOut()} aria-label="Zoom out">
                <Minus />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={() => jump(region)} aria-label="Frame the plots again">
                <Crosshair />
              </Button>
            </FloatingPanel>
          </div>
        ) : (
          <div className="absolute inset-x-0 top-2 z-10 flex items-center gap-1.5 overflow-x-auto px-2 pb-1 scrollbar-thin">
            <Segmented
              label="Background"
              value={basemap}
              onChange={setBasemap}
              className="shrink-0 shadow-pop"
              options={[
                { value: "map", label: "Map" },
                { value: "satellite", label: "Sat." },
              ]}
            />
            {regions.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => jump(r.key)}
                aria-pressed={region === r.key}
                className={cn(
                  "panel-float inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 font-mono text-[10.5px] uppercase tracking-[0.07em] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  region === r.key ? "text-ink" : "text-ink-muted",
                )}
              >
                <span aria-hidden className={cn("size-1.5 rotate-45", region === r.key ? "bg-marker" : "border border-rule-strong")} />
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Status line: coordinates · zoom, and the scale ─────────────── */}
        {desktop ? (
          <StatusLine
            map={mapObj}
            className="absolute bottom-[120px] left-4 z-10 transition-[right] duration-[var(--dur-slow)] ease-[var(--ease-survey)]"
            style={{ right: selected ? INSPECTOR_W + 28 : 16 }}
          />
        ) : null}

        {/* ── Desktop: the time ruler ───────────────────────────────────── */}
        {desktop ? (
          <FloatingPanel
            className="absolute bottom-4 left-4 z-10 px-4 pb-2.5 pt-5 transition-[right] duration-[var(--dur-slow)] ease-[var(--ease-survey)]"
            style={{ right: selected ? INSPECTOR_W + 28 : 16 }}
          >
            {ruler}
          </FloatingPanel>
        ) : (
          /* ── Phone: ruler + ledger as a bottom sheet with a 96 px peek ─── */
          <FloatingPanel className={cn("absolute inset-x-0 bottom-0 z-10 rounded-none border-x-0 border-b-0 transition-transform duration-[var(--dur-slow)] ease-[var(--ease-survey)]", selected && "translate-y-full")}>
            <div className="px-3 pt-3">{ruler}</div>
            {d ? <LedgerPeek d={d} open={sheetOpen} onToggle={() => setSheetOpen((o) => !o)} /> : <Skeleton className="m-4 h-14" />}
            <div className={cn("overflow-y-auto overscroll-contain px-4 transition-[max-height] duration-[var(--dur-slow)] ease-[var(--ease-survey)] scrollbar-thin", sheetOpen ? "max-h-[52dvh] pb-4" : "max-h-0")}>
              {sheetOpen && d ? (
                <LedgerPanel
                  bare
                  d={d}
                  title={title}
                  areaHa={areaHa}
                  countries={countries}
                  hidden={hidden}
                  onToggle={(v) => setHidden((h) => (h.includes(v) ? h.filter((x) => x !== v) : [...h, v]))}
                  onNote={(i) => {
                    const ok = onNote(i);
                    if (ok) setSheetOpen(false);
                    return ok;
                  }}
                />
              ) : null}
            </div>
          </FloatingPanel>
        )}

        {/* ── Inspector ─────────────────────────────────────────────────── */}
        <AnimatePresence>
          {selected ? (
            <motion.aside
              key="inspector"
              aria-label="Plot inspector"
              initial={reduce ? { opacity: 0 } : desktop ? { x: INSPECTOR_W + 40 } : { y: "100%" }}
              animate={reduce ? { opacity: 1 } : desktop ? { x: 0 } : { y: 0 }}
              exit={reduce ? { opacity: 0 } : desktop ? { x: INSPECTOR_W + 40 } : { y: "100%" }}
              transition={reduce ? { duration: 0.15 } : SPRING_DRAWER}
              className={cn(
                "absolute z-20 border border-ink/60 bg-sheet shadow-pop",
                desktop ? "bottom-3 right-3 top-3" : "inset-x-0 bottom-0 h-[64%] border-x-0 border-b-0",
              )}
              style={desktop ? { width: INSPECTOR_W } : undefined}
            >
              {!desktop ? <div aria-hidden className="mx-auto mt-2 h-1 w-10 bg-rule-strong" /> : null}
              <PlotInspector
                plotId={selected}
                year={year}
                position={selIndex >= 0 ? { index: selIndex, total: order.length } : undefined}
                onClose={() => select(null)}
                onStep={step}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {empty ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <FloatingPanel className="max-w-md">
              <EmptyState
                title="No plots surveyed yet"
                body="Plots appear here once your suppliers share them. Send an upload link from a supplier’s page."
                action={
                  <Button asChild variant="primary">
                    <Link href="/app/suppliers">Open suppliers</Link>
                  </Button>
                }
              />
            </FloatingPanel>
          </div>
        ) : null}
        {mapQ.isError ? (
          <div role="alert" className="panel-float absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-sm px-3 py-2 text-[14px] text-ink">
            Plot shapes couldn’t be loaded.{" "}
            <button className="underline underline-offset-4" onClick={() => mapQ.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
