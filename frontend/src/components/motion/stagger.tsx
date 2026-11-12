"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_SURVEY, STAGGER } from "./tokens";

/** Each item is written onto the sheet left to right, like ink. */
const ink: Variants = {
  hidden: { opacity: 0, clipPath: "inset(0 100% 0 0)" },
  show: { opacity: 1, clipPath: "inset(0 0% 0 0)", transition: { duration: DUR.slow, ease: EASE_SURVEY } },
};
const fade: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: DUR.fast } } };

type ListTag = "ul" | "ol" | "div" | "tbody" | "dl";
type ItemTag = "li" | "div" | "tr" | "section";

/**
 * <StaggerList> + <StaggerItem>: rows ink in one after another (35 ms apart) on mount.
 * Use for ledgers, field notes, manifest lines. For long lists only the first ~15 rows stagger.
 * For plain CSS rows, <LedgerRow index={i}> does the same without JS.
 */
export function StaggerList({
  as = "ul",
  children,
  className,
  delay = 0,
  label,
}: {
  as?: ListTag;
  children: ReactNode;
  className?: string;
  delay?: number;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M
      className={className}
      aria-label={label}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : STAGGER, delayChildren: delay } } }}
    >
      {children}
    </M>
  );
}

export function StaggerItem({ as = "li", children, className }: { as?: ItemTag; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const M = motion[as];
  return (
    <M className={className} variants={reduce ? fade : ink}>
      {children}
    </M>
  );
}
