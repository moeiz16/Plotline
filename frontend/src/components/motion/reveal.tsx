"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_OUT } from "./tokens";

/**
 * Scroll reveal for story sections (landing, statement document). Rises 16 px and fades
 * in once when 30% visible. Reduced motion: visible at once.
 */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article" }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  if (reduce) return <M className={className}>{children}</M>;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: DUR.slow, ease: EASE_OUT, delay }}
    >
      {children}
    </M>
  );
}
