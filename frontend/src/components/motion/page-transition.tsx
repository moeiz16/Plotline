"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { tabIndexFor } from "@/components/shell/nav";
import { DUR, EASE_OUT } from "./tokens";

/**
 * Page transition that slides along the masthead tabs: moving to a tab on the right
 * slides the new sheet in from the right, and vice versa. Within the same tab
 * (list → detail) the sheet rises slightly. Opacity only under reduced motion.
 * Used once, in app/app/layout.tsx. Pages never add their own route transition.
 */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const prev = useRef<{ path: string; tab: number } | null>(null);
  const tab = tabIndexFor(pathname);
  let dx = 0;
  let dy = 0;
  if (prev.current && prev.current.path !== pathname) {
    if (tab !== prev.current.tab) dx = tab > prev.current.tab ? 28 : -28;
    else dy = 8;
  }
  if (!prev.current || prev.current.path !== pathname) prev.current = { path: pathname, tab };

  return (
    <motion.div
      key={pathname}
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: dx, y: dy }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: reduce ? DUR.fast : DUR.base, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
