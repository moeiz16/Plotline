# ADR 0002: Temporal for weeks-long supplier campaigns

Status: accepted

## Context
Collecting plot evidence from many suppliers takes weeks: requests, reminders, partial uploads, automated
checks and a human approval step. A cron job plus status columns gets subtle under restarts and retries.

## Decision
Model each campaign as a Temporal workflow with one child workflow per supplier, using durable timers for
reminders and signals for "submitted" and reviewer decisions. Run the local `temporal server start-dev`
(single binary in `.tools/`, state in `data/temporal.db`) and the worker inline in the API process to save
memory. Activities project every stage change into the database and the SSE bus, so reads never depend on
the workflow server. Tests use Temporal's time-skipping environment, so a 6-week campaign runs in seconds.

## Consequences
Restarts resume exactly where they stopped; reminders are reliable. One extra local process is needed for
campaigns (everything else works without it; campaign actions return 503 while it is down).
