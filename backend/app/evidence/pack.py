"""Human-readable evidence pack for a due diligence statement: printable HTML and PDF.

Both renderers take the same context dict (built in `services/dds.py`), so the two formats always agree.
"""

from __future__ import annotations

from html import escape
from typing import Any

from fpdf import FPDF

VERDICT_LABEL = {
    "compliant": "Compliant",
    "needs_review": "Needs review",
    "non_compliant": "Non-compliant",
    "pending": "Evidence pending",
}
CHECK_LABEL = {"pass": "Passed", "warn": "Attention", "fail": "Failed"}
CHANGE_LABEL = {"low": "Low", "elevated": "Elevated", "high": "High", None: "Not available"}
DECISION_LABEL = {
    "confirm_compliant": "Confirmed compliant",
    "confirm_non_compliant": "Confirmed non-compliant",
    "request_information": "Information requested",
}
DISCLAIMER = (
    "Prepared to support the due diligence obligations of Regulation (EU) 2023/1115 (Articles 9 to 12). "
    "Verdicts rest on official forest datasets (EU forest map 2020 and the global forest-loss record); the "
    "land-change signal from satellite imagery is a second opinion, and conflicts are settled by a reviewer. "
    "Submission to the EU information system is simulated in this environment."
)


def _fmt(value: Any, unit: str = "", digits: int = 2) -> str:
    if value is None:
        return "–"
    if isinstance(value, float | int):
        text = f"{value:,.{digits}f}" if isinstance(value, float) else f"{value:,}"
        return f"{text} {unit}".strip()
    return str(value)


def _date(value: str | None) -> str:
    return value[:10] if value else "–"


# ── HTML ─────────────────────────────────────────────────────────────────────
_CSS = """
:root{--ink:#1f2a24;--muted:#5d6b62;--line:#d9ded6;--accent:#3f6b4e;--warn:#a06a1f;--bad:#9c3d2e;--bg:#fbfbf8}
*{box-sizing:border-box}body{font:14px/1.5 -apple-system,'Segoe UI',Inter,Arial,sans-serif;color:var(--ink);
background:var(--bg);margin:0;padding:32px}main{max-width:960px;margin:0 auto;background:#fff;padding:40px;
border:1px solid var(--line)}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:32px 0 8px;
text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:6px 8px;
border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:600;color:var(--muted);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.kv{border:1px solid var(--line);
padding:10px 12px}.kv b{display:block;font-size:12px;color:var(--muted);font-weight:500}.pill{display:inline-block;
padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:12px}.compliant,.pass{color:var(--accent)}
.needs_review,.warn,.pending{color:var(--warn)}.non_compliant,.fail{color:var(--bad)}.summary{border-left:3px solid
var(--accent);padding:8px 16px;background:#f4f6f1}code{font-size:11px;word-break:break-all}
footer{margin-top:32px;font-size:12px;color:var(--muted)}@media print{body{padding:0;background:#fff}main{border:0}}
"""


def render_html(ctx: dict) -> str:
    d, s, org = ctx["dds"], ctx["shipment"], ctx["org"]
    e = escape
    rows_plots = "".join(
        f"<tr><td>{e(p['reference'])}<div class='muted'>{e(p['supplierName'])} · {e(p['country'])}</div></td>"
        f"<td>{_fmt(p['areaHa'], 'ha')}</td><td>{_fmt(p.get('forest2020Ha'), 'ha')}</td>"
        f"<td>{_fmt(p.get('lossAfter2020Ha'), 'ha')}</td><td>{e(CHANGE_LABEL.get(p.get('changeLevel'), '–'))}</td>"
        f"<td><span class='pill {e(p['verdict'])}'>{e(VERDICT_LABEL.get(p['verdict'], p['verdict']))}</span>"
        f"<div class='muted'>{e(p.get('headline') or '')}</div>"
        + (
            f"<div class='muted'>{e(DECISION_LABEL.get(p['review']['decision'], ''))} by "
            f"{e(p['review'].get('reviewerName') or '')} on {_date(p['review'].get('reviewedAt'))}</div>"
            if p.get("review")
            else ""
        )
        + "</td></tr>"
        for p in ctx["plots"]
    )
    rows_checks = "".join(
        f"<tr><td>{e(c.get('label') or c.get('code') or '')}</td><td class='{e(c.get('status') or '')}'>"
        f"{e(CHECK_LABEL.get(c.get('status'), c.get('status') or ''))}</td><td>{e(c.get('detail') or '')}</td></tr>"
        for c in ctx["checks"]
    )
    rows_mb = "".join(
        f"<tr><td>{e(str(m.get('reference')))}</td><td>{_fmt(m.get('allocatedKg'), 'kg', 0)}</td>"
        f"<td>{_fmt(m.get('capacityKg'), 'kg', 0)}</td><td>{_fmt(m.get('utilisationPct'), '%', 0)}</td></tr>"
        for m in ctx["massBalance"]
    )
    rows_countries = "".join(
        f"<tr><td>{e(c['name'])}</td><td>{e(c['riskTier'].capitalize())} risk</td></tr>"
        for c in ctx["countries"]
    )
    rows_datasets = "".join(
        f"<tr><td>{e(k)}</td><td>{e(str(v))}</td></tr>" for k, v in sorted(ctx["datasets"].items())
    )
    rows_subs = (
        "".join(
            f"<tr><td>{_date(x['at'])} {x['at'][11:16]}</td><td>{e(x['status'].capitalize())}</td>"
            f"<td>{e(x['message'])}</td></tr>"
            for x in ctx["submissions"]
        )
        or "<tr><td colspan='3' class='muted'>Not submitted yet.</td></tr>"
    )
    chain = ctx.get("auditChain") or {}
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence pack {e(d["internalRef"])}</title>
<style>{_CSS}</style></head><body><main>
<p class="muted">Due diligence evidence pack · generated {_date(ctx["generatedAt"])}</p>
<h1>{e(s["productName"])} · shipment {e(s["reference"])}</h1>
<p class="muted">{e(org["name"])}{" · EORI " + e(org["eori"]) if org.get("eori") else ""}</p>
<div class="grid">
<div class="kv"><b>Statement</b>{e(d["internalRef"])}</div>
<div class="kv"><b>Status</b>{e(d["status"].capitalize())}</div>
<div class="kv"><b>Reference number</b>{e(d.get("referenceNumber") or "–")}</div>
<div class="kv"><b>Verification number</b>{e(d.get("verificationNumber") or "–")}</div>
<div class="kv"><b>Quantity</b>{_fmt(s["quantityKg"], "kg", 0)}</div>
<div class="kv"><b>HS code</b>{e(s["hsCode"])}</div>
<div class="kv"><b>Harvest year</b>{e(str(s["harvestYear"]))}</div>
<div class="kv"><b>Plots</b>{len(ctx["plots"])}</div>
</div>
<h2>Summary</h2><p class="summary">{e(ctx["summary"])}</p>
<h2>Plots of production</h2><table><thead><tr><th>Plot</th><th>Area</th><th>Forest 2020</th>
<th>Forest loss after 2020</th><th>Land-change signal</th><th>Verdict</th></tr></thead><tbody>{rows_plots}</tbody></table>
<h2>Country risk</h2><table><tbody>{rows_countries}</tbody></table>
<h2>Shipment checks</h2><table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
<tbody>{rows_checks}</tbody></table>
<h2>Quantity against plot capacity</h2><table><thead><tr><th>Plot</th><th>Allocated</th><th>Plausible capacity</th>
<th>Used</th></tr></thead><tbody>{rows_mb}</tbody></table>
<h2>Evidence sources</h2><table><tbody>{rows_datasets}</tbody></table>
<h2>Submission log</h2><table><tbody>{rows_subs}</tbody></table>
<h2>Integrity</h2><p>Statement fingerprint <code>{e(d["payloadHash"])}</code><br>
Audit trail: {chain.get("checked", 0)} entries verified, {"intact" if chain.get("valid", True) else "BROKEN"}.<br>
Records are kept for at least {ctx["retentionYears"]} years.</p>
<footer>{e(DISCLAIMER)}</footer></main></body></html>"""


# ── PDF ──────────────────────────────────────────────────────────────────────
_REPLACE = {
    "–": "-",
    "—": "-",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "·": "-",
    "…": "...",
    "≤": "<=",
    "≥": ">=",
}


def _latin1(text: Any) -> str:
    out = str(text if text is not None else "")
    for k, v in _REPLACE.items():
        out = out.replace(k, v)
    return out.encode("latin-1", "replace").decode("latin-1")


class _Pack(FPDF):
    def __init__(self, title: str) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self._title = title
        self.set_auto_page_break(auto=True, margin=16)
        self.set_margins(16, 16, 16)

    def header(self) -> None:  # pragma: no cover - layout
        self.set_font("Helvetica", "", 8)
        self.set_text_color(93, 107, 98)
        self.cell(0, 5, _latin1(self._title), new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self) -> None:  # pragma: no cover - layout
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(93, 107, 98)
        self.cell(0, 5, f"Page {self.page_no()}", align="R")


def _heading(pdf: FPDF, text: str) -> None:
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(63, 107, 78)
    pdf.cell(0, 6, _latin1(text.upper()), new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(31, 42, 36)
    pdf.set_font("Helvetica", "", 9)


def _table(pdf: FPDF, header: list[str], rows: list[list[str]], widths: list[float]) -> None:
    pdf.set_font("Helvetica", "B", 8)
    for h, w in zip(header, widths, strict=True):
        pdf.cell(w, 6, _latin1(h), border="B")
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for row in rows:
        for cell, w in zip(row, widths, strict=True):
            pdf.cell(w, 5.5, _latin1(cell)[: int(w * 0.62)], border="B")
        pdf.ln()


def render_pdf(ctx: dict) -> bytes:
    d, s, org = ctx["dds"], ctx["shipment"], ctx["org"]
    pdf = _Pack(f"Plotline evidence pack - {d['internalRef']}")
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 15)
    pdf.multi_cell(
        0, 7, _latin1(f"{s['productName']} - shipment {s['reference']}"), new_x="LMARGIN", new_y="NEXT"
    )
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(
        0,
        5,
        _latin1(org["name"] + (f" - EORI {org['eori']}" if org.get("eori") else "")),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    _heading(pdf, "Statement")
    for label, value in (
        ("Internal reference", d["internalRef"]),
        ("Status", d["status"].capitalize()),
        ("Reference number", d.get("referenceNumber") or "-"),
        ("Verification number", d.get("verificationNumber") or "-"),
        ("Quantity", _fmt(s["quantityKg"], "kg", 0)),
        ("HS code", s["hsCode"]),
        ("Harvest year", str(s["harvestYear"])),
    ):
        pdf.cell(45, 5, _latin1(label))
        pdf.cell(0, 5, _latin1(value), new_x="LMARGIN", new_y="NEXT")
    _heading(pdf, "Summary")
    pdf.multi_cell(0, 4.8, _latin1(ctx["summary"]), new_x="LMARGIN", new_y="NEXT")
    _heading(pdf, "Plots of production")
    _table(
        pdf,
        ["Plot", "Supplier", "Area", "Forest 2020", "Loss after 2020", "Change", "Verdict"],
        [
            [
                p["reference"],
                p["supplierName"],
                _fmt(p["areaHa"], "ha"),
                _fmt(p.get("forest2020Ha"), "ha"),
                _fmt(p.get("lossAfter2020Ha"), "ha"),
                CHANGE_LABEL.get(p.get("changeLevel"), "-"),
                VERDICT_LABEL.get(p["verdict"], p["verdict"]),
            ]
            for p in ctx["plots"]
        ],
        [26, 44, 18, 20, 24, 18, 28],
    )
    _heading(pdf, "Country risk")
    _table(
        pdf,
        ["Country", "EU benchmark"],
        [[c["name"], f"{c['riskTier'].capitalize()} risk"] for c in ctx["countries"]],
        [90, 88],
    )
    _heading(pdf, "Shipment checks")
    _table(
        pdf,
        ["Check", "Result", "Detail"],
        [
            [c.get("label") or "", CHECK_LABEL.get(c.get("status"), ""), c.get("detail") or ""]
            for c in ctx["checks"]
        ],
        [50, 20, 108],
    )
    _heading(pdf, "Evidence sources")
    _table(pdf, ["Source", "Version"], [[k, str(v)] for k, v in sorted(ctx["datasets"].items())], [50, 128])
    _heading(pdf, "Submission log")
    subs = [
        [x["at"][:16].replace("T", " "), x["status"].capitalize(), x["message"]] for x in ctx["submissions"]
    ]
    _table(pdf, ["When", "Status", "Message"], subs or [["-", "-", "Not submitted yet."]], [32, 22, 124])
    _heading(pdf, "Integrity")
    chain = ctx.get("auditChain") or {}
    pdf.multi_cell(
        0,
        4.8,
        _latin1(
            f"Statement fingerprint {d['payloadHash']}. Audit trail: {chain.get('checked', 0)} entries verified, "
            f"{'intact' if chain.get('valid', True) else 'BROKEN'}. Records are kept for at least "
            f"{ctx['retentionYears']} years."
        ),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.multi_cell(0, 4, _latin1(DISCLAIMER), new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())
