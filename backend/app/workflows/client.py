"""Connection to the workflow service, the inline worker and campaign reconciliation.

The API never blocks on the workflow service: reads work from the database, and campaign actions answer
`503 engine_unavailable` while it is down. An inline worker (default for local runs) reconnects with backoff
and, on every (re)connect, starts workflows for running campaigns that the service does not know yet (e.g. the
seeded demo campaign, or after the service's own database was reset).
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

import structlog
from sqlalchemy import select
from temporalio.client import Client, WorkflowHandle
from temporalio.exceptions import WorkflowAlreadyStartedError
from temporalio.service import RPCError, RPCStatusCode
from temporalio.worker import Worker

from app.core.config import get_settings
from app.core.errors import conflict, engine_unavailable
from app.core.metrics import ENGINE_ONLINE

log = structlog.get_logger(__name__)


class _State:
    client: Client | None = None
    online: bool = False
    worker_task: asyncio.Task | None = None
    worker: Worker | None = None


state = _State()


def is_online() -> bool:
    return state.client is not None and state.online


def set_client(client: Client | None) -> None:
    """Install a connected client (tests, CLI) or clear it."""
    state.client = client
    state.online = client is not None
    ENGINE_ONLINE.set(1 if state.online else 0)


def mark_offline() -> None:
    state.online = False
    ENGINE_ONLINE.set(0)


async def connect() -> Client | None:
    s = get_settings()
    try:
        client = await asyncio.wait_for(
            Client.connect(s.temporal_address, namespace=s.temporal_namespace),
            timeout=s.temporal_connect_timeout_s,
        )
    except Exception as exc:
        log.info("workflow_engine_unreachable", address=s.temporal_address, error=type(exc).__name__)
        return None
    set_client(client)
    return client


async def require_client() -> Client:
    if state.client is not None and state.online:
        return state.client
    if state.client is None and get_settings().environment != "test":
        client = await connect()
        if client is not None:
            return client
    raise engine_unavailable()


def _is_unavailable(exc: BaseException) -> bool:
    return isinstance(exc, RPCError) and exc.status in (
        RPCStatusCode.UNAVAILABLE,
        RPCStatusCode.DEADLINE_EXCEEDED,
    )


async def call(fn: Any, *args: Any, **kwargs: Any) -> Any:
    """Run a client call, mapping connectivity failures to 503 and missing workflows to 409."""
    try:
        return await fn(*args, **kwargs)
    except RPCError as exc:
        if _is_unavailable(exc):
            mark_offline()
            raise engine_unavailable() from exc
        if exc.status == RPCStatusCode.NOT_FOUND:
            raise conflict("campaign_closed", "This step of the campaign has already finished.") from exc
        raise


def member_handle(client: Client, workflow_id: str) -> WorkflowHandle:
    return client.get_workflow_handle(workflow_id)


# ── Starting workflows ───────────────────────────────────────────────────────
async def start_campaign_workflow(client: Client, campaign_id: str) -> None:
    """Start (or adopt) the workflow for a campaign, from its database rows."""
    from app.db.models.domain import Campaign, CampaignMember
    from app.db.session import session_scope
    from app.workflows.activities import due_at
    from app.workflows.types import CampaignInput, MemberInput

    s = get_settings()
    async with session_scope() as db:
        import uuid

        campaign = await db.get(Campaign, uuid.UUID(campaign_id))
        if campaign is None:
            return
        members = list(
            (
                await db.execute(
                    select(CampaignMember)
                    .where(CampaignMember.campaign_id == campaign.id)
                    .order_by(CampaignMember.id)
                )
            ).scalars()
        )
        inp = CampaignInput(
            campaign_id=str(campaign.id),
            members=[
                MemberInput(
                    campaign_id=str(campaign.id),
                    member_id=str(m.id),
                    supplier_id=str(m.supplier_id),
                    reminder_every_s=max(1, campaign.reminder_every_days * s.campaign_day_seconds),
                    due_at_iso=due_at(campaign.due_date).isoformat(),
                )
                for m in members
            ],
        )
        workflow_id = campaign.workflow_id
    try:
        await client.start_workflow(
            "SupplierCampaignWorkflow", inp, id=workflow_id, task_queue=s.temporal_task_queue
        )
        log.info("campaign_workflow_started", campaign_id=campaign_id)
    except WorkflowAlreadyStartedError:
        pass


async def reconcile(client: Client) -> int:
    """Make sure every running campaign has a workflow."""
    from app.db.models.domain import Campaign
    from app.db.session import session_scope

    async with session_scope() as db:
        ids = [
            str(i)
            for i in (await db.execute(select(Campaign.id).where(Campaign.status == "running"))).scalars()
        ]
    for cid in ids:
        try:
            await start_campaign_workflow(client, cid)
        except Exception as exc:  # keep reconciling the others
            log.warning("campaign_reconcile_failed", campaign_id=cid, error=type(exc).__name__)
    return len(ids)


# ── Worker ───────────────────────────────────────────────────────────────────
def build_worker(client: Client, task_queue: str | None = None, **kwargs: Any) -> Worker:
    from app.workflows.activities import ALL_ACTIVITIES
    from app.workflows.campaign import SupplierCampaignWorkflow, SupplierEvidenceWorkflow

    return Worker(
        client,
        task_queue=task_queue or get_settings().temporal_task_queue,
        workflows=[SupplierCampaignWorkflow, SupplierEvidenceWorkflow],
        activities=ALL_ACTIVITIES,
        **kwargs,
    )


async def _run_worker_forever() -> None:
    delay = 2.0
    while True:
        client = state.client if state.online else await connect()
        if client is None:
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30.0)
            continue
        delay = 2.0
        try:
            state.worker = build_worker(client)
            await reconcile(client)
            log.info("campaign_worker_running", task_queue=get_settings().temporal_task_queue)
            await state.worker.run()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("campaign_worker_stopped", error=type(exc).__name__)
            mark_offline()
            state.client = None
            await asyncio.sleep(delay)


def start_background_worker() -> None:
    if state.worker_task is None or state.worker_task.done():
        state.worker_task = asyncio.get_running_loop().create_task(_run_worker_forever())


async def shutdown() -> None:
    task, state.worker_task = state.worker_task, None
    if state.worker is not None:
        with contextlib.suppress(Exception):
            await asyncio.wait_for(state.worker.shutdown(), timeout=5)
        state.worker = None
    if task is not None:
        task.cancel()
        with contextlib.suppress(BaseException):
            await task
