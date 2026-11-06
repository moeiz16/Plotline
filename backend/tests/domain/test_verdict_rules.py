"""Verdict rules eudr-rules-2026.1: official forest data decides; the land-change signal raises attention."""

from __future__ import annotations

import re

import pytest

from app.rules.verdict import Evidence, decide, pending_decision

FORBIDDEN = re.compile(r"\b(model|embedding|vector|pipeline|cache|fallback|LLM|prompt|token|latency)\b", re.I)


def ev(
    loss: float = 0.0,
    forest: float = 3.0,
    level: str | None = "low",
    score: float | None = 0.01,
    years: dict | None = None,
    available: bool = True,
    before: float = 0.0,
) -> Evidence:
    by_year = years if years is not None else ({"2022": loss} if loss else {})
    return Evidence(
        forest2020_ha=forest,
        forest2020_share=forest / 6,
        loss_after_ha=loss,
        loss_by_year=by_year,
        loss_before_ha=before,
        loss_before_years=[2018] if before else [],
        change_score=score,
        change_level=level,
        change_available=available,
    )


@pytest.mark.parametrize(
    "loss,level,verdict,review,agree",
    [
        (0.0, "low", "compliant", False, True),
        (0.0, "elevated", "compliant", False, True),
        (0.0, "high", "needs_review", True, False),
        (0.01, "low", "needs_review", True, False),
        (0.49, "high", "needs_review", True, True),
        (0.5, "high", "non_compliant", False, True),
        (0.5, "elevated", "non_compliant", False, True),
        (2.4, "low", "non_compliant", True, False),
    ],
)
def test_rule_table(loss: float, level: str, verdict: str, review: bool, agree: bool) -> None:
    d = decide(ev(loss=loss, level=level))
    assert (d.verdict, d.review_required, d.signals_agree) == (verdict, review, agree)


def test_official_data_decides_when_imagery_is_cloudy() -> None:
    for loss, verdict in ((0.0, "compliant"), (0.2, "needs_review"), (1.0, "non_compliant")):
        d = decide(ev(loss=loss, level=None, score=None))
        assert d.verdict == verdict
        assert d.signals_agree is None
        assert "imagery_cloudy" in {r["code"] for r in d.reasons}


def test_without_an_encoder_the_verdict_still_comes_from_forest_data() -> None:
    d = decide(ev(loss=0.0, level=None, score=None, available=False))
    assert d.verdict == "compliant"
    assert "land_change_unavailable" in {r["code"] for r in d.reasons}


def test_headlines() -> None:
    assert decide(ev(loss=2.4)).headline == "2.4 ha of forest cleared in 2022"
    assert (
        decide(ev(loss=1.5, years={"2022": 1.0, "2023": 0.5})).headline
        == "1.5 ha of forest cleared in 2022–2023"
    )
    assert (
        decide(ev(loss=1.0, years={"2021": 0.5, "2024": 0.5})).headline
        == "1 ha of forest cleared in 2021 and 2024"
    )
    assert decide(ev(loss=0.0, forest=0.0)).headline == "No forest on the plot at the end of 2020"
    assert decide(ev(loss=0.0)).headline == "No deforestation after 2020"
    assert decide(ev(loss=0.0, level="high")).headline == "Land change since 2020 to check"
    assert decide(ev(loss=0.3)).headline == "0.3 ha of forest loss since 2020 to check"


def test_clearing_before_cutoff_is_context_only() -> None:
    d = decide(ev(loss=0.0, forest=0.0, before=3.2))
    assert d.verdict == "compliant"
    r = next(r for r in d.reasons if r["code"] == "loss_before_cutoff")
    assert r["severity"] == "info" and "2018" in r["message"]


def test_reason_severities() -> None:
    d = decide(ev(loss=2.4, level="high"))
    sev = {r["code"]: r["severity"] for r in d.reasons}
    assert sev["loss_after_cutoff"] == "critical"
    assert decide(ev(loss=0.2)).reasons[1]["severity"] == "warning"


def test_pending_decision() -> None:
    d = pending_decision("Not reachable.")
    assert d.verdict == "pending" and not d.review_required
    assert d.reasons[0]["code"] == "evidence_unavailable"


@pytest.mark.parametrize(
    "case",
    [
        ev(loss=0.0),
        ev(loss=0.0, level="high"),
        ev(loss=0.3),
        ev(loss=2.0, level="low"),
        ev(loss=2.0, level="high"),
        ev(loss=0.0, level=None, score=None),
        ev(available=False, level=None, score=None),
        ev(before=2, forest=0),
    ],
)
def test_user_facing_text_is_plain_language(case: Evidence) -> None:
    d = decide(case)
    for text in [d.headline, *(r["message"] for r in d.reasons)]:
        assert not FORBIDDEN.search(text), text
