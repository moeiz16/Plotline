"use client";

import { Search, X } from "lucide-react";
import { Chip } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/input";
import type { Commodity, PlotFilters, Verdict } from "@/lib/api/types";
import { COMMODITIES, commodityLabel, countryName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VERDICT_META, VERDICT_ORDER, VerdictDot } from "./status";

export function PlotFilterBar({
  value,
  onChange,
  countries,
  className,
  showSearch = true,
}: {
  value: PlotFilters;
  onChange: (f: PlotFilters) => void;
  countries: string[];
  className?: string;
  showSearch?: boolean;
}) {
  const active = !!(value.verdict || value.commodity || value.country || value.q);
  return (
    <div className={cn("grid gap-2.5", className)}>
      {showSearch ? (
        <Input
          leading={<Search />}
          placeholder="Search plot or supplier"
          aria-label="Search plots"
          value={value.q ?? ""}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
        />
      ) : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by verdict">
        <Chip active={!value.verdict} onClick={() => onChange({ ...value, verdict: "" })}>
          All
        </Chip>
        {VERDICT_ORDER.map((v: Verdict) => (
          <Chip key={v} active={value.verdict === v} onClick={() => onChange({ ...value, verdict: value.verdict === v ? "" : v })} icon={<VerdictDot verdict={v} className="size-2" />}>
            {VERDICT_META[v].label}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Filter by commodity" value={value.commodity ?? ""} onChange={(e) => onChange({ ...value, commodity: e.target.value as Commodity | "" })}>
          <option value="">All commodities</option>
          {COMMODITIES.map((c) => (
            <option key={c} value={c}>
              {commodityLabel(c)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by country" value={value.country ?? ""} onChange={(e) => onChange({ ...value, country: e.target.value })}>
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </Select>
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => onChange({ verdict: "", commodity: "", country: "", q: "" })}
          className="inline-flex items-center gap-1 justify-self-start rounded-sm text-[13px] font-medium text-brand-fg hover:underline"
        >
          <X className="size-3.5" aria-hidden /> Clear filters
        </button>
      ) : null}
    </div>
  );
}
