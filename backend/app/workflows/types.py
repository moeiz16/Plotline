"""Workflow and activity payloads.

Plain dataclasses only: this module is imported inside the workflow sandbox.
"""

from __future__ import annotations

from dataclasses import dataclass, field

TASK_QUEUE_DEFAULT = "plotline-campaigns"

# Activity names (workflows refer to activities by name, so the sandbox never imports database code).
LOAD_MEMBER = "campaign.load_member"
REQUEST_EVIDENCE = "campaign.request_evidence"
REMINDER_DUE = "campaign.reminder_due"
ASSESS_SUBMISSION = "campaign.assess_submission"
RECORD_DECISION = "campaign.record_decision"
COMPLETE_CAMPAIGN = "campaign.complete"

# Member stages that mean "the supplier has handed in evidence and is waiting on us".
IN_REVIEW_STAGES = ("submitted", "assessing", "awaiting_review")


@dataclass
class MemberInput:
    campaign_id: str
    member_id: str
    supplier_id: str
    reminder_every_s: int
    due_at_iso: str


@dataclass
class CampaignInput:
    campaign_id: str
    members: list[MemberInput] = field(default_factory=list)


@dataclass
class MemberRef:
    campaign_id: str
    member_id: str


@dataclass
class MemberState:
    stage: str
    submitted: bool
    closed: bool  # campaign cancelled / completed, or member approved


@dataclass
class ReminderIn:
    campaign_id: str
    member_id: str
    now_iso: str
    manual: bool = False


@dataclass
class ReminderOut:
    submitted: bool
    stage: str


@dataclass
class Decision:
    approve: bool
    note: str = ""
    reviewer_name: str = ""


@dataclass
class DecisionIn:
    campaign_id: str
    member_id: str
    approve: bool
    note: str = ""
    reviewer_name: str = ""


def campaign_workflow_id(campaign_id: str) -> str:
    return f"campaign-{campaign_id}"


def member_workflow_id(campaign_id: str, member_id: str) -> str:
    return f"campaign-{campaign_id}-member-{member_id}"
