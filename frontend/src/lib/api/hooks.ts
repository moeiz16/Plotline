"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { API_BASE, api, errorMessage, tryRefresh, type Query } from "./client";
import type {
  Assessment,
  AuditPage,
  AuditVerify,
  Campaign,
  CampaignListItem,
  Commodity,
  Country,
  Dashboard,
  Dds,
  DdsListItem,
  Geometry,
  ImportResult,
  Invitation,
  InvitePreview,
  Me,
  Member,
  NotificationItem,
  Org,
  Plot,
  PlotFeatureCollection,
  PlotFilters,
  PlotListItem,
  Portal,
  Product,
  ReviewDecision,
  Role,
  Shipment,
  ShipmentListItem,
  SimilarPlot,
  SupplierDetail,
  SupplierKind,
  SupplierListItem,
  Trace,
  ValidationResult,
} from "./types";

export const qk = {
  me: ["me"] as const,
  org: ["org"] as const,
  members: ["org", "members"] as const,
  invitations: ["org", "invitations"] as const,
  invitePreview: (t: string) => ["invite", t] as const,
  dashboard: ["dashboard"] as const,
  suppliers: (q?: Query) => ["suppliers", q ?? {}] as const,
  supplier: (id: string) => ["supplier", id] as const,
  plots: (q?: Query) => ["plots", q ?? {}] as const,
  plotsMap: (q?: Query) => ["plots", "map", q ?? {}] as const,
  plot: (id: string) => ["plot", id] as const,
  assessments: (id: string) => ["plot", id, "assessments"] as const,
  similar: (id: string) => ["plot", id, "similar"] as const,
  reviews: ["reviews"] as const,
  products: ["products"] as const,
  shipments: (status?: string) => ["shipments", status ?? "all"] as const,
  shipment: (id: string) => ["shipment", id] as const,
  trace: (id: string) => ["shipment", id, "trace"] as const,
  ddsList: ["dds"] as const,
  dds: (id: string) => ["dds", id] as const,
  campaigns: ["campaigns"] as const,
  campaign: (id: string) => ["campaign", id] as const,
  portal: (t: string) => ["portal", t] as const,
  countries: ["countries"] as const,
  audit: (action?: string) => ["audit", action ?? ""] as const,
  notifications: ["notifications"] as const,
};

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

const onError = (e: unknown) => {
  toast.error(errorMessage(e));
};

const plotQuery = (f?: PlotFilters): Query => ({
  supplierId: f?.supplierId,
  verdict: f?.verdict,
  country: f?.country,
  commodity: f?.commodity,
  q: f?.q,
});

/* ── Organisation, members, invitations ─────────────────────────────────── */
export const useOrg = () => useQuery({ queryKey: qk.org, queryFn: () => api.get<Org>("/org") });
export const useMembers = (enabled = true) =>
  useQuery({ queryKey: qk.members, queryFn: () => api.get<Member[]>("/org/members"), enabled });
export const useInvitations = (enabled = true) =>
  useQuery({ queryKey: qk.invitations, queryFn: () => api.get<Invitation[]>("/org/invitations"), enabled });

export function useUpdateOrg() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: Partial<Pick<Org, "name" | "eori" | "address" | "country" | "operatorSize" | "settings">>) =>
      api.patch<Org>("/org", body),
    onSuccess: () => {
      toast.success("Organisation details saved");
      return inv(qk.org, qk.me, qk.dashboard);
    },
    onError,
  });
}

export function useUpdateMember() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch<Member>(`/org/members/${id}`, { role }),
    onSuccess: () => {
      toast.success("Role updated");
      return inv(qk.members);
    },
    onError,
  });
}

export function useRemoveMember() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/org/members/${id}`),
    onSuccess: () => {
      toast.success("Member removed");
      return inv(qk.members);
    },
    onError,
  });
}

export function useCreateInvitation() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      api.post<{ invitation: Invitation; inviteUrl: string }>("/org/invitations", body),
    onSuccess: () => inv(qk.invitations),
    onError,
  });
}

export function useRevokeInvitation() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/org/invitations/${id}`),
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      return inv(qk.invitations);
    },
    onError,
  });
}

export const useInvitePreview = (token: string) =>
  useQuery({ queryKey: qk.invitePreview(token), queryFn: () => api.get<InvitePreview>(`/invitations/${token}`), retry: false });

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fullName?: string; password?: string }) => api.post<Me>(`/invitations/${token}/accept`, body),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
    },
  });
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api.get<Dashboard>("/dashboard") });

/* ── Suppliers ──────────────────────────────────────────────────────────── */
export const useSuppliers = (q?: { q?: string; country?: string; commodity?: string }) =>
  useQuery({ queryKey: qk.suppliers(q), queryFn: () => api.get<SupplierListItem[]>("/suppliers", q) });

export const useSupplier = (id: string) =>
  useQuery({ queryKey: qk.supplier(id), queryFn: () => api.get<SupplierDetail>(`/suppliers/${id}`) });

export function useCreateSupplier() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; country: string; commodities: Commodity[]; kind: SupplierKind; contactEmail?: string }) =>
      api.post<SupplierDetail>("/suppliers", body),
    onSuccess: (s) => {
      toast.success(`${s.name} added`);
      return inv(["suppliers"], qk.dashboard);
    },
    onError,
  });
}

export function usePortalLink() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (supplierId: string) => api.post<{ url: string; expiresAt: string }>(`/suppliers/${supplierId}/portal-link`),
    onSuccess: (_d, id) => inv(qk.supplier(id)),
    onError,
  });
}

/* ── Plots ──────────────────────────────────────────────────────────────── */
export const usePlots = (f?: PlotFilters) =>
  useQuery({ queryKey: qk.plots(plotQuery(f)), queryFn: () => api.get<PlotListItem[]>("/plots", plotQuery(f)) });

export const usePlotsMap = (f?: PlotFilters) =>
  useQuery({
    queryKey: qk.plotsMap(plotQuery(f)),
    queryFn: () => api.get<PlotFeatureCollection>("/plots/map", plotQuery(f)),
  });

export const usePlot = (id: string) => useQuery({ queryKey: qk.plot(id), queryFn: () => api.get<Plot>(`/plots/${id}`) });
export const useAssessments = (id: string) =>
  useQuery({ queryKey: qk.assessments(id), queryFn: () => api.get<Assessment[]>(`/plots/${id}/assessments`) });
export const useSimilarPlots = (id: string) =>
  useQuery({ queryKey: qk.similar(id), queryFn: () => api.get<SimilarPlot[]>(`/plots/${id}/similar`, { k: 6 }) });
export const useReviews = (enabled = true) =>
  useQuery({ queryKey: qk.reviews, queryFn: () => api.get<PlotListItem[]>("/reviews"), enabled });

export function useAssessPlot(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<Assessment>(`/plots/${id}/assess`),
    onSuccess: () => {
      toast.success("Check complete. Results updated.");
      return inv(qk.plot(id), qk.assessments(id), ["plots"], qk.reviews, qk.dashboard);
    },
    onError,
  });
}

export function useReviewPlot(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { decision: ReviewDecision; note: string }) => api.post<Assessment>(`/plots/${id}/review`, body),
    onSuccess: (_a, v) => {
      toast.success(
        v.decision === "request_information"
          ? "Request for information sent to the supplier"
          : v.decision === "confirm_compliant"
            ? "Plot confirmed as compliant"
            : "Plot confirmed as non-compliant",
      );
      return inv(qk.plot(id), qk.assessments(id), ["plots"], qk.reviews, qk.dashboard);
    },
    onError,
  });
}

export function useValidatePlot() {
  return useMutation({
    mutationFn: (body: { geometry: Geometry; country: string; declaredAreaHa?: number }) =>
      api.post<ValidationResult>("/plots/validate", body),
  });
}

export function useCreatePlot() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      supplierId: string;
      reference: string;
      commodity: Commodity;
      country: string;
      geometry: Geometry;
      declaredAreaHa?: number;
      producerName?: string;
    }) => api.post<Plot>("/plots", body),
    onSuccess: (p, v) => {
      toast.success(`Plot ${p.reference} added and sent for checking`);
      return inv(qk.supplier(v.supplierId), ["plots"], ["suppliers"], qk.reviews, qk.dashboard);
    },
  });
}

export function useImportPlots() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ file, supplierId, commodity }: { file: File; supplierId: string; commodity: Commodity }) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("supplierId", supplierId);
      fd.set("commodity", commodity);
      return api.upload<ImportResult>("/plots/import", fd);
    },
    onSuccess: (_r, v) => inv(qk.supplier(v.supplierId), ["plots"], ["suppliers"], qk.dashboard),
    onError,
  });
}

/* ── Products & shipments ───────────────────────────────────────────────── */
export const useProducts = () => useQuery({ queryKey: qk.products, queryFn: () => api.get<Product[]>("/products") });
export const useShipments = (status?: string) =>
  useQuery({ queryKey: qk.shipments(status), queryFn: () => api.get<ShipmentListItem[]>("/shipments", { status }) });
export const useShipment = (id: string) =>
  useQuery({ queryKey: qk.shipment(id), queryFn: () => api.get<Shipment>(`/shipments/${id}`) });
export const useTrace = (id: string) => useQuery({ queryKey: qk.trace(id), queryFn: () => api.get<Trace>(`/shipments/${id}/trace`) });

export function useCreateShipment() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: {
      reference: string;
      productId: string;
      quantityKg: number;
      harvestYear: number;
      allocations: { plotId: string; quantityKg: number }[];
    }) => api.post<Shipment>("/shipments", body),
    onSuccess: (s) => {
      toast.success(`Shipment ${s.reference} created`);
      return inv(["shipments"], qk.dashboard);
    },
    onError,
  });
}

export function useCreateDds() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (shipmentId: string) => api.post<Dds>(`/shipments/${shipmentId}/dds`),
    onSuccess: (_d, shipmentId) => {
      toast.success("Due diligence statement prepared");
      return inv(qk.ddsList, qk.shipment(shipmentId), ["shipments"]);
    },
    onError,
  });
}

/* ── Due diligence statements ───────────────────────────────────────────── */
export const useDdsList = () => useQuery({ queryKey: qk.ddsList, queryFn: () => api.get<DdsListItem[]>("/dds") });
export const useDds = (id: string) => useQuery({ queryKey: qk.dds(id), queryFn: () => api.get<Dds>(`/dds/${id}`) });

export function useSubmitDds(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<Dds>(`/dds/${id}/submit`),
    onSuccess: () => {
      toast.success("Statement submitted (demo submission)");
      return inv(qk.dds(id), qk.ddsList, ["shipments"], ["shipment"], qk.dashboard);
    },
    onError,
  });
}

/* ── Campaigns ──────────────────────────────────────────────────────────── */
export const useCampaigns = () => useQuery({ queryKey: qk.campaigns, queryFn: () => api.get<CampaignListItem[]>("/campaigns") });
export const useCampaign = (id: string) =>
  useQuery({ queryKey: qk.campaign(id), queryFn: () => api.get<Campaign>(`/campaigns/${id}`), refetchInterval: 30_000 });

export function useCreateCampaign() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; commodity: Commodity; supplierIds: string[]; dueDate: string; reminderEveryDays: number }) =>
      api.post<Campaign>("/campaigns", body),
    onSuccess: (c) => {
      toast.success(`Campaign “${c.name}” started`);
      return inv(qk.campaigns);
    },
    onError,
  });
}

export function useCampaignDecision(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ supplierId, approve, note }: { supplierId: string; approve: boolean; note: string }) =>
      api.post<unknown>(`/campaigns/${id}/suppliers/${supplierId}/decision`, { approve, note }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Submission approved" : "Changes requested from the supplier");
      return inv(qk.campaign(id), qk.campaigns);
    },
    onError,
  });
}

export function useRemindSupplier(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (supplierId: string) => api.post<unknown>(`/campaigns/${id}/suppliers/${supplierId}/remind`),
    onSuccess: () => {
      toast.success("Reminder sent");
      return inv(qk.campaign(id));
    },
    onError,
  });
}

export function useCancelCampaign(id: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/campaigns/${id}/cancel`),
    onSuccess: () => {
      toast.success("Campaign stopped");
      return inv(qk.campaign(id), qk.campaigns);
    },
    onError,
  });
}

/**
 * Live campaign progress: listens to the server-sent event stream and refetches on every update.
 * Reconnects after a short pause (refreshing the session once if needed); the 30 s poll covers any gap.
 */
export function useCampaignEvents(id: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let failures = 0;

    const connect = () => {
      if (closed) return;
      es = new EventSource(`${API_BASE}/campaigns/${id}/events`, { withCredentials: true });
      es.addEventListener("open", () => {
        failures = 0;
      });
      es.addEventListener("campaign.updated", () => {
        void qc.invalidateQueries({ queryKey: qk.campaign(id) });
        void qc.invalidateQueries({ queryKey: qk.campaigns });
      });
      es.addEventListener("error", () => {
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          failures += 1;
          if (failures > 6) return;
          timer = setTimeout(async () => {
            await tryRefresh();
            connect();
          }, Math.min(30_000, 2_000 * failures));
        }
      });
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [id, qc]);
}

/* ── Supplier portal (public, token in the URL) ─────────────────────────── */
export const usePortal = (token: string) =>
  useQuery({ queryKey: qk.portal(token), queryFn: () => api.get<Portal>(`/portal/${token}`), retry: false });

export function usePortalValidate(token: string) {
  return useMutation({
    mutationFn: (body: { geometry: Geometry; country: string; declaredAreaHa?: number }) =>
      api.post<ValidationResult>(`/portal/${token}/plots/validate`, body),
  });
}

export function usePortalCreatePlot(token: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (body: { reference: string; commodity: Commodity; geometry: Geometry; declaredAreaHa?: number }) =>
      api.post<PlotListItem>(`/portal/${token}/plots`, body),
    onSuccess: (p) => {
      toast.success(`Plot ${p.reference} saved`);
      return inv(qk.portal(token));
    },
    onError,
  });
}

export function usePortalImport(token: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ file, commodity }: { file: File; commodity: Commodity }) => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("commodity", commodity);
      return api.upload<ImportResult>(`/portal/${token}/plots/import`, fd);
    },
    onSuccess: () => inv(qk.portal(token)),
    onError,
  });
}

export function usePortalDeletePlot(token: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (plotId: string) => api.del<void>(`/portal/${token}/plots/${plotId}`),
    onSuccess: () => {
      toast.success("Plot removed");
      return inv(qk.portal(token));
    },
    onError,
  });
}

export function usePortalSubmit(token: string) {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<unknown>(`/portal/${token}/submit`),
    onSuccess: () => {
      toast.success("Thank you. Your plots were sent for review.");
      return inv(qk.portal(token));
    },
    onError,
  });
}

/* ── Reference data, audit, notifications ───────────────────────────────── */
export const useCountries = () =>
  useQuery({ queryKey: qk.countries, queryFn: () => api.get<Country[]>("/countries"), staleTime: 60 * 60_000 });

export const useAudit = (action?: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.audit(action),
    enabled,
    initialPageParam: null as string | number | null,
    queryFn: ({ pageParam }) => api.get<AuditPage>("/audit", { limit: 50, before: pageParam ?? undefined, action }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

export function useAuditVerify() {
  return useMutation({ mutationFn: () => api.get<AuditVerify>("/audit/verify"), onError });
}

export const useNotifications = (enabled = true) =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.get<NotificationItem[]>("/notifications"),
    enabled,
    refetchInterval: 60_000,
  });

export function useReadAllNotifications() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => api.post<void>("/notifications/read-all"), onSuccess: () => inv(qk.notifications) });
}
