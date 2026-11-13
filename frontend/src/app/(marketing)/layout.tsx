import type { ReactNode } from "react";
import { StoryMasthead } from "@/components/marketing/story-masthead";

/** The public front sheet: a transparent masthead floating over a full-bleed scroll story. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <StoryMasthead />
      {children}
    </div>
  );
}
