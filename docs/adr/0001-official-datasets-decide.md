# ADR 0001: The verdict rests on official forest datasets; the land-change signal is a second opinion

Status: accepted

## Context
An EUDR verdict must be defensible to an authority. Learned signals are useful but hard to explain and can
be wrong in ways nobody can audit. Official/public datasets (EU JRC Global Forest Cover 2020 for the
31 Dec 2020 baseline, Hansen Global Forest Change for loss since 2021) are what authorities and the
Commission's own guidance point to.

## Decision
Deterministic rules over the official datasets produce the verdict: forest-2020 pixels with loss in 2021 or
later ≥ 0.5 ha (FAO minimum forest area) → Non-compliant; any smaller loss → Needs review; none → Compliant.
The land-change signal can only *raise* attention: Compliant with a high change score → Needs review;
Non-compliant with a low change score stays Non-compliant but asks a reviewer to confirm. Reviewers record
a decision and note; the original assessment is never overwritten.

## Consequences
Verdicts are explainable and reproducible. The signal catches what 30 m loss maps miss (small clearings,
recent change) without ever clearing a plot on its own. Reviewer workload rises with disagreements, which is
the intended trade-off.
