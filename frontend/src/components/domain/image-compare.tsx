"use client";

import { ChevronsLeftRight, ImageOff } from "lucide-react";
import { useRef, useState } from "react";
import { Chip, Segmented } from "@/components/ui/display";
import { fileUrl } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function Img({ src, alt, className, pixel }: { src: string; alt: string; className?: string; pixel?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 bg-surface-2 p-4 text-center text-xs text-muted", className)}>
        <ImageOff className="size-5" aria-hidden />
        Image not available yet
      </div>
    );
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      className={cn("select-none object-cover", pixel && "[image-rendering:pixelated]", className)}
    />
  );
}

function Overlay({ src, show, alt }: { src: string; show: boolean; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!show || failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-70 [image-rendering:pixelated]"
    />
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("absolute top-2 rounded-sm bg-[rgb(20_19_17/0.72)] px-1.5 py-0.5 text-[11px] font-medium text-white", className)}>{children}</span>;
}

/** Before (2020) / after (latest) imagery with a draggable divider or side by side, plus forest and loss overlays. */
export function ImageCompare({ plotId, version }: { plotId: string; version?: string }) {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  const src = (k: string) => fileUrl(`/plots/${plotId}/imagery/${k}.png${v}`);
  const [mode, setMode] = useState<"slider" | "side">("slider");
  const [pos, setPos] = useState(50);
  const [forest, setForest] = useState(false);
  const [loss, setLoss] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Map layers">
          <Chip active={forest} onClick={() => setForest((x) => !x)} icon={<span className="size-2.5 rounded-sm bg-[#3f9a63]" aria-hidden />}>
            Forest in 2020
          </Chip>
          <Chip active={loss} onClick={() => setLoss((x) => !x)} icon={<span className="size-2.5 rounded-sm bg-[#d24b3a]" aria-hidden />}>
            Forest loss since 2021
          </Chip>
        </div>
        <Segmented
          label="Comparison view"
          value={mode}
          onChange={setMode}
          options={[
            { value: "slider", label: "Slider" },
            { value: "side", label: "Side by side" },
          ]}
        />
      </div>

      {mode === "slider" ? (
        <>
          <div
            ref={box}
            className="relative mx-auto aspect-square w-full max-w-[440px] touch-none overflow-hidden rounded-md border border-border bg-surface-2"
            onPointerDown={(e) => {
              dragging.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              fromPointer(e.clientX);
            }}
            onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
          >
            <Img src={src("current")} alt="Latest satellite image of the plot" className="absolute inset-0 size-full" />
            <Overlay src={src("forest")} show={forest} alt="" />
            <Overlay src={src("loss")} show={loss} alt="" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <Img src={src("baseline")} alt="Satellite image of the plot in 2020" className="absolute inset-0 size-full" />
              <Overlay src={src("forest")} show={forest} alt="" />
            </div>
            <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" style={{ left: `${pos}%` }}>
              <span className="absolute left-1/2 top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-[rgb(20_19_17/0.6)] text-[11px] text-white">
                <ChevronsLeftRight className="size-4" aria-hidden />
              </span>
            </div>
            <Tag className="left-2">2020</Tag>
            <Tag className="right-2">Latest</Tag>
          </div>
          <label className="mx-auto mt-3 flex max-w-[440px] items-center gap-3 text-xs text-muted">
            <span className="shrink-0">2020</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(pos)}
              onChange={(e) => setPos(Number(e.target.value))}
              className="w-full accent-[var(--brand)]"
              aria-label="Move the divider between the 2020 image and the latest image"
            />
            <span className="shrink-0">Latest</span>
          </label>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(["baseline", "current"] as const).map((k) => (
            <figure key={k} className="min-w-0">
              <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2">
                <Img src={src(k)} alt={k === "baseline" ? "Satellite image of the plot in 2020" : "Latest satellite image of the plot"} className="absolute inset-0 size-full" />
                <Overlay src={src("forest")} show={forest} alt="" />
                {k === "current" ? <Overlay src={src("loss")} show={loss} alt="" /> : null}
              </div>
              <figcaption className="mt-1.5 text-center text-xs text-muted">{k === "baseline" ? "2020 (cut-off year)" : "Latest image"}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
