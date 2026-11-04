"""EUDR verdict rules (version ``eudr-rules-2026.1``). Official forest data decides; the land-change signal is
a second opinion that can only raise attention (ADR 0001).

1. No evidence -> ``pending``.
2. Loss on forest-2020 pixels after 31 Dec 2020: >= 0.5 ha (FAO minimum forest area) -> ``non_compliant``;
   above 0 and below 0.5 ha -> ``needs_review``; none -> ``compliant``.
3. Compliant but the land-change signal is high -> ``needs_review`` (a reviewer checks the imagery).
4. Non-compliant but the land-change signal is low -> stays ``non_compliant``; a reviewer confirms.
5. Too cloudy (no change score) -> verdict from official data only.

Messages are plain language: they are shown to compliance teams, suppliers and auditors.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

RULES_VERSION = "eudr-rules-2026.1"
MIN_FOREST_HA = 0.5  # FAO forest definition: at least 0.5 ha
Verdict = Literal["compliant", "needs_review", "non_compliant", "pending"]


@dataclass
class Evidence:
    forest2020_ha: float
    forest2020_share: float
    loss_after_ha: float
    loss_by_year: dict[str, float]
    loss_before_ha: float = 0.0
    loss_before_years: list[int] = field(default_factory=list)
    change_score: float | None = None
    change_level: Literal["low", "elevated", "high"] | None = None
    change_available: bool = True  # an encoder is installed


@dataclass
class Decision:
    verdict: Verdict
    headline: str
    reasons: list[dict]
    review_required: bool
    signals_agree: bool | None


def _ha(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".") if v < 10 else f"{v:,.1f}"


def _years(years: list[int]) -> str:
    years = sorted(set(years))
    if not years:
        return ""
    if len(years) == 1:
        return str(years[0])
    if years == list(range(years[0], years[-1] + 1)):
        return f"{years[0]}–{years[-1]}"
    return ", ".join(str(y) for y in years[:-1]) + f" and {years[-1]}"


def _r(code: str, severity: str, message: str) -> dict:
    return {"code": code, "severity": severity, "message": message}


def pending_decision(message: str) -> Decision:
    return Decision(
        "pending",
        "Satellite evidence not available yet",
        [_r("evidence_unavailable", "warning", message)],
        False,
        None,
    )


def decide(ev: Evidence) -> Decision:
    reasons: list[dict] = []
    loss_years = [int(y) for y, v in ev.loss_by_year.items() if v > 0]
    loss = round(ev.loss_after_ha, 2)

    # baseline
    if ev.forest2020_ha <= 0:
        reasons.append(
            _r(
                "forest_2020_none",
                "info",
                "The EU forest map shows no forest on this plot on 31 December 2020.",
            )
        )
    else:
        reasons.append(
            _r(
                "forest_2020_present",
                "info",
                f"{_ha(ev.forest2020_ha)} ha "
                f"({ev.forest2020_share:.0%}) of the plot was forest on 31 December 2020.",
            )
        )
    if ev.loss_before_ha > 0:
        when = f" ({_years(ev.loss_before_years)})" if ev.loss_before_years else ""
        reasons.append(
            _r(
                "loss_before_cutoff",
                "info",
                f"{_ha(ev.loss_before_ha)} ha was cleared before the "
                f"31 December 2020 cut-off{when}. This does not affect compliance.",
            )
        )

    # official verdict
    verdict: Verdict
    if loss >= MIN_FOREST_HA:
        verdict = "non_compliant"
        headline = f"{_ha(loss)} ha of forest cleared in {_years(loss_years)}"
        reasons.append(
            _r(
                "loss_after_cutoff",
                "critical",
                f"{_ha(loss)} ha of forest that stood on 31 December "
                f"2020 was cleared ({_years(loss_years)}). Product from this plot cannot be placed on "
                "the EU market.",
            )
        )
    elif loss > 0:
        verdict = "needs_review"
        headline = f"{_ha(loss)} ha of forest loss since 2020 to check"
        reasons.append(
            _r(
                "small_loss_after_cutoff",
                "warning",
                f"{_ha(loss)} ha of forest loss was recorded "
                f"after 2020 ({_years(loss_years)}), below the 0.5 ha minimum forest area. A reviewer "
                "should check whether forest was converted.",
            )
        )
    else:
        verdict = "compliant"
        headline = (
            "No deforestation after 2020"
            if ev.forest2020_ha > 0
            else "No forest on the plot at the end of 2020"
        )
        reasons.append(
            _r(
                "no_loss_after_cutoff",
                "info",
                "No forest loss has been recorded on the plot since 31 December 2020.",
            )
        )

    # second opinion
    review = verdict == "needs_review"
    agree: bool | None = None
    level = ev.change_level
    if not ev.change_available:
        reasons.append(
            _r(
                "land_change_unavailable",
                "info",
                "The land-change signal is not available; the verdict rests on the forest data alone.",
            )
        )
    elif ev.change_score is None or level is None:
        reasons.append(
            _r(
                "imagery_cloudy",
                "info",
                "Recent imagery is too cloudy for the land-change signal; the "
                "verdict rests on the forest data alone.",
            )
        )
    elif verdict == "compliant":
        agree = level != "high"
        if level == "high":
            verdict, review = "needs_review", True
            headline = "Land change since 2020 to check"
            reasons.append(
                _r(
                    "land_change_high",
                    "warning",
                    "The land-change signal shows strong change since "
                    "2020 although the forest data records no loss. A reviewer should compare the "
                    "before and after imagery.",
                )
            )
        elif level == "elevated":
            reasons.append(
                _r(
                    "land_change_elevated",
                    "info",
                    "The land-change signal shows some change since "
                    "2020, within the normal range for farmed land.",
                )
            )
        else:
            reasons.append(
                _r(
                    "land_change_agrees",
                    "info",
                    "The land-change signal shows little change since 2020, consistent with the forest data.",
                )
            )
    elif verdict == "non_compliant":
        agree = level != "low"
        if level == "low":
            review = True
            reasons.append(
                _r(
                    "land_change_low",
                    "warning",
                    "The land-change signal shows little change since "
                    "2020 (for example regrowth after clearing). The forest data still decides; a "
                    "reviewer should confirm the recorded loss.",
                )
            )
        else:
            reasons.append(
                _r("land_change_agrees", "info", "The land-change signal also shows clear change since 2020.")
            )
    else:  # needs_review from a small official loss
        agree = level != "low"
        msg = (
            "The land-change signal also shows change since 2020."
            if agree
            else "The land-change signal shows little change since 2020."
        )
        reasons.append(_r("land_change_agrees" if agree else "land_change_low", "info", msg))

    return Decision(verdict, headline, reasons, review, agree)
