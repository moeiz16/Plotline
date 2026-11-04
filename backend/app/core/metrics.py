"""Prometheus metrics (exposed at `/metrics`)."""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter("plotline_http_requests_total", "HTTP requests", ["method", "route", "status"])
HTTP_LATENCY = Histogram(
    "plotline_http_request_duration_seconds",
    "HTTP request duration",
    ["method", "route"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
ASSESSMENTS = Counter("plotline_assessments_total", "Plot assessments run", ["verdict", "source"])
ASSESSMENT_SECONDS = Histogram(
    "plotline_assessment_duration_seconds",
    "Plot assessment duration",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15),
)
REVIEWS = Counter("plotline_reviews_total", "Reviewer decisions", ["decision"])
DDS_SUBMISSIONS = Counter("plotline_dds_submissions_total", "Due diligence statements submitted", ["status"])
CAMPAIGN_EVENTS = Counter("plotline_campaign_events_total", "Supplier campaign events", ["kind"])
PORTAL_UPLOADS = Counter("plotline_portal_plots_total", "Plots received through supplier links", ["result"])
RATE_LIMITED = Counter("plotline_rate_limited_total", "Requests rejected by rate limiting", ["bucket"])
AUDIT_APPENDS = Counter("plotline_audit_events_total", "Audit events appended", ["action"])
ENGINE_ONLINE = Gauge("plotline_workflow_engine_online", "1 when the campaign workflow service is reachable")
