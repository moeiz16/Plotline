"use client";

import { motion, useReducedMotion } from "motion/react";
import type { SVGProps } from "react";
import { DUR, EASE_SURVEY } from "./tokens";

type PathProps = Omit<SVGProps<SVGPathElement>, "ref" | "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd">;

/**
 * A boundary that draws itself (stroke reveal). Use for plot outlines, contour lines,
 * the logo on the landing page and the cut-off line on the time ruler.
 * `inView` waits until the path scrolls into view (landing story).
 */
export function DrawPath({
  d,
  delay = 0,
  duration = DUR.draw,
  inView = false,
  ...props
}: PathProps & { d: string; delay?: number; duration?: number; inView?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce) return <path d={d} {...props} />;
  const target = { pathLength: 1, opacity: 1 };
  return (
    <motion.path
      d={d}
      initial={{ pathLength: 0, opacity: 0 }}
      {...(inView ? { whileInView: target, viewport: { once: true, amount: 0.6 } } : { animate: target })}
      transition={{ pathLength: { duration, delay, ease: EASE_SURVEY }, opacity: { duration: 0.01, delay } }}
      {...(props as object)}
    />
  );
}

/**
 * A surveyed parcel: the outline draws vertex to vertex, then each corner peg drops in.
 * `points` are in the SVG's own coordinate space.
 */
export function SurveyOutline({
  points,
  stroke = "currentColor",
  fill = "none",
  strokeWidth = 1.5,
  delay = 0,
  duration = DUR.draw,
  pegs = true,
  inView = false,
  className,
}: {
  points: [number, number][];
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  pegs?: boolean;
  inView?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const d = `M${points.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
  const step = duration / Math.max(points.length, 1);
  return (
    <g className={className}>
      {fill !== "none" ? (
        <motion.path
          d={d}
          fill={fill}
          stroke="none"
          initial={reduce ? false : { opacity: 0 }}
          {...(inView ? { whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.6 } } : { animate: { opacity: 1 } })}
          transition={{ duration: DUR.slow, delay: delay + duration * 0.85 }}
        />
      ) : null}
      <DrawPath d={d} stroke={stroke} strokeWidth={strokeWidth} fill="none" strokeLinejoin="round" delay={delay} duration={duration} inView={inView} />
      {pegs
        ? points.map(([x, y], i) => (
            <motion.circle
              key={i}
              cx={x}
              cy={y}
              r={strokeWidth * 1.6}
              fill="var(--sheet)"
              stroke={stroke}
              strokeWidth={strokeWidth}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              {...(inView ? { whileInView: { scale: 1, opacity: 1 }, viewport: { once: true, amount: 0.6 } } : { animate: { scale: 1, opacity: 1 } })}
              transition={{ duration: DUR.fast, delay: delay + step * i }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            />
          ))
        : null}
    </g>
  );
}
