import {
  ArrowRight,
  ClipboardCheck,
  FileCheck,
  Handshake,
  Map as MapIconLucide,
  Satellite,
  Scale,
  ShieldCheck,
  Ship,
  Sprout,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { VERDICT_META, VERDICT_ORDER } from "@/components/domain/status";
import { Badge } from "@/components/ui/display";
import { DeadlineCountdown } from "@/components/marketing/countdown";
import { ParcelArt } from "@/components/marketing/parcel-art";

export const metadata: Metadata = {
  title: { absolute: "Plotline · Deforestation-free, proven plot by plot" },
};

const STEPS = [
  {
    icon: MapIconLucide,
    title: "Map your plots",
    body: "Suppliers and cooperatives add their farms from a phone: tap a point, trace a boundary or upload a file. Plotline checks the shape against EUDR geolocation rules before it is saved.",
  },
  {
    icon: Satellite,
    title: "Check against satellite forest maps",
    body: "Each plot is compared with the official 2020 forest baseline and yearly forest-loss data. A satellite land-change signal gives a second opinion, and any disagreement goes to a reviewer.",
  },
  {
    icon: Ship,
    title: "Trace every shipment",
    body: "Link each shipment to the plots it came from. Plotline flags volumes a plot could not have produced and any mixing of verified and unverified product.",
  },
  {
    icon: FileCheck,
    title: "File the due diligence statement",
    body: "Prepare the statement in the structure the EU information system expects, with a printable evidence pack and a full submission log kept for five years.",
  },
];

const ROLES = [
  { icon: ShieldCheck, title: "Compliance managers", body: "One view of readiness by supplier, commodity and country, and the days left to the deadline." },
  { icon: Handshake, title: "Sourcing teams", body: "Request plot data from suppliers, follow up automatically and see who is ready to ship." },
  { icon: ClipboardCheck, title: "Reviewers", body: "A focused queue of plots that need a decision, with imagery, forest data and plain-language reasons." },
  { icon: Sprout, title: "Suppliers and cooperatives", body: "A simple, mobile-friendly link to add plots. No account, no software to install." },
  { icon: Scale, title: "Auditors", body: "A tamper-evident activity log and reproducible checks: same inputs and data versions, same verdict." },
];

const SOURCES = [
  {
    name: "EU JRC Global Forest Cover 2020",
    org: "European Commission, Joint Research Centre",
    body: "The EU’s reference map of where forest stood on 31 December 2020, the regulation’s cut-off date.",
  },
  {
    name: "Global Forest Change",
    org: "Hansen et al., University of Maryland",
    body: "Year-by-year tree-cover loss used to measure any clearing on a plot since 2021.",
  },
  {
    name: "Copernicus Sentinel-2",
    org: "European Union, Copernicus programme",
    body: "Recent satellite imagery for before-and-after views and the land-change signal.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-bg/95">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Plotline home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#who" className="hover:text-fg">Who it’s for</a>
            <a href="#data" className="hover:text-fg">Data sources</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/signin" className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg sm:inline-flex">
              Sign in
            </Link>
            <Link href="/signin" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3.5 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
              Explore the demo
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr]">
          <div className="min-w-0">
            <Badge tone="brand" icon={<ShieldCheck aria-hidden />}>
              Aligned with EUDR (Regulation (EU) 2023/1115)
            </Badge>
            <h1 className="mt-5 text-[34px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-5xl">
              Deforestation-free, proven plot by plot.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted">
              Plotline helps EU importers and their suppliers show that every shipment of cocoa, coffee, soy, palm oil, cattle, rubber or wood comes from
              land that was not deforested after 2020, and prepares the due diligence statement the EU requires.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signin" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-[15px] font-medium text-brand-contrast hover:bg-brand-hover">
                Explore the demo workspace <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong bg-surface px-5 text-[15px] font-medium hover:bg-surface-2">
                Create an account
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-subtle">The demo uses synthetic suppliers and plots. No sign-up needed.</p>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3 text-[13px]">
              <span className="font-medium">Supplier plots · Ashanti region</span>
              <span className="text-muted">8 plots</span>
            </div>
            <ParcelArt className="w-full" />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              {VERDICT_ORDER.map((v) => (
                <li key={v} className="inline-flex items-center gap-1.5">
                  <span className="[&_svg]:size-3.5" style={{ color: `var(--${v === "needs_review" ? "review" : v === "non_compliant" ? "noncompliant" : v})` }}>
                    {VERDICT_META[v].icon}
                  </span>
                  {VERDICT_META[v].label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Deadline */}
        <section aria-labelledby="deadline" className="border-y border-border bg-surface-2/60">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <h2 id="deadline" className="text-2xl font-semibold tracking-[-0.015em]">The deadline is close</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                From the application date, products in scope can only be placed on or exported from the EU market with a due diligence statement showing
                they are deforestation-free, legally produced and traceable to the plots where they were grown.
              </p>
            </div>
            <DeadlineCountdown />
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <p className="text-sm font-medium text-brand-fg">How it works</p>
          <h2 id="how-title" className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight tracking-[-0.015em]">
            Four steps from a farm boundary to a filed statement
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-brand-soft text-brand-fg">
                    <s.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="text-sm font-medium tabular text-subtle">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Verdicts */}
        <section aria-labelledby="verdicts" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-brand-fg">Clear verdicts, with reasons</p>
              <h2 id="verdicts" className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.015em]">
                Official forest maps decide. Satellites double-check.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Every verdict rests on the official forest datasets: where forest stood at the end of 2020, and what was lost since. Plotline also compares
                recent satellite images of the plot with how it looked in 2020. When the two disagree, the plot goes to a person to review, never to an
                automatic decision.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Each check records the exact data versions it used, so running it again on the same inputs gives the same answer.
              </p>
            </div>
            <ul className="grid gap-3">
              {VERDICT_ORDER.map((v) => (
                <li key={v} className="flex items-start gap-3 rounded-lg border border-border p-4">
                  <Badge tone={VERDICT_META[v].tone} icon={VERDICT_META[v].icon}>
                    {VERDICT_META[v].label}
                  </Badge>
                  <p className="text-sm text-muted">{VERDICT_META[v].description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Who */}
        <section id="who" aria-labelledby="who-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <p className="text-sm font-medium text-brand-fg">Who it’s for</p>
          <h2 id="who-title" className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight tracking-[-0.015em]">
            One shared record for everyone in the chain
          </h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((r) => (
              <li key={r.title} className="rounded-lg border border-border bg-surface p-5">
                <r.icon className="size-5 text-brand" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{r.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>
              </li>
            ))}
            <li className="flex flex-col justify-between rounded-lg border border-dashed border-border-strong p-5">
              <div>
                <Users className="size-5 text-muted" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">Your whole team</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">Roles and permissions keep each person to the work they own.</p>
              </div>
              <Link href="/signin" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
                See it in the demo <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          </ul>
        </section>

        {/* Data */}
        <section id="data" aria-labelledby="data-title" className="scroll-mt-20 border-t border-border bg-surface-2/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="text-sm font-medium text-brand-fg">Data sources</p>
            <h2 id="data-title" className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight tracking-[-0.015em]">
              Built on public, citable Earth-observation data
            </h2>
            <ul className="mt-10 grid gap-4 lg:grid-cols-3">
              {SOURCES.map((s) => (
                <li key={s.name} className="rounded-lg border border-border bg-surface p-5">
                  <h3 className="text-[15px] font-semibold">{s.name}</h3>
                  <p className="mt-0.5 text-[13px] text-subtle">{s.org}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-subtle">
              Country risk tiers follow the European Commission’s country benchmarking under Article 29. Background maps © OpenStreetMap contributors via
              OpenFreeMap; satellite basemap © Esri and partners.
            </p>
          </div>
        </section>

        {/* Trust + CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-8 rounded-xl border border-border bg-surface p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.015em]">Designed to support your due diligence</h2>
              <ul className="mt-5 grid gap-2.5 text-sm text-muted">
                <li>Evidence and statements kept for five years, as the regulation requires.</li>
                <li>Farmer data kept to a minimum: plots are identified by reference, not by name.</li>
                <li>Every sensitive action recorded in a tamper-evident activity log.</li>
                <li>Plotline supports your decisions; the operator placing products on the market remains responsible for them.</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/signin" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-[15px] font-medium text-brand-contrast hover:bg-brand-hover">
                Explore the demo workspace <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/signup" className="inline-flex h-11 items-center justify-center rounded-md border border-border-strong px-5 text-[15px] font-medium hover:bg-surface-2">
                Create an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Deforestation-free, proven plot by plot. Aligned with EUDR (Regulation (EU) 2023/1115). Plotline is not a certification scheme and does
              not certify products.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted">
            <a href="#how" className="hover:text-fg">How it works</a>
            <Link href="/signin" className="hover:text-fg">Sign in</Link>
            <a href="#who" className="hover:text-fg">Who it’s for</a>
            <Link href="/signup" className="hover:text-fg">Create an account</Link>
            <a href="#data" className="hover:text-fg">Data sources</a>
          </nav>
        </div>
        <p className="border-t border-border px-4 py-4 text-center text-xs text-subtle">© 2026 Plotline. A portfolio project. Demo data is synthetic.</p>
      </footer>
    </div>
  );
}
