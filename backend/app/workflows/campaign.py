"""Supplier evidence campaigns as durable Temporal workflows.

`SupplierCampaignWorkflow` fans out one `SupplierEvidenceWorkflow` child per supplier and closes the campaign
when every supplier is approved. A child walks one supplier through:

    request → (timer per reminder interval → reminder / overdue)* → submitted (signal or seen in the database)
    → automated assessment → awaiting review → decision signal → approved | changes requested (loop)

Every activity writes the stage and a timeline event to the database, so the app keeps working from the
database while the workflow service is down, and a restarted workflow resumes from the stored stage.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy

from app.workflows.types import (
    ASSESS_SUBMISSION,
    COMPLETE_CAMPAIGN,
    LOAD_MEMBER,
    RECORD_DECISION,
    REMINDER_DUE,
    REQUEST_EVIDENCE,
    CampaignInput,
    Decision,
    DecisionIn,
    MemberInput,
    MemberRef,
    MemberState,
    ReminderIn,
    ReminderOut,
    member_workflow_id,
)

_ACTIVITY = {
    "start_to_close_timeout": timedelta(minutes=2),
    "retry_policy": RetryPolicy(
        initial_interval=timedelta(seconds=2), maximum_interval=timedelta(minutes=1), maximum_attempts=10
    ),
}


@workflow.defn(name="SupplierEvidenceWorkflow")
class SupplierEvidenceWorkflow:
    def __init__(self) -> None:
        self._submitted = False
        self._remind = False
        self._decision: Decision | None = None
        self._stage = "requested"

    @workflow.signal
    def submit(self) -> None:
        self._submitted = True

    @workflow.signal
    def remind(self) -> None:
        self._remind = True

    @workflow.signal
    def decide(self, decision: Decision) -> None:
        self._decision = decision

    @workflow.query
    def stage(self) -> str:
        return self._stage

    async def _wait_for_submission(self, inp: MemberInput) -> None:
        ref = (inp.campaign_id, inp.member_id)
        while not self._submitted:
            try:
                await workflow.wait_condition(
                    lambda: self._submitted or self._remind, timeout=timedelta(seconds=inp.reminder_every_s)
                )
            except TimeoutError:
                pass
            if self._submitted:
                break
            manual = self._remind
            self._remind = False
            out: ReminderOut = await workflow.execute_activity(
                REMINDER_DUE,
                ReminderIn(*ref, now_iso=workflow.now().isoformat(), manual=manual),
                result_type=ReminderOut,
                **_ACTIVITY,
            )
            self._stage = out.stage
            if out.submitted:
                self._submitted = True

    @workflow.run
    async def run(self, inp: MemberInput) -> str:
        ref = MemberRef(inp.campaign_id, inp.member_id)
        state: MemberState = await workflow.execute_activity(
            LOAD_MEMBER, ref, result_type=MemberState, **_ACTIVITY
        )
        self._stage = state.stage
        if state.closed:
            return state.stage
        self._submitted = state.submitted
        if not state.submitted:
            await workflow.execute_activity(REQUEST_EVIDENCE, ref, **_ACTIVITY)

        while True:
            if self._stage != "awaiting_review":
                await self._wait_for_submission(inp)
                self._stage = "assessing"
                self._stage = await workflow.execute_activity(
                    ASSESS_SUBMISSION, ref, result_type=str, **_ACTIVITY
                )
            await workflow.wait_condition(lambda: self._decision is not None)
            decision = self._decision
            assert decision is not None
            self._decision = None
            self._stage = await workflow.execute_activity(
                RECORD_DECISION,
                DecisionIn(
                    inp.campaign_id, inp.member_id, decision.approve, decision.note, decision.reviewer_name
                ),
                result_type=str,
                **_ACTIVITY,
            )
            if decision.approve:
                return "approved"
            self._submitted = False  # changes requested: the supplier uploads again


@workflow.defn(name="SupplierCampaignWorkflow")
class SupplierCampaignWorkflow:
    @workflow.run
    async def run(self, inp: CampaignInput) -> str:
        children = [
            workflow.execute_child_workflow(
                SupplierEvidenceWorkflow.run,
                member,
                id=member_workflow_id(inp.campaign_id, member.member_id),
            )
            for member in inp.members
        ]
        await asyncio.gather(*children)
        await workflow.execute_activity(COMPLETE_CAMPAIGN, inp.campaign_id, **_ACTIVITY)
        return "completed"
