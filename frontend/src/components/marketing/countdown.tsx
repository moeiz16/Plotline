"use client";

import { useEffect, useState } from "react";
import { daysUntil, dateLong } from "@/lib/format";

const DEADLINES = [
  { date: "2026-12-30", who: "Medium and large operators and traders" },
  { date: "2027-06-30", who: "Micro and small enterprises" },
];

export function DeadlineCountdown() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60 * 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      {DEADLINES.map((d) => {
        const days = now ? Math.max(0, daysUntil(d.date, now)) : null;
        return (
          <div key={d.date} className="bg-surface p-5">
            <p className="text-[13px] text-muted">{d.who}</p>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular tracking-[-0.02em]" aria-live="polite">
                {days === null ? "··" : days}
              </span>
              <span className="text-sm text-muted">days to go</span>
            </p>
            <p className="mt-1 text-sm">Obligations apply from {dateLong(d.date)}</p>
          </div>
        );
      })}
    </div>
  );
}
