/* Small formatting helpers for the ledger, manifest, statement and route pages. */
import { date, daysUntil } from "@/lib/format";

/** "13 OCT 2026": the date as it is stamped in mono caps on a manifest or a log. */
export function stampDate(v?: string | null) {
  if (!v) return "–";
  return date(v).toUpperCase().replace("SEPT", "SEP");
}

/** "13 OCT · 22:23": a log time, 24 h, no seconds, no time zone noise. */
export function logTime(v?: string | null) {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "–";
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(d).toUpperCase().replace("SEPT", "SEP");
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${day} · ${time}`;
}

/** "D–24" for a due date in the future, "D+3" once it has passed. */
export function dMinus(isoDate: string) {
  const n = daysUntil(isoDate);
  return n >= 0 ? `D–${n}` : `D+${Math.abs(n)}`;
}

/** Line numbers in the margin: 01, 02 … 99, 100. */
export function lineNo(i: number) {
  return String(i + 1).padStart(2, "0");
}

/** Plain "how to clear it" notes for each shipment check that can block a statement. */
export const CHECK_REMEDY: Record<string, { how: string; href?: (shipmentId: string) => string; cta?: string }> = {
  allocations_present: { how: "Record the plots this product came from on a new shipment entry." },
  plots_assessed: { how: "Wait for the forest check to finish on the listed plots, or run it again from the plot record." },
  no_non_compliant: {
    how: "Take the volume from the cleared plots off this shipment and source a replacement from plots confirmed compliant.",
  },
  reviews_complete: { how: "A reviewer confirms or overturns the plots that wait for a decision.", href: () => "/app/reviews", cta: "Open reviews" },
  quantities_match: { how: "Allocate the shipment so the kilograms per plot add up to the total quantity." },
  mass_balance: { how: "Ask the supplier to map the other land this volume came from, or lower the allocation to what the plot can grow." },
  mixing: { how: "Keep product from unverified plots out of this shipment, or verify those plots first." },
  geometry_valid: { how: "Send the supplier a fresh upload link and ask them to redraw the plot boundary." },
  high_risk_review: { how: "Have a reviewer confirm every plot from a high-risk country.", href: () => "/app/reviews", cta: "Open reviews" },
};

/** First letter of the Annex-style alphabetical index. */
export function initialOf(name: string) {
  const c = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}
