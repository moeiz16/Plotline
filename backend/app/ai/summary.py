"""Plain-language summaries for evidence packs.

Deterministic text when `LLM_FAKE=true` (the default; fully offline). With a free-tier key and the optional
`[ai]` extra installed, the summary is rewritten by a hosted text service, and any failure falls back to the
deterministic text. Summaries never decide anything: verdicts come from the assessment rules.
"""

from __future__ import annotations

import re

import structlog

from app.core.config import get_settings

log = structlog.get_logger(__name__)

# Words the summary must never contain (client-facing copy rules).
_FORBIDDEN = re.compile(
    r"\b(model|embedding|vector|pipeline|cache|fallback|prompt|token|llm|latency|retrieval|algorithm)s?\b",
    re.IGNORECASE,
)


def _kg(value: float) -> str:
    return f"{value:,.0f} kg"


def _ha(value: float) -> str:
    return f"{value:,.1f} ha"


def _join(items: list[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _count(n: int, one: str, many: str | None = None) -> str:
    words = {
        1: "one",
        2: "two",
        3: "three",
        4: "four",
        5: "five",
        6: "six",
        7: "seven",
        8: "eight",
        9: "nine",
    }
    word = words.get(n, str(n))
    return f"{word} {one if n == 1 else (many or one + 's')}"


def deterministic_summary(ctx: dict) -> str:
    """`ctx` keys: shipmentReference, productName, commodity, quantityKg, harvestYear, plots, areaHa,
    suppliers (names), countries [{name, riskTier}], verdicts {compliant, needsReview, nonCompliant, pending},
    reviewed (int), lossAfter2020Ha, checksFailed [labels], mixing {mixed}."""
    plots = int(ctx.get("plots", 0))
    suppliers = list(ctx.get("suppliers", []))
    countries = list(ctx.get("countries", []))
    verdicts = ctx.get("verdicts", {})
    country_names = _join([c["name"] for c in countries])
    parts = [
        f"Shipment {ctx.get('shipmentReference')} carries {_kg(float(ctx.get('quantityKg', 0)))} of "
        f"{str(ctx.get('productName', 'product')).lower()} from the {ctx.get('harvestYear')} harvest, "
        f"sourced from {_count(plots, 'plot')} ({_ha(float(ctx.get('areaHa', 0)))}) farmed by "
        f"{_count(len(suppliers), 'supplier')}" + (f" in {country_names}." if country_names else ".")
    ]
    loss = float(ctx.get("lossAfter2020Ha") or 0)
    compliant = int(verdicts.get("compliant", 0))
    if plots and compliant == plots and loss < 0.01:
        parts.append(
            "Every plot was checked against the EU forest map for 2020 and the global forest-loss record: "
            "none "
            "shows forest cleared after 31 December 2020."
        )
    else:
        open_items = []
        if verdicts.get("nonCompliant"):
            open_items.append(f"{_count(int(verdicts['nonCompliant']), 'plot')} with forest loss after 2020")
        if verdicts.get("needsReview"):
            open_items.append(f"{_count(int(verdicts['needsReview']), 'plot')} awaiting a reviewer")
        if verdicts.get("pending"):
            open_items.append(f"{_count(int(verdicts['pending']), 'plot')} without forest evidence yet")
        parts.append(
            f"{compliant} of {plots} plots are clear of deforestation after 2020; "
            f"still open: {_join(open_items)}."
        )
    reviewed = int(ctx.get("reviewed", 0))
    if reviewed:
        parts.append(
            f"{_count(reviewed, 'plot').capitalize()} {'was' if reviewed == 1 else 'were'} "
            "confirmed by a reviewer "
            "after a closer look at the satellite evidence."
        )
    if countries:
        tiers: dict[str, list[str]] = {}
        for c in countries:
            tiers.setdefault(c["riskTier"], []).append(c["name"])
        tier_text = "; ".join(
            f"{_join(names)} {'is' if len(names) == 1 else 'are'} {tier}-risk"
            for tier, names in sorted(tiers.items())
        )
        parts.append(f"Under the EU country benchmarking, {tier_text}.")
    failed = list(ctx.get("checksFailed", []))
    if failed:
        parts.append(f"Before submission, resolve: {_join([f.lower() for f in failed])}.")
    else:
        mixing = ctx.get("mixing") or {}
        parts.append(
            "The declared quantities fit within what the plots can plausibly produce"
            + (", and no product from unverified plots is mixed in." if not mixing.get("mixed") else ".")
        )
        parts.append(
            "On this evidence the shipment is ready for a due diligence statement with negligible risk of "
            "deforestation."
        )
    return " ".join(parts)


def _hosted_summary(ctx: dict, draft: str) -> str | None:  # pragma: no cover - needs network and keys
    s = get_settings()
    keys = {
        "groq/llama-3.1-8b-instant": s.groq_api_key.get_secret_value(),
        "gemini/gemini-1.5-flash": s.gemini_api_key.get_secret_value(),
        "openrouter/meta-llama/llama-3.1-8b-instruct:free": s.openrouter_api_key.get_secret_value(),
    }
    try:
        import litellm
    except ImportError:
        return None
    for name, key in keys.items():
        if not key:
            continue
        try:
            resp = litellm.completion(
                model=name,
                api_key=key,
                timeout=s.llm_timeout_s,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Rewrite this compliance summary for an executive reader in plain "
                            "business English. "
                            "Keep every number and fact exactly. Do not add claims. At most 120 words."
                        ),
                    },
                    {"role": "user", "content": draft},
                ],
            )
            text = (resp.choices[0].message.content or "").strip()
            if text and not _FORBIDDEN.search(text):
                return text
        except Exception as exc:
            log.warning("summary_service_failed", provider=name.split("/")[0], error=type(exc).__name__)
    return None


def shipment_summary(ctx: dict) -> str:
    draft = deterministic_summary(ctx)
    if get_settings().llm_fake:
        return draft
    return _hosted_summary(ctx, draft) or draft


def is_plain_language(text: str) -> bool:
    return not _FORBIDDEN.search(text)
