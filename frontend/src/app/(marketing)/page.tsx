import type { Metadata } from "next";
import { Audience } from "@/components/marketing/audience";
import { Closing, Colophon } from "@/components/marketing/closing";
import { CutoffScene } from "@/components/marketing/cutoff-scene";
import { DeadlineRuler } from "@/components/marketing/deadline-ruler";
import { Marginalia } from "@/components/marketing/marginalia";
import { Procedure } from "@/components/marketing/procedure";
import { SurveyStory } from "@/components/marketing/survey-story";

const TITLE = "Plotline · Every plot, judged against 31 December 2020";
const DESCRIPTION =
  "A field atlas for EU deforestation evidence. Suppliers map their plots, official forest maps decide, satellites give a second opinion, reviewers confirm and the due diligence statement is filed. Aligned with EUDR (Regulation (EU) 2023/1115).";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Plotline", title: TITLE, description: DESCRIPTION, locale: "en_GB" },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

/**
 * The front sheet, told as one scroll: the cut-off date → a plot surveyed → before and after →
 * the verdict → the field procedure → who reads the atlas → margin notes → the deadline ruler.
 */
export default function LandingPage() {
  return (
    <main id="main">
      <CutoffScene />
      <SurveyStory />
      <Procedure />
      <Audience />
      <Marginalia />
      <DeadlineRuler />
      <Closing />
      <Colophon />
    </main>
  );
}
