"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * True once the page has hydrated and the reader has not asked for reduced motion.
 * Scroll-linked styles are attached only then, so the server markup and the first client
 * render always match (no style on either), and reduced motion keeps the static layout.
 */
export function useStoryMotion() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !reduce;
}
