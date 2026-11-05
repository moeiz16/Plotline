"""Demo plots for the seeded organisation (synthetic farms in real producing regions).

Every plot is sample data: the outlines are generated around real place names in the producing regions, and
the evidence comes from the bundled synthetic landscape (``synthetic.py``). ``scenario`` drives the landscape
(and is the intended outcome, used by tests and the seed):

- ``compliant_farmland``: farmed before 2020, no forest on 31 Dec 2020 -> compliant
- ``compliant_agroforest``: partly forest in 2020, canopy intact -> compliant
- ``compliant_old_clearing``: cleared in 2017-2019, before the cut-off -> compliant
- ``compliant_point``: point plot (<= 4 ha) on farmland -> compliant
- ``compliant_low_precision``: farmland, fewer than six decimals (geometry warning) -> compliant
- ``compliant_cloudy``: farmland, current imagery mostly cloudy (no land-change signal) -> compliant
- ``review_small_loss``: 0.15-0.4 ha of 2020 forest lost after 2020 -> needs_review
- ``review_land_change``: no recorded forest loss but clear land change since 2020 -> needs_review
- ``non_compliant``: >= 0.5 ha of 2020 forest cleared in 2022-2024 -> non_compliant
- ``non_compliant_regrowth``: forest cleared in 2021, regrown canopy now (signals disagree) -> non_compliant
- ``unassessed``: newly submitted farmland the seed leaves unassessed (pending until assessed)
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EXPECTED_VERDICT = {
    "compliant_farmland": "compliant",
    "compliant_agroforest": "compliant",
    "compliant_old_clearing": "compliant",
    "compliant_point": "compliant",
    "compliant_low_precision": "compliant",
    "compliant_cloudy": "compliant",
    "review_small_loss": "needs_review",
    "review_land_change": "needs_review",
    "non_compliant": "non_compliant",
    "non_compliant_regrowth": "non_compliant",
    "unassessed": "compliant",  # what an assessment returns once it runs
}
SCENARIOS = tuple(EXPECTED_VERDICT)


@dataclass(frozen=True)
class DemoPlot:
    reference: str
    supplier_key: str
    commodity: str
    country: str
    geometry: dict
    declared_area_ha: float | None
    scenario: str
    producer_name: str | None = None

    @property
    def expected_verdict(self) -> str:
        return EXPECTED_VERDICT[self.scenario]

    @property
    def assess_on_seed(self) -> bool:
        return self.scenario != "unassessed"


_R = 6_371_008.8  # mean Earth radius (m)


def _outline(lat: float, lon: float, area_ha: float, seed: int, decimals: int = 6) -> dict:
    """An irregular, convex-ish field outline of about ``area_ha`` (pure math so it never changes)."""
    n = 6 + seed % 4
    aspect = 1.0 + (seed % 5) * 0.18
    rot = (seed * 37 % 180) * math.pi / 180
    angles = [
        2 * math.pi * k / n + ((seed * (k + 3) * 7919) % 100) / 100 * (math.pi / n) * 0.6 for k in range(n)
    ]
    radii = [1.0 + (((seed + 11) * (k + 5) * 104729) % 100) / 100 * 0.18 - 0.09 for k in range(n)]
    pts = [(r * math.cos(a) * aspect, r * math.sin(a) / aspect) for a, r in zip(angles, radii, strict=True)]
    pts = [(x * math.cos(rot) - y * math.sin(rot), x * math.sin(rot) + y * math.cos(rot)) for x, y in pts]
    unit_area = 0.5 * abs(
        sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1], strict=True))
    )
    scale = math.sqrt(area_ha * 10_000 / unit_area)
    m_per_deg_lat = math.pi * _R / 180
    m_per_deg_lon = m_per_deg_lat * math.cos(math.radians(lat))
    ring = [
        [round(lon + x * scale / m_per_deg_lon, decimals), round(lat + y * scale / m_per_deg_lat, decimals)]
        for x, y in pts
    ]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}


def _poly(
    ref: str,
    sup: str,
    com: str,
    cc: str,
    lat: float,
    lon: float,
    ha: float,
    scenario: str,
    seed: int,
    producer: str | None = None,
    decimals: int = 6,
) -> DemoPlot:
    return DemoPlot(
        ref, sup, com, cc, _outline(lat, lon, ha, seed, decimals), round(ha, 1), scenario, producer
    )


def _point(
    ref: str,
    sup: str,
    com: str,
    cc: str,
    lat: float,
    lon: float,
    ha: float,
    scenario: str,
    producer: str | None = None,
) -> DemoPlot:
    return DemoPlot(ref, sup, com, cc, {"type": "Point", "coordinates": [lon, lat]}, ha, scenario, producer)


# Producer names are synthetic and minimised (plot owners are identified by reference; GDPR).
DEMO_PLOTS: list[DemoPlot] = [
    # Coopérative Agricole de Nawa (Soubré, Nawa region, Côte d'Ivoire) - cocoa
    _poly(
        "CI-NAW-0001",
        "coop-nawa",
        "cocoa",
        "CI",
        5.783412,
        -6.611873,
        4.6,
        "compliant_farmland",
        3,
        "K. Kouassi",
    ),
    _poly("CI-NAW-0002", "coop-nawa", "cocoa", "CI", 5.826154, -6.548207, 7.9, "compliant_agroforest", 8),
    _point("CI-NAW-0003", "coop-nawa", "cocoa", "CI", 5.752968, -6.640531, 3.2, "compliant_point"),
    _poly(
        "CI-NAW-0007", "coop-nawa", "cocoa", "CI", 5.871206, -6.512644, 6.1, "non_compliant", 14, "A. Traoré"
    ),
    # Cavally Cocoa Exporters (Guiglo / Taï, Cavally region, Côte d'Ivoire) - cocoa
    _poly(
        "CI-CAV-0001", "cavally-cocoa", "cocoa", "CI", 6.512385, -7.468012, 5.4, "compliant_old_clearing", 21
    ),
    _poly("CI-CAV-0002", "cavally-cocoa", "cocoa", "CI", 6.247731, -7.391456, 6.8, "review_small_loss", 5),
    _poly(
        "CI-CAV-0003", "cavally-cocoa", "cocoa", "CI", 6.081944, -7.512270, 4.9, "non_compliant_regrowth", 17
    ),
    # Western North Cocoa Farmers Union (Sefwi Wiawso / Juaboso, Ghana) - cocoa
    _poly("GH-WNR-0001", "wn-cocoa-union", "cocoa", "GH", 6.214877, -2.486135, 3.8, "compliant_farmland", 2),
    _poly(
        "GH-WNR-0002",
        "wn-cocoa-union",
        "cocoa",
        "GH",
        6.331502,
        -2.834718,
        5.1,
        "compliant_low_precision",
        9,
        decimals=5,
    ),
    _poly(
        "GH-WNR-0003", "wn-cocoa-union", "cocoa", "GH", 6.402366, -2.712951, 8.3, "compliant_agroforest", 12
    ),
    _poly("GH-WNR-0004", "wn-cocoa-union", "cocoa", "GH", 6.158240, -2.611087, 6.4, "review_land_change", 6),
    # Cooperativa Cafés do Sul de Minas (Varginha / Três Pontas, Minas Gerais, Brazil) - coffee
    _poly(
        "BR-SMC-0001", "sul-minas-cafe", "coffee", "BR", -21.548716, -45.431209, 24.5, "compliant_farmland", 4
    ),
    _poly(
        "BR-SMC-0002",
        "sul-minas-cafe",
        "coffee",
        "BR",
        -21.371152,
        -45.506371,
        31.2,
        "compliant_farmland",
        11,
    ),
    _poly(
        "BR-SMC-0003", "sul-minas-cafe", "coffee", "BR", -21.462308, -45.288914, 18.7, "compliant_cloudy", 7
    ),
    # Robusta Rondônia (Cacoal / Ji-Paraná, Rondônia, Brazil) - coffee
    _poly(
        "BR-ROB-0001",
        "rondonia-robusta",
        "coffee",
        "BR",
        -11.431275,
        -61.447360,
        12.6,
        "compliant_old_clearing",
        19,
    ),
    _poly(
        "BR-ROB-0002", "rondonia-robusta", "coffee", "BR", -10.884102, -61.951538, 16.4, "non_compliant", 23
    ),
    _poly("BR-ROB-0003", "rondonia-robusta", "coffee", "BR", -11.207733, -61.702415, 9.8, "unassessed", 10),
    # Gayo Highland Coffee Cooperative (Takengon, Aceh Tengah, Indonesia) - coffee
    _poly(
        "ID-GAY-0001", "gayo-highland", "coffee", "ID", 4.618904, 96.847215, 2.4, "compliant_agroforest", 15
    ),
    _poly("ID-GAY-0002", "gayo-highland", "coffee", "ID", 4.574238, 96.912604, 2.9, "review_small_loss", 13),
    _poly("ID-GAY-0003", "gayo-highland", "coffee", "ID", 4.661571, 96.790033, 1.8, "unassessed", 16),
    # Koperasi Kakao Sulawesi (Luwu Utara, South Sulawesi, Indonesia) - cocoa
    _poly(
        "ID-SUL-0001", "sulawesi-kakao", "cocoa", "ID", -2.551337, 120.331408, 2.2, "compliant_farmland", 18
    ),
    _point("ID-SUL-0002", "sulawesi-kakao", "cocoa", "ID", -2.602815, 120.287166, 1.6, "compliant_point"),
    _poly(
        "ID-SUL-0003", "sulawesi-kakao", "cocoa", "ID", -2.497460, 120.395872, 3.4, "review_land_change", 20
    ),
    # Cooperativa Agraria San Martín (Moyobamba / Lamas, Peru) - coffee and cocoa
    _poly(
        "PE-SMA-0001", "san-martin-coop", "coffee", "PE", -6.031584, -76.972407, 3.7, "compliant_farmland", 22
    ),
    _poly(
        "PE-SMA-0002", "san-martin-coop", "cocoa", "PE", -6.418221, -76.518930, 4.2, "review_small_loss", 1
    ),
    _poly("PE-SMA-0003", "san-martin-coop", "coffee", "PE", -6.102776, -76.893051, 2.6, "unassessed", 24),
]

DEMO_BY_REFERENCE = {p.reference: p for p in DEMO_PLOTS}
