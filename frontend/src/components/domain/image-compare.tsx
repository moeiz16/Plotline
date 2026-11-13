"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_SURVEY } from "@/components/motion";
import { Chip, Segmented } from "@/components/ui/display";
import { fileUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function Img({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={cn("flex items-center justify-center bg-sheet-2 p-4 text-center text-[13px] italic text-ink-muted hatch-faint", className)}>
        Imagery not available yet
      </div>
    );
  return <img src={src} alt={alt} draggable={false} onError={() => setFailed(true)} className={cn("select-none object-cover [image-rendering:pixelated]", className)} />;
}

function Overlay({ src, show }: { src: string; show: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn(
        "pointer-events-none absolute inset-0 size-full select-none object-cover [image-rendering:pixelated] transition-opacity duration-[var(--dur)]",
        show ? "opacity-75" : "opacity-0",
      )}
    />
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("pointer-events-none absolute top-2 bg-[rgb(11_16_20/0.74)] px-1.5 py-[3px] font-mono text-[10px] font-medium uppercase leading-none tracking-[0.09em] text-[#ece7db]", className)}>
      {children}
    </span>
  );
}

/**
 * Before (31 Dec 2020) / after (latest) imagery with a swipe divider. On open the divider sweeps
 * from the 2020 image across to the latest one, so the change reads as time passing. The divider
 * is a real slider (arrow keys, Home/End). `stage="baseline"` parks it on 2020 (time ruler ≤ 2020).
 */
export function ImageCompare({
  plotId,
  version,
  compact = false,
  stage = "compare",
  className,
}: {
  plotId: string;
  version?: string;
  compact?: boolean;
  stage?: "baseline" | "compare";
  className?: string;
}) {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  const src = (k: string) => fileUrl(`/plots/${plotId}/imagery/${k}.png${v}`);
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"swipe" | "side">("swipe");
  const [pos, setPos] = useState(100);
  const [forest, setForest] = useState(false);
  const [loss, setLoss] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const posRef = useRef(pos);
  posRef.current = pos;

  /* the opening sweep (and the ruler parking the divider on 2020) */
  useEffect(() => {
    const target = stage === "baseline" ? 100 : 50;
    if (reduce) {
      setPos(target);
      return;
    }
    const from = stage === "baseline" ? posRef.current : 100;
    const c = animate(from, target, { duration: stage === "baseline" ? 0.5 : 1.3, delay: stage === "baseline" ? 0 : 0.25, ease: EASE_SURVEY, onUpdate: setPos });
    return () => c.stop();
  }, [plotId, stage, reduce]);

  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const showLoss = loss && stage !== "baseline";

  return (
    <div className={className}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Layers on the imagery">
          <Chip active={forest} onClick={() => setForest((x) => !x)} icon={<span className="size-2.5 border border-compliant bg-compliant/50" aria-hidden />} className={compact ? "h-7 px-2" : undefined}>
            Forest 2020
          </Chip>
          <Chip active={loss} onClick={() => setLoss((x) => !x)} icon={<span className="size-2.5 border border-noncompliant hatch-noncompliant" aria-hidden />} className={compact ? "h-7 px-2" : undefined}>
            Loss since 2021
          </Chip>
        </div>
        {!compact ? (
          <Segmented
            label="Comparison view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "swipe", label: "Swipe" },
              { value: "side", label: "Side by side" },
            ]}
          />
        ) : null}
      </div>

      {mode === "swipe" || compact ? (
        <div
          ref={box}
          className={cn("relative aspect-square w-full touch-none overflow-hidden border border-ink/60 bg-sheet-2", !compact && "mx-auto max-w-[520px]")}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            fromPointer(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <Img src={src("current")} alt="Latest satellite image of the plot" className="absolute inset-0 size-full" />
          <Overlay src={src("forest")} show={forest} />
          <Overlay src={src("loss")} show={showLoss} />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            <Img src={src("baseline")} alt="Satellite image of the plot at the end of 2020" className="absolute inset-0 size-full" />
            <Overlay src={src("forest")} show={forest} />
          </div>
          <Tag className="left-2">31 Dec 2020</Tag>
          <Tag className={cn("right-2 transition-opacity duration-[var(--dur)]", pos > 86 && "opacity-0")}>Latest</Tag>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Divider between the 2020 image and the latest image"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            aria-valuetext={`${Math.round(pos)}% of the view shows 2020`}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 20 : 5;
              const map: Record<string, number> = { ArrowLeft: pos - step, ArrowRight: pos + step, Home: 0, End: 100 };
              if (e.key in map) {
                e.preventDefault();
                e.stopPropagation();
                setPos(Math.max(0, Math.min(100, map[e.key])));
              }
            }}
            className="group absolute inset-y-0 w-6 -translate-x-1/2 cursor-ew-resize outline-none"
            style={{ left: `${pos}%` }}
          >
            <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-[#ece7db] shadow-[0_0_0_1px_rgb(11_16_20/0.35)]" />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 flex h-7 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-[#0b1014]/60 bg-[#ece7db] font-mono text-[9px] leading-none text-[#1e2a33] transition-transform duration-[var(--dur-fast)] group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-ring"
            >
              ◂▸
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(["baseline", "current"] as const).map((k) => (
            <figure key={k} className="min-w-0">
              <div className="relative aspect-square overflow-hidden border border-ink/60 bg-sheet-2">
                <Img src={src(k)} alt={k === "baseline" ? "Satellite image of the plot at the end of 2020" : "Latest satellite image of the plot"} className="absolute inset-0 size-full" />
                <Overlay src={src("forest")} show={forest} />
                {k === "current" ? <Overlay src={src("loss")} show={loss} /> : null}
              </div>
              <figcaption className="label-caps mt-1.5 text-center text-ink-muted">{k === "baseline" ? "31 Dec 2020 · cut-off" : "Latest image"}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
