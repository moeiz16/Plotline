"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE_SURVEY } from "./tokens";

/**
 * A number that ticks up to its value when it first comes into view (and re-ticks
 * from the previous value when it changes). Renders mono tabular numerals so the width
 * does not jump. Reduced motion: renders the final value immediately.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-GB"),
  duration = DUR.slow * 2,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    if (!inView) return;
    const controls = animate(from.current, value, {
      duration,
      ease: EASE_SURVEY,
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, duration]);

  return (
    <span ref={ref} className={className ?? "numerals"}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
