"use client";

import { Search, X } from "lucide-react";
import { Chip } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/input";
import type { Commodity, PlotFilters, Verdict } from "@/lib/api/types";
import { COMMODITIES, commodityLabel, countryName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VERDICT_META, VERDICT_ORDER, VerdictDot } from "./status";

/** The ledger's filter strip: search, verdict tags (glyph + label), commodity and country. One row on wide screens. */
export function PlotFilterBar({
  value,
  onChange,
  countries,
  className,
  showSearch = true,
  trailing,
}: {
  value: PlotFilters;
  onChange: (f: PlotFilters) => void;
  countries: string[];
  className?: string;
  showSearch?: boolean;
  trailing?: React.ReactNode;
}) {
  const active = !!(value.verdict || value.commodity || value.country || value.q);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {showSearch ? (
        <div className="w-full sm:w-56">
          <Input
            leading={<Search />}
            placeholder="Plot or supplier"
            aria-label="Search plots by reference or supplier"
            value={value.q ?? ""}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            className="h-8 text-[14px]"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by verdict">
        {VERDICT_ORDER.map((v: Verdict) => (
          <Chip key={v} active={value.verdict === v} onClick={() => onChange({ ...value, verdict: value.verdict === v ? "" : v })} icon={<VerdictDot verdict={v} size={9} />}>
            {VERDICT_META[v].label}
          </Chip>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Select aria-label="Filter by commodity" value={value.commodity ?? ""} onChange={(e) => onChange({ ...value, commodity: e.target.value as Commodity | "" })} className="h-8 text-[14px]" wrapperClassName="w-[9.5rem]">
          <option value="">Every commodity</option>
          {COMMODITIES.map((c) => (
            <option key={c} value={c}>
              {commodityLabel(c)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by country" value={value.country ?? ""} onChange={(e) => onChange({ ...value, country: e.target.value })} className="h-8 text-[14px]" wrapperClassName="w-[9.5rem]">
          <option value="">Every country</option>
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
          className="inline-flex h-8 items-center gap-1 rounded-sm px-1 font-mono text-[10.5px] uppercase tracking-[0.08em] text-marker-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" aria-hidden /> Clear
        </button>
      ) : null}
      {trailing ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}
