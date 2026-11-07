"""Statement payload, simulated reference numbers, plain-language summaries and evidence pack renderers."""

from __future__ import annotations

import re

from app.ai.summary import deterministic_summary, is_plain_language, shipment_summary
from app.evidence.pack import render_html, render_pdf
from app.evidence.payload import (
    build_payload,
    decode_producer_geometry,
    hs_heading,
    payload_hash,
    simulated_numbers,
)

POLY = {"type": "Polygon", "coordinates": [[[-6.61, 5.78], [-6.6, 5.78], [-6.6, 5.79], [-6.61, 5.78]]]}
PLOTS = [
    {
        "reference": "CI-1",
        "kind": "polygon",
        "geometry": POLY,
        "areaHa": 3.2,
        "declaredAreaHa": None,
        "country": "CI",
        "supplierName": "Coop A",
    },
    {
        "reference": "CI-2",
        "kind": "point",
        "geometry": {"type": "Point", "coordinates": [-6.6, 5.7]},
        "areaHa": 2.0,
        "declaredAreaHa": 2.0,
        "country": "CI",
        "supplierName": "Coop A",
    },
    {
        "reference": "GH-1",
        "kind": "polygon",
        "geometry": POLY,
        "areaHa": 4.0,
        "declaredAreaHa": None,
        "country": "GH",
        "supplierName": "Union B",
    },
]


def _payload() -> dict:
    return build_payload(
        internal_ref="DDS-2026-0001",
        org={"name": "Northbank", "eori": "DE4471902385516", "address": "Hamburg", "country": "DE"},
        product={"name": "Cocoa beans", "commodity": "cocoa", "hsCode": "1801"},
        shipment={"reference": "NB-1", "harvestYear": 2026, "quantityKg": 12000},
        plots=PLOTS,
    )


def test_payload_structure_matches_traces_statement() -> None:
    p = _payload()
    s = p["statement"]
    assert p["operatorType"] == "OPERATOR"
    assert s["internalReferenceNumber"] == "DDS-2026-0001" and s["activityType"] == "IMPORT"
    assert s["operator"]["nameAndAddress"]["country"] == "DE"
    line = s["commodities"][0]
    assert line["speciesInfo"]["scientificName"] == "Theobroma cacao"
    assert line["descriptors"]["goodsMeasure"]["netWeight"] == 12000
    producers = {pr["name"]: pr for pr in line["producers"]}
    assert set(producers) == {"Coop A", "Union B"}
    fc = decode_producer_geometry(producers["Coop A"])
    assert len(fc["features"]) == 2
    point = next(f for f in fc["features"] if f["geometry"]["type"] == "Point")
    assert point["properties"]["Area"] == 2.0


def test_hs_heading_and_hash_stability() -> None:
    assert hs_heading("0901 11") == "090111"
    assert payload_hash(_payload()) == payload_hash(_payload())
    changed = _payload()
    changed["statement"]["commodities"][0]["descriptors"]["goodsMeasure"]["netWeight"] = 1
    assert payload_hash(changed) != payload_hash(_payload())


def test_simulated_numbers_format_and_determinism() -> None:
    ref, ver = simulated_numbers("id-1", "hash", 2026, "DE")
    assert re.fullmatch(r"26DE[0-9A-Z]{10}", ref)
    assert re.fullmatch(r"[0-9A-Z]{8}", ver)
    assert (ref, ver) == simulated_numbers("id-1", "hash", 2026, "DE")
    assert ref != simulated_numbers("id-2", "hash", 2026, "DE")[0]


CTX = {
    "shipmentReference": "NB-2026-001",
    "productName": "Cocoa beans",
    "quantityKg": 18000,
    "harvestYear": 2026,
    "plots": 4,
    "areaHa": 23.5,
    "suppliers": ["Coop A", "Union B"],
    "countries": [
        {"name": "Côte d'Ivoire", "riskTier": "standard"},
        {"name": "Ghana", "riskTier": "standard"},
    ],
    "verdicts": {"compliant": 4, "needsReview": 0, "nonCompliant": 0, "pending": 0},
    "reviewed": 1,
    "lossAfter2020Ha": 0,
    "checksFailed": [],
    "mixing": {"mixed": False},
}


def test_deterministic_summary_ready_shipment() -> None:
    text = deterministic_summary(CTX)
    assert text.startswith("Shipment NB-2026-001 carries 18,000 kg of cocoa beans")
    assert "four plots (23.5 ha)" in text and "two suppliers" in text
    assert "none shows forest cleared after 31 December 2020" in text
    assert "One plot was confirmed by a reviewer" in text
    assert "Côte d'Ivoire and Ghana are standard-risk" in text
    assert "negligible risk" in text
    assert is_plain_language(text)


def test_summary_lists_open_items_when_not_ready() -> None:
    ctx = {
        **CTX,
        "verdicts": {"compliant": 2, "needsReview": 1, "nonCompliant": 1, "pending": 0},
        "lossAfter2020Ha": 1.4,
        "checksFailed": ["No plots with deforestation after 2020"],
    }
    text = deterministic_summary(ctx)
    assert "2 of 4 plots are clear" in text
    assert "one plot with forest loss after 2020" in text and "one plot awaiting a reviewer" in text
    assert "Before submission, resolve: no plots with deforestation after 2020." in text
    assert "negligible" not in text


def test_summary_offline_mode_is_deterministic() -> None:
    assert shipment_summary(CTX) == shipment_summary(CTX) == deterministic_summary(CTX)
    assert not is_plain_language("Our model uses embeddings")


def _pack_ctx() -> dict:
    return {
        "generatedAt": "2026-11-14T10:00:00+00:00",
        "org": {"name": "Northbank <GmbH>", "eori": "DE4471902385516", "address": "Hamburg", "country": "DE"},
        "dds": {
            "internalRef": "DDS-2026-0001",
            "status": "submitted",
            "referenceNumber": "26DEABCDEFGHIJ",
            "verificationNumber": "K7R8LA90",
            "payloadHash": "a" * 64,
        },
        "shipment": {
            "reference": "NB-2026-001",
            "productName": "Cocoa beans",
            "hsCode": "1801",
            "commodity": "cocoa",
            "quantityKg": 18000,
            "harvestYear": 2026,
            "status": "submitted",
        },
        "summary": deterministic_summary(CTX),
        "countries": [{"code": "CI", "name": "Côte d'Ivoire", "riskTier": "standard"}],
        "plots": [
            {
                "reference": "CI-1",
                "supplierName": "Coopérative",
                "country": "CI",
                "kind": "polygon",
                "areaHa": 3.2,
                "verdict": "compliant",
                "headline": "No forest loss after 2020",
                "forest2020Ha": 0.4,
                "lossAfter2020Ha": 0.0,
                "changeLevel": "low",
                "review": {
                    "decision": "confirm_compliant",
                    "reviewerName": "Tobias",
                    "reviewedAt": "2026-11-01",
                },
            }
        ],
        "checks": [
            {"code": "mass_balance", "status": "pass", "label": "Volumes are plausible", "detail": "ok"}
        ],
        "massBalance": [
            {"reference": "CI-1", "allocatedKg": 1000.0, "capacityKg": 2000.0, "utilisationPct": 50.0}
        ],
        "mixing": {"mixed": False},
        "datasets": {"Forest map 2020": "JRC GFC2020 V2", "Assessment rules": "eudr-rules-2026.1"},
        "submissions": [{"at": "2026-11-14T10:00:00+00:00", "status": "submitted", "message": "Registered."}],
        "auditChain": {"valid": True, "checked": 42},
        "retentionYears": 5,
    }


def test_evidence_html_is_escaped_and_complete() -> None:
    html = render_html(_pack_ctx())
    assert "Northbank &lt;GmbH&gt;" in html and "<GmbH>" not in html
    for needle in (
        "26DEABCDEFGHIJ",
        "K7R8LA90",
        "Plots of production",
        "Confirmed compliant",
        "42 entries verified",
        "at least 5 years",
        "Land-change signal",
    ):
        assert needle in html
    assert "<script" not in html


def test_evidence_pdf_renders_non_ascii() -> None:
    pdf = render_pdf(_pack_ctx())
    assert pdf[:5] == b"%PDF-" and len(pdf) > 2000
