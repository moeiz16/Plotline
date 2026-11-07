"""Due diligence statement payload aligned to the EU information system (TRACES NT EUDR) structure.

Mirrors the `statement` object of the EUDR submission service: operator identification, activity, the
commodity lines with HS heading, net mass, species and producers, and per-producer plot geolocation as a
base64-encoded GeoJSON FeatureCollection (points carry their area in hectares, per the EUDR GeoJSON guidance).
Submission itself is simulated offline: there is no TRACES account.
"""

from __future__ import annotations

import base64
import hashlib
import json
import string
from collections import defaultdict
from typing import Any

SPECIES = {
    "cocoa": ("Theobroma cacao", "Cocoa"),
    "coffee": ("Coffea spp.", "Coffee"),
    "soy": ("Glycine max", "Soya"),
    "oil_palm": ("Elaeis guineensis", "Oil palm"),
    "cattle": ("Bos taurus", "Cattle"),
    "rubber": ("Hevea brasiliensis", "Natural rubber"),
    "wood": ("", "Wood"),
}


def hs_heading(code: str) -> str:
    return "".join(ch for ch in code if ch.isdigit())


def feature_collection(plots: list[dict]) -> dict:
    features = []
    for p in plots:
        props: dict[str, Any] = {"ProductionPlace": p["reference"]}
        if p["kind"] == "point":
            props["Area"] = round(float(p.get("declaredAreaHa") or p["areaHa"]), 4)
        features.append({"type": "Feature", "properties": props, "geometry": p["geometry"]})
    return {"type": "FeatureCollection", "features": features}


def build_payload(
    *,
    internal_ref: str,
    org: dict,
    product: dict,
    shipment: dict,
    plots: list[dict],
) -> dict:
    """`plots`: [{reference, kind, geometry, areaHa, declaredAreaHa, country, supplierName}]."""
    by_producer: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for p in plots:
        by_producer[(p["country"], p["supplierName"])].append(p)
    producers = []
    for (country, name), group in sorted(by_producer.items()):
        fc = json.dumps(feature_collection(group), separators=(",", ":"), sort_keys=True)
        producers.append(
            {"country": country, "name": name, "geometryGeojson": base64.b64encode(fc.encode()).decode()}
        )
    scientific, common = SPECIES.get(product["commodity"], ("", product["commodity"]))
    operator_ids = [{"identifierType": "eori", "identifierValue": org["eori"]}] if org.get("eori") else []
    return {
        "operatorType": "OPERATOR",
        "statement": {
            "internalReferenceNumber": internal_ref,
            "activityType": "IMPORT",
            "operator": {
                "referenceNumber": operator_ids,
                "nameAndAddress": {
                    "name": org["name"],
                    "country": org.get("country") or "",
                    "address": org.get("address") or "",
                },
            },
            "countryOfActivity": org.get("country") or "",
            "borderCrossCountry": org.get("country") or "",
            "comment": f"Shipment {shipment['reference']}, harvest {shipment['harvestYear']}.",
            "geoLocationConfidential": False,
            "commodities": [
                {
                    "position": 1,
                    "descriptors": {
                        "descriptionOfGoods": product["name"],
                        "goodsMeasure": {"netWeight": round(float(shipment["quantityKg"]), 3)},
                    },
                    "hsHeading": hs_heading(product["hsCode"]),
                    "speciesInfo": {"scientificName": scientific, "commonName": common},
                    "producers": producers,
                }
            ],
            "associatedStatements": [],
        },
    }


def payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


_ALNUM = string.digits + string.ascii_uppercase


def _code(seed: str, length: int) -> str:
    digest = hashlib.sha256(seed.encode()).digest()
    return "".join(_ALNUM[b % len(_ALNUM)] for b in digest[:length])


def simulated_numbers(dds_id: str, p_hash: str, year: int, country: str) -> tuple[str, str]:
    """Reference number (e.g. `26DE7K2P9QX4LM`) and verification number (8 characters), deterministic."""
    reference = f"{year % 100:02d}{(country or 'EU')[:2].upper()}{_code(f'ref:{dds_id}:{p_hash}', 10)}"
    verification = _code(f"ver:{dds_id}:{p_hash}", 8)
    return reference, verification


def decode_producer_geometry(producer: dict) -> dict:
    return json.loads(base64.b64decode(producer["geometryGeojson"]))
