"""In-process pub/sub event bus and Server-Sent Events helpers.

The campaign worker runs inside the API process by default, so activities publish straight to the bus.
Channels: `campaign:{id}`, `org:{id}`.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import defaultdict
from collections.abc import AsyncIterator

import structlog
from sse_starlette.sse import EventSourceResponse

log = structlog.get_logger(__name__)

HEARTBEAT_SECONDS = 15.0
_QUEUE_MAX = 500


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, set[asyncio.Queue[tuple[str, dict]]]] = defaultdict(set)

    async def publish(self, channel: str, event: str, data: dict) -> None:
        for q in list(self._subs.get(channel, ())):
            try:
                q.put_nowait((event, data))
            except asyncio.QueueFull:
                log.warning("event_queue_full_dropping", channel=channel)

    async def subscribe(self, channel: str) -> AsyncIterator[tuple[str, dict]]:
        q: asyncio.Queue[tuple[str, dict]] = asyncio.Queue(maxsize=_QUEUE_MAX)
        self._subs[channel].add(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subs[channel].discard(q)
            if not self._subs[channel]:
                self._subs.pop(channel, None)

    def subscriber_count(self, channel: str) -> int:
        return len(self._subs.get(channel, ()))


bus = EventBus()


async def publish(channel: str, event: str, data: dict) -> None:
    await bus.publish(channel, event, data)


def format_sse(event: str, data: dict) -> dict[str, str]:
    return {"event": event, "data": json.dumps(data, default=str, separators=(",", ":"))}


async def event_stream(
    channel: str,
    *,
    replay: list[tuple[str, dict]] | None = None,
    heartbeat: float = HEARTBEAT_SECONDS,
    max_events: int | None = None,
) -> AsyncIterator[dict[str, str]]:
    """Replay events first, then live events with heartbeats while idle."""
    sent = 0
    for event, data in replay or []:
        yield format_sse(event, data)
        sent += 1
    stream = bus.subscribe(channel).__aiter__()
    pending: asyncio.Future | None = None
    try:
        while max_events is None or sent < max_events:
            if pending is None:
                pending = asyncio.ensure_future(stream.__anext__())
            done, _ = await asyncio.wait({pending}, timeout=heartbeat)
            if not done:
                yield format_sse("heartbeat", {})
                sent += 1
                continue
            try:
                event, data = pending.result()
            except StopAsyncIteration:
                return
            finally:
                pending = None
            yield format_sse(event, data)
            sent += 1
    finally:
        if pending is not None:
            pending.cancel()
        with contextlib.suppress(Exception):
            await stream.aclose()  # type: ignore[attr-defined]


SSE_HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}


def sse_response(
    channel: str,
    *,
    replay: list[tuple[str, dict]] | None = None,
    heartbeat: float = HEARTBEAT_SECONDS,
    max_events: int | None = None,
) -> EventSourceResponse:
    return EventSourceResponse(
        event_stream(channel, replay=replay, heartbeat=heartbeat, max_events=max_events),
        headers=SSE_HEADERS,
        ping=None,
    )
