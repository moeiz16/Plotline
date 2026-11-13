import { redirect } from "next/navigation";

/** The map is the Atlas home now; keep old links (and ?plot=) working. */
export default async function MapRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) qs.append(k, x);
  const s = qs.toString();
  redirect(s ? `/app?${s}` : "/app");
}
