/* Types mirror docs/API_CONTRACT.md (v1). camelCase on the wire. */

export type Role = "owner" | "compliance_manager" | "sourcing" | "reviewer" | "supplier" | "auditor";
export type Commodity = "cocoa" | "coffee" | "soy" | "oil_palm" | "cattle" | "rubber" | "wood";
export type Verdict = "compliant" | "needs_review" | "non_compliant" | "pending";
export type RiskTier = "low" | "standard" | "high";
export type GeometryKind = "point" | "polygon";
export type ShipmentStatus = "draft" | "blocked" | "ready" | "submitted";
export type DdsStatus = "draft" | "submitted" | "accepted" | "rejected";
export type CampaignStatus = "running" | "completed" | "cancelled";
export type CampaignStage =
  | "requested"
  | "reminded"
  | "submitted"
  | "assessing"
  | "awaiting_review"
  | "changes_requested"
  | "approved"
  | "overdue";
export type ReviewDecision = "confirm_compliant" | "confirm_non_compliant" | "request_information";
export type ChangeLevel = "low" | "elevated" | "high";
export type SupplierKind = "cooperative" | "exporter" | "farm" | "trader";

export type Permission =
  | "dashboard:read"
  | "suppliers:read"
  | "suppliers:write"
  | "plots:read"
  | "plots:write"
  | "plots:review"
  | "shipments:read"
  | "shipments:write"
  | "dds:read"
  | "dds:write"
  | "dds:submit"
  | "campaigns:read"
  | "campaigns:write"
  | "campaigns:approve"
  | "audit:read"
  | "org:admin";

export interface Problem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: { field?: string; message: string }[];
  requestId?: string;
}

/* ── Auth & org ─────────────────────────────────────────────────────────── */
export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarColor?: string | null;
  createdAt: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface Org {
  id: string;
  name: string;
  slug: string;
  eori: string | null;
  address: string | null;
  country: string | null;
  operatorSize: "large" | "sme";
  settings: { retentionYears: number; reviewAllHighRisk: boolean; autoAssess: boolean };
  deadline: { date: string; daysLeft: number };
  createdAt: string;
}

export interface Membership {
  role: Role;
  roleLabel: string;
  permissions: Permission[];
  supplierId: string | null;
}

export interface Me {
  user: User;
  activeOrg: Org | null;
  membership: Membership | null;
  orgs: OrgSummary[];
}

export interface LoginResponse {
  user: User;
  orgs: OrgSummary[];
  activeOrgId: string | null;
}

export interface Member {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  roleLabel: string;
  status: string;
  joinedAt: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface InvitePreview {
  orgName: string;
  email: string;
  role: Role;
  roleLabel: string;
  expiresAt: string;
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */
export interface VerdictCounts {
  plots: number;
  compliant: number;
  needsReview: number;
  nonCompliant: number;
  pending: number;
  readinessPct: number;
}

export interface Dashboard {
  deadline: { date: string; daysLeft: number; operatorSize: "large" | "sme" };
  kpis: {
    suppliers: number;
    suppliersReady: number;
    plots: number;
    plotsCompliant: number;
    plotsNeedsReview: number;
    plotsNonCompliant: number;
    plotsPending: number;
    areaHa: number;
    deforestedHa: number;
    shipments: number;
    shipmentsReady: number;
    shipmentsBlocked: number;
    shipmentsSubmitted: number;
    readinessPct: number;
  };
  byCommodity: (VerdictCounts & { key: string; label: string })[];
  byCountry: (VerdictCounts & { key: string; label: string; riskTier: RiskTier })[];
  bySupplier: (VerdictCounts & { id: string; name: string; country: string })[];
  plotsAtRisk: {
    id: string;
    reference: string;
    supplierName: string;
    commodity: Commodity;
    country: string;
    verdict: Verdict;
    headline: string;
    areaHa: number;
  }[];
  insights: { id: string; tone: "warning" | "positive" | "info"; title: string; body: string; href?: string | null }[];
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: number | string;
  action: string;
  label: string;
  actorName: string | null;
  createdAt: string;
}

/* ── Suppliers ──────────────────────────────────────────────────────────── */
export interface SupplierListItem {
  id: string;
  name: string;
  country: string;
  countryName: string;
  riskTier: RiskTier;
  kind: SupplierKind;
  commodities: Commodity[];
  plots: number;
  compliant: number;
  needsReview: number;
  nonCompliant: number;
  pending: number;
  readinessPct: number;
  status: "invited" | "active";
  lastSubmissionAt: string | null;
}

/** `GET /suppliers/{id}`: the list item fields, with `plots` as the supplier's plot list. */
export interface SupplierDetail extends Omit<SupplierListItem, "plots"> {
  contactEmail?: string | null;
  plots: PlotListItem[];
  createdAt?: string;
}

/* ── Plots ──────────────────────────────────────────────────────────────── */
export type Position = [number, number];
export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export interface Issue {
  code: string;
  severity: "error" | "warning";
  message: string;
  field?: string | null;
}

export interface PlotListItem {
  id: string;
  reference: string;
  supplierId: string;
  supplierName: string;
  commodity: Commodity;
  country: string;
  countryName: string;
  riskTier: RiskTier;
  kind: GeometryKind;
  areaHa: number;
  verdict: Verdict;
  headline: string | null;
  changeLevel: ChangeLevel | null;
  reviewRequired: boolean;
  assessedAt: string | null;
  centroid: Position;
}

export interface Reason {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface Assessment {
  id: string;
  plotId: string;
  verdict: Verdict;
  headline: string;
  createdAt: string;
  source: "bundled" | "live";
  reasons: Reason[];
  forest2020Ha: number | null;
  forest2020Share: number | null;
  lossAfter2020Ha: number | null;
  lossByYear: Record<string, number>;
  treeCover2000Pct: number | null;
  cloudFreeShare: number | null;
  changeScore: number | null;
  changeLevel: ChangeLevel | null;
  signalsAgree: boolean | null;
  reviewRequired: boolean;
  review: { decision: ReviewDecision; note: string; reviewerName: string; reviewedAt: string } | null;
  datasets: { forest2020: string; forestLoss: string; imagery: string; changeModel: string; rules: string };
  inputsHash: string;
  resultHash: string;
}

export interface Plot extends PlotListItem {
  geometry: Geometry;
  declaredAreaHa: number | null;
  producerName: string | null;
  h3Cell: string | null;
  validation: { valid: boolean; issues: Issue[] };
  latestAssessment: Assessment | null;
  createdAt: string;
  shipments: { id: string; reference: string; quantityKg: number }[];
}

export interface ValidationResult {
  valid: boolean;
  issues: Issue[];
  areaHa: number;
  kind: GeometryKind;
  normalized: Geometry;
}

export interface ImportResult {
  created: PlotListItem[];
  rejected: { reference: string | null; row: number | null; issues: Issue[] }[];
}

export interface SimilarPlot {
  plot: PlotListItem;
  similarity: number;
}

export interface PlotFeatureProps {
  id: string;
  reference: string;
  verdict: Verdict;
  commodity: Commodity;
  supplierName: string;
  areaHa: number;
  kind: GeometryKind;
  /** First year with forest loss after the 2020 cut-off, or null when none was recorded. */
  lossFirstYear?: number | null;
  /** Hectares of forest lost after the cut-off, per year ("2022": 2.4). */
  lossByYear?: Record<string, number>;
}

export interface PlotFeature {
  type: "Feature";
  id?: string | number;
  geometry: Geometry;
  properties: PlotFeatureProps;
}

export interface PlotFeatureCollection {
  type: "FeatureCollection";
  features: PlotFeature[];
}

export interface PlotFilters {
  supplierId?: string;
  verdict?: Verdict | "";
  country?: string;
  commodity?: Commodity | "";
  q?: string;
}

/* ── Products & shipments ───────────────────────────────────────────────── */
export interface Product {
  id: string;
  name: string;
  commodity: Commodity;
  hsCode: string;
  description: string | null;
}

export interface ShipmentListItem {
  id: string;
  reference: string;
  productName: string;
  commodity: Commodity;
  hsCode: string;
  quantityKg: number;
  harvestYear: number;
  status: ShipmentStatus;
  suppliers: number;
  plots: number;
  issues: number;
  riskTier: RiskTier;
  ddsId: string | null;
  ddsStatus: DdsStatus | null;
  updatedAt: string;
}

export interface Check {
  code: string;
  status: "pass" | "warn" | "fail";
  label: string;
  detail: string;
}

export interface Shipment extends ShipmentListItem {
  allocations: {
    plotId: string;
    reference: string;
    supplierName: string;
    country: string;
    verdict: Verdict;
    quantityKg: number;
    areaHa: number;
  }[];
  checks: Check[];
  massBalance: { plotId: string; reference: string; allocatedKg: number; capacityKg: number; utilisationPct: number; ok: boolean }[];
  mixing: { mixed: boolean; verifiedKg: number; unverifiedKg: number };
  countries: { code: string; name: string; riskTier: RiskTier }[];
}

export interface TraceNode {
  id: string;
  type: "product" | "shipment" | "supplier" | "plot";
  label: string;
  verdict?: Verdict | null;
}

export interface Trace {
  nodes: TraceNode[];
  edges: { source: string; target: string; quantityKg?: number | null }[];
}

/* ── Due diligence statements ───────────────────────────────────────────── */
export interface DdsListItem {
  id: string;
  internalRef: string;
  shipmentId: string;
  shipmentReference: string;
  status: DdsStatus;
  referenceNumber: string | null;
  verificationNumber: string | null;
  createdAt: string;
  submittedAt: string | null;
}

export interface Dds extends DdsListItem {
  payload: unknown;
  summary: string;
  submissions: { id: string; at: string; status: string; message: string; referenceNumber: string | null }[];
}

/* ── Campaigns ──────────────────────────────────────────────────────────── */
export interface CampaignListItem {
  id: string;
  name: string;
  commodity: Commodity;
  status: CampaignStatus;
  dueDate: string;
  suppliers: number;
  approved: number;
  awaitingReview: number;
  overdue: number;
  progressPct: number;
  createdAt: string;
}

export interface CampaignMember {
  supplierId: string;
  supplierName: string;
  country: string;
  stage: CampaignStage;
  remindersSent: number;
  plotsSubmitted: number;
  verdictSummary: { compliant: number; needsReview: number; nonCompliant: number };
  lastEventAt: string | null;
  portalUrl: string | null;
}

export interface Campaign extends CampaignListItem {
  engineOnline: boolean;
  reminderEveryDays: number;
  members: CampaignMember[];
  timeline: { at: string; supplierName: string | null; kind: string; message: string }[];
}

/* ── Supplier portal ────────────────────────────────────────────────────── */
export interface Portal {
  orgName: string;
  supplierName: string;
  country: string;
  commodities: Commodity[];
  dueDate: string | null;
  campaignName: string | null;
  status: string;
  plots: PlotListItem[];
  submittedAt: string | null;
}

/* ── Reference, audit, notifications ────────────────────────────────────── */
export interface Country {
  code: string;
  name: string;
  riskTier: RiskTier;
  commodities: string[];
}

export interface AuditEntry {
  id: number | string;
  action: string;
  label: string;
  actorName: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextBefore: number | string | null;
}

export interface AuditVerify {
  valid: boolean;
  checked: number;
  brokenAt: number | string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
