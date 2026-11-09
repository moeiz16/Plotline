import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { ParcelArt } from "@/components/marketing/parcel-art";

const POINTS = [
  "Every plot checked against official 2020 forest maps",
  "A second, satellite-based opinion on recent land change",
  "Shipments traced back to the plots they came from",
  "Due diligence statements ready for the EU information system",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-w-0 flex-col px-5 py-6 sm:px-10">
        <Link href="/" className="self-start rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Plotline home">
          <Logo />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <p className="text-center text-xs text-subtle">Aligned with EUDR (Regulation (EU) 2023/1115). Designed to support your due diligence.</p>
      </div>
      <aside className="relative hidden flex-col justify-between overflow-hidden border-l border-border bg-surface-2 p-10 lg:flex">
        <div>
          <p className="text-sm font-medium text-brand-fg">Deforestation-free, proven plot by plot</p>
          <h2 className="mt-3 max-w-md text-[28px] font-semibold leading-tight tracking-[-0.015em]">
            From the farm boundary to the due diligence statement, in one place.
          </h2>
        </div>
        <ParcelArt className="mx-auto my-8 w-full max-w-md" />
        <ul className="grid gap-2.5">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm text-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
