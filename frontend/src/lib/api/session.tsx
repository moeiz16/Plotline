"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { ApiError, api, readCookie } from "./client";
import { qk } from "./hooks";
import type { LoginResponse, Me, Permission } from "./types";

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      // No session cookies at all: skip the round trip (and the 401 it would log) on a first visit.
      if (typeof document !== "undefined" && !readCookie("pl_csrf")) return null;
      try {
        return await api.get<Me>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export function useSession() {
  const qc = useQueryClient();
  const q = useMe();
  const me = q.data ?? null;
  const status: SessionStatus = q.isPending ? "loading" : q.isError ? "error" : me ? "authenticated" : "unauthenticated";

  const login = useCallback(
    async (body: { email: string; password: string }) => {
      const res = await api.post<LoginResponse>("/auth/login", body);
      await qc.invalidateQueries({ queryKey: qk.me });
      return res;
    },
    [qc],
  );

  const signup = useCallback(
    async (body: { email: string; password: string; fullName: string; orgName?: string }) => {
      const res = await api.post<{ user: unknown; activeOrgId: string | null }>("/auth/signup", body);
      await qc.invalidateQueries({ queryKey: qk.me });
      return res;
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* the session is dropped locally either way */
    } finally {
      qc.clear();
      qc.setQueryData(qk.me, null);
    }
  }, [qc]);

  const switchOrg = useCallback(
    async (orgId: string) => {
      const next = await api.post<Me>("/auth/switch-org", { orgId });
      qc.clear();
      qc.setQueryData(qk.me, next);
      return next;
    },
    [qc],
  );

  const can = useCallback((perm: Permission) => !!me?.membership?.permissions.includes(perm), [me]);

  return { me, status, error: q.error, login, signup, logout, switchOrg, can, refetch: q.refetch };
}

/** Renders children only when the signed-in member holds `perm`. */
export function Can({ perm, children, fallback = null }: { perm: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useSession();
  return <>{can(perm) ? children : fallback}</>;
}
