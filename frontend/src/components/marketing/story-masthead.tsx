"use client";

import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const SHEETS = [
  { href: "#survey", label: "Survey" },
  { href: "#procedure", label: "Procedure" },
  { href: "#legend", label: "Legend" },
  { href: "#deadline", label: "Deadline" },
];

/**
 * The landing masthead: a transparent title strip floating over the map sheet. Once the
 * reader leaves the opening scene it settles onto a blurred paper band, and a marker hairline
 * along its foot records how far through the sheet they have read.
 */
export function StoryMasthead() {
  const { scrollY, scrollYProgress } = useScroll();
  const [settled, setSettled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSettled(y > 48));
  const progress = useSpring(scrollYProgress, { stiffness: 260, damping: 40, restDelta: 0.001 });

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-[var(--dur)] ease-[var(--ease-out)]",
        settled ? "border-b border-panel-border bg-panel backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-8">
        <Link href="/" aria-label="Plotline, front sheet" className="shrink-0 rounded-sm">
          <Logo />
        </Link>
        <span className="hidden label-caps text-ink-subtle xl:inline">Field atlas for EUDR evidence</span>
        <nav aria-label="Sheet index" className="ml-auto hidden items-center gap-1 md:flex">
          {SHEETS.map((s, i) => (
            <a key={s.href} href={s.href} className="group flex items-baseline gap-1.5 rounded-sm px-2.5 py-1.5 label-caps text-ink-muted hover:text-ink">
              <span className="numerals text-[10px] text-ink-subtle group-hover:text-marker-ink">{String(i + 1).padStart(2, "0")}</span>
              {s.label}
            </a>
          ))}
        </nav>
        <Link
          href="/signin"
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-sm border border-ink/70 px-3 label-caps text-ink hover:bg-ink hover:text-paper md:ml-2"
        >
          Sign in
        </Link>
      </div>
      <motion.div aria-hidden className="absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-marker" style={{ scaleX: progress }} />
    </header>
  );
}
