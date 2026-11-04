"""Organisation profile, members and invitations (`org:admin` to change)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import set_auth_cookies
from app.core.config import get_settings
from app.core.deps import RequestContext, client_ip, get_ctx, get_db, get_optional_ctx, require_perm
from app.core.errors import AppError, forbidden
from app.core.permissions import role_label
from app.schemas.platform import AcceptInvitationIn, InvitationIn, MemberPatchIn, OrgPatchIn
from app.services import auth as auth_svc
from app.services import orgs as org_svc
from app.services.audit import audit

router = APIRouter(tags=["organisation"])


@router.get("/org")
async def get_org(ctx: RequestContext = Depends(get_ctx)) -> dict:
    assert ctx.org is not None
    return auth_svc.org_out(ctx.org)


@router.patch("/org")
async def patch_org(
    body: OrgPatchIn,
    ctx: RequestContext = Depends(require_perm("org:admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = ctx.org
    assert org is not None
    changes = body.model_dump(exclude_unset=True, by_alias=False)
    settings = changes.pop("settings", None)
    for field, value in changes.items():
        if value is not None:
            setattr(org, field, value)
    if settings:
        mapped = {
            "retentionYears": settings.get("retention_years"),
            "reviewAllHighRisk": settings.get("review_all_high_risk"),
            "autoAssess": settings.get("auto_assess"),
        }
        org.settings = {**(org.settings or {}), **{k: v for k, v in mapped.items() if v is not None}}
    await audit(
        db,
        ctx,
        action="org.updated",
        resource_type="org",
        resource_id=org.id,
        metadata={"fields": sorted([*changes.keys(), *(["settings"] if settings else [])])},
    )
    await db.commit()
    return auth_svc.org_out(org)


@router.get("/org/members")
async def members(ctx: RequestContext = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    if ctx.is_supplier:
        raise forbidden()
    return await org_svc.list_members(db, ctx.org_id)


@router.patch("/org/members/{member_id}")
async def patch_member(
    member_id: uuid.UUID,
    body: MemberPatchIn,
    ctx: RequestContext = Depends(require_perm("org:admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    out = await org_svc.change_role(db, ctx, member_id, body.role)
    await db.commit()
    return out


@router.delete("/org/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    member_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("org:admin")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await org_svc.remove_member(db, ctx, member_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/org/invitations")
async def invitations(
    ctx: RequestContext = Depends(require_perm("org:admin")), db: AsyncSession = Depends(get_db)
) -> list[dict]:
    return await org_svc.list_invitations(db, ctx.org_id)


@router.post("/org/invitations", status_code=status.HTTP_201_CREATED)
async def invite(
    body: InvitationIn,
    ctx: RequestContext = Depends(require_perm("org:admin")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    inv, token = await org_svc.create_invitation(
        db, ctx, email=body.email, role=body.role, supplier_id=body.supplier_id
    )
    await db.commit()
    return {
        "invitation": org_svc.invitation_out(inv),
        "inviteUrl": f"{get_settings().public_app_url}/invite/{token}",
    }


@router.delete("/org/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke(
    invitation_id: uuid.UUID,
    ctx: RequestContext = Depends(require_perm("org:admin")),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await org_svc.revoke_invitation(db, ctx, invitation_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/invitations/{token}")
async def preview_invitation(token: str, db: AsyncSession = Depends(get_db)) -> dict:
    inv, org = await org_svc.find_invitation(db, token)
    return {
        "orgName": org.name,
        "email": inv.email,
        "role": inv.role,
        "roleLabel": role_label(inv.role),
        "expiresAt": inv.expires_at.isoformat(),
    }


@router.post("/invitations/{token}/accept")
async def accept_invitation(
    token: str,
    body: AcceptInvitationIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    ctx: RequestContext | None = Depends(get_optional_ctx),
) -> dict:
    inv, org = await org_svc.find_invitation(db, token)
    if ctx is not None:
        if ctx.user.email != inv.email:
            raise AppError(
                403,
                "invitation_email_mismatch",
                "Wrong account",
                "This invitation was sent to a different email address.",
            )
        user = ctx.user
    else:
        existing = await auth_svc.get_user_by_email(db, inv.email)
        if existing:
            raise AppError(
                409,
                "sign_in_required",
                "Please sign in",
                "An account with this email exists. Sign in first, then accept the invitation.",
            )
        if not body.full_name or not body.password:
            raise AppError(
                422,
                "validation_error",
                "Validation failed",
                "Enter your name and a password.",
                errors=[
                    {"field": f, "message": "Required."}
                    for f, v in (("fullName", body.full_name), ("password", body.password))
                    if not v
                ],
            )
        user = await auth_svc.create_user(
            db, email=inv.email, password=body.password, full_name=body.full_name
        )
    membership = await org_svc.add_membership(db, inv, user)
    user.preferences = {**(user.preferences or {}), "lastOrgId": str(org.id)}
    await audit(
        db,
        None,
        org_id=org.id,
        actor_id=user.id,
        action="invitation.accepted",
        resource_type="member",
        resource_id=membership.id,
        ip=client_ip(request),
        metadata={"email": user.email, "role": inv.role, "roleLabel": role_label(inv.role)},
    )
    tokens = await auth_svc.issue_session(
        db, user, org_id=org.id, ip=client_ip(request), user_agent=request.headers.get("user-agent")
    )
    await db.commit()
    set_auth_cookies(response, tokens)
    return await auth_svc.me_payload(db, user, org.id)
