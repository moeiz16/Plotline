import s from "./story.module.css";

const SYMBOLS: Record<string, React.ReactNode> = {
  port: (
    <>
      <circle cx="20" cy="9" r="3.5" />
      <path d="M20 12.5V33M13 17h14M8 25c1 6 6 9 12 9s11-3 12-9" />
    </>
  ),
  stake: (
    <>
      <path d="M10 36V6" />
      <path d="M10 6l14 5-14 5Z" fill="var(--marker)" stroke="var(--marker)" />
      <path d="M4 36h16" />
    </>
  ),
  trig: (
    <>
      <path d="M20 6 34 32H6Z" />
      <circle cx="20" cy="23" r="2.4" fill="currentColor" />
    </>
  ),
  north: (
    <>
      <circle cx="20" cy="20" r="14" />
      <path d="M20 8 25 24 20 21 15 24Z" fill="currentColor" />
      <path d="M20 2v4M20 34v4M2 20h4M34 20h4" />
    </>
  ),
};

const ROLES = [
  {
    sym: "port",
    role: "Importers and traders",
    does: "Place cocoa, coffee, soy, palm oil, cattle, rubber or wood on the EU market, and need every shipment traced to land that was not cleared after 2020.",
    opens: ["Atlas", "Shipments", "Statements"],
  },
  {
    sym: "stake",
    role: "Suppliers and cooperatives",
    does: "Share their farm plots from a phone through a simple link, and see what is still missing before the buyer asks twice.",
    opens: ["Upload link", "Their plots"],
  },
  {
    sym: "trig",
    role: "Reviewers",
    does: "Work through a short queue of plots that need a person: imagery, forest data and a plain reason side by side, then confirm or overturn.",
    opens: ["Reviews", "Plot record"],
  },
  {
    sym: "north",
    role: "Executives",
    does: "See readiness by supplier, country and commodity at a glance, and how many days remain before the obligations apply.",
    opens: ["Atlas", "Countries", "Activity log"],
  },
];

/** [6] Who it's for, set as a map legend: one symbol per kind of person who reads the atlas. */
export function Audience() {
  return (
    <section id="legend" aria-labelledby="legend-title" className="scroll-mt-14 bg-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <p className="label-caps text-ink-subtle">
              <span className="text-marker-ink">Sheet 03</span> · Legend
            </p>
            <h2 id="legend-title" className="mt-4 text-[40px] font-medium leading-[1.02] tracking-[-0.03em] sm:text-[60px]">
              Who reads the atlas
            </h2>
            <p className="mt-5 max-w-[38ch] text-[17px] italic leading-relaxed text-ink-muted">
              One shared record, read four ways. Each person sees the part of the map they are answerable for, and nothing they are not.
            </p>
          </div>

          <div className="border border-ink/80 bg-sheet">
            <p className="flex items-center justify-between border-b-[3px] border-double border-ink/60 px-4 py-2.5 label-caps text-ink sm:px-5">
              <span>Legend</span>
              <span className="text-ink-subtle">Symbol · reader · opens</span>
            </p>
            <ul>
              {ROLES.map((r, i) => (
                <li
                  key={r.role}
                  className={`${s.inkRow} grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-3 border-b border-rule px-4 py-6 last:border-b-0 sm:grid-cols-[56px_minmax(0,1fr)_150px] sm:px-5`}
                >
                  <svg viewBox="0 0 40 40" className="size-11 text-ink sm:size-12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    {SYMBOLS[r.sym]}
                  </svg>
                  <div className="min-w-0">
                    <h3 className="flex items-baseline gap-2.5 text-[22px] font-medium leading-tight tracking-[-0.01em] sm:text-[26px]">
                      <span className="numerals text-[11px] font-normal text-ink-subtle">{String.fromCharCode(65 + i)}</span>
                      {r.role}
                    </h3>
                    <p className="mt-2 text-[15.5px] leading-relaxed text-ink-muted">{r.does}</p>
                  </div>
                  <ul className="col-start-2 flex flex-wrap gap-x-3 gap-y-1 sm:col-start-auto sm:flex-col sm:border-l sm:border-rule sm:pl-4" aria-label={`${r.role} open`}>
                    {r.opens.map((o) => (
                      <li key={o} className="label-caps text-ink-muted before:mr-1.5 before:text-marker before:content-['→']">
                        {o}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
