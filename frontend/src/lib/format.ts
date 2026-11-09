import type { Commodity } from "./api/types";

const LOCALE = "en-GB";

export const COMMODITY_LABEL: Record<Commodity, string> = {
  cocoa: "Cocoa",
  coffee: "Coffee",
  soy: "Soy",
  oil_palm: "Palm oil",
  cattle: "Cattle",
  rubber: "Rubber",
  wood: "Wood",
};

export const COMMODITIES = Object.keys(COMMODITY_LABEL) as Commodity[];

export function commodityLabel(c?: string | null) {
  if (!c) return "";
  return COMMODITY_LABEL[c as Commodity] ?? c.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());
}

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  compliance_manager: "Compliance manager",
  sourcing: "Sourcing",
  reviewer: "Reviewer",
  supplier: "Supplier",
  auditor: "Auditor",
};

export function roleLabel(r?: string | null) {
  if (!r) return "";
  return ROLE_LABEL[r] ?? r.replace(/_/g, " ");
}

export const SUPPLIER_KIND_LABEL: Record<string, string> = {
  cooperative: "Cooperative",
  exporter: "Exporter",
  farm: "Farm",
  trader: "Trader",
};

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code?: string | null) {
  if (!code) return "";
  try {
    regionNames ??= new Intl.DisplayNames([LOCALE], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Regional-indicator flag emoji for an ISO country code (decorative; always shown next to the name). */
export function flag(code?: string | null) {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65);
}

export function num(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

export function ha(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined) return "–";
  return `${num(n, digits)} ha`;
}

export function kg(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  return `${num(n)} kg`;
}

export function pct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined) return "–";
  return `${num(n, digits)}%`;
}

/** 0..1 share → "42%". */
export function share(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  return pct(n * 100);
}

function toDate(v: string | number | Date) {
  return v instanceof Date ? v : new Date(v);
}

export function date(v?: string | null) {
  if (!v) return "–";
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function dateLong(v?: string | null) {
  if (!v) return "–";
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function dateTime(v?: string | null) {
  if (!v) return "–";
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function relative(v?: string | null) {
  if (!v) return "–";
  const d = toDate(v);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const min = 60_000,
    hr = 60 * min,
    day = 24 * hr;
  if (abs < min) return "just now";
  if (abs < hr) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hr), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return date(v);
}

/** Whole days from today (local) to an ISO date (yyyy-mm-dd). */
export function daysUntil(isoDate: string, now = new Date()) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const target = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${num(n)} ${n === 1 ? one : many}`;
}
