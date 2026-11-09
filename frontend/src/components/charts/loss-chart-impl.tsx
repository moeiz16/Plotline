"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { num } from "@/lib/format";

export interface LossDatum {
  year: string;
  ha: number;
}

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      <p className="font-medium">{label}</p>
      <p className="text-muted">
        <span className="font-semibold tabular text-fg">{num(payload[0].value, 2)} ha</span> of forest lost
      </p>
    </div>
  );
}

export default function LossChartImpl({ data }: { data: LossDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
        <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={{ fill: "var(--fg-muted)", fontSize: 12 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          allowDecimals
          width={44}
          tick={{ fill: "var(--fg-muted)", fontSize: 12 }}
          tickFormatter={(v: number) => num(v, 1)}
        />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<TooltipBox />} />
        <Bar dataKey="ha" name="Forest lost (ha)" fill="var(--noncompliant)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
