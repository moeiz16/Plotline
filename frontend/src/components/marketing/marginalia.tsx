import { Glyph } from "@/components/ui/display";
import s from "./story.module.css";

const SOURCES = [
  { name: "EU JRC Global Forest Cover 2020", org: "European Commission, Joint Research Centre", use: "Where forest stood on 31 December 2020, the cut-off date." },
  { name: "Global Forest Change", org: "Hansen et al., University of Maryland", use: "Year-by-year tree-cover loss, used to date any clearing since 2021." },
  { name: "Copernicus Sentinel-2", org: "European Union, Copernicus programme", use: "Recent imagery for the before-and-after view and the land-change signal." },
  { name: "EU country benchmarking", org: "European Commission, Article 29", use: "Low, standard and high risk tiers for the countries you source from." },
];

const DOES = [
  "Records every plot, verdict, review and statement, with the data versions behind each check, kept for five years.",
  "Keeps farmer data to the minimum: plots are known by reference, not by name.",
  "Logs every sensitive action in a tamper-evident activity log.",
];
const DOES_NOT = [
  "Certify products or suppliers. Plotline is not a certification scheme.",
  "Decide for you. The operator placing products on the market stays responsible for the due diligence.",
  "File with the EU on its own. Submissions in the demo are labelled “demo submission”.",
];

/** [7] Compliance wording and data sources, set as a map's margin notes and footnotes. */
export function Marginalia() {
  return (
    <section aria-labelledby="margin-title" className="border-t border-ink/70 bg-sheet">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-8 sm:py-28">
        <p className="label-caps text-ink-subtle">
          <span className="text-marker-ink">Sheet 04</span> · Margin notes
        </p>
        <h2 id="margin-title" className="mt-4 max-w-[22ch] text-[34px] font-medium leading-[1.08] tracking-[-0.025em] sm:text-[52px]">
          Aligned with EUDR (Regulation (EU) 2023/1115). Designed to support your due diligence.
        </h2>

        <div className="mt-12 grid gap-px border border-ink/80 bg-rule md:grid-cols-2">
          <div className="bg-sheet p-5 sm:p-7">
            <p className="flex items-center gap-2 border-b border-rule pb-3 label-caps text-ink">
              <Glyph tone="brand" /> What Plotline does
            </p>
            <ul className="mt-2">
              {DOES.map((d) => (
                <li key={d} className="border-b border-rule py-3 text-[16px] leading-relaxed text-ink-muted last:border-b-0">
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-sheet p-5 sm:p-7">
            <p className="flex items-center gap-2 border-b border-rule pb-3 label-caps text-ink">
              <Glyph tone="neutral" /> What it does not do
            </p>
            <ul className="mt-2">
              {DOES_NOT.map((d) => (
                <li key={d} className="border-b border-rule py-3 text-[16px] leading-relaxed text-ink-muted last:border-b-0">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16">
          <p className="flex items-center gap-3 label-caps text-ink">
            Sources <span className="h-px flex-1 bg-ink/40" />
          </p>
          <ol className="mt-2">
            {SOURCES.map((src, i) => (
              <li key={src.name} className={`${s.inkRow} grid gap-x-6 gap-y-1 border-b border-rule py-4 sm:grid-cols-[40px_minmax(0,1fr)_minmax(0,1.2fr)]`}>
                <span className="numerals text-[13px] text-marker-ink">[{i + 1}]</span>
                <span>
                  <span className="text-[17px] font-medium">{src.name}</span>
                  <span className="block text-[13.5px] italic text-ink-subtle">{src.org}</span>
                </span>
                <span className="text-[15px] leading-relaxed text-ink-muted">{src.use}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-[80ch] text-[13.5px] italic leading-relaxed text-ink-subtle">
            Background maps © OpenStreetMap contributors via OpenFreeMap; satellite basemap © Esri and partners. The landing illustrations are drawn, not real imagery.
          </p>
        </div>
      </div>
    </section>
  );
}
