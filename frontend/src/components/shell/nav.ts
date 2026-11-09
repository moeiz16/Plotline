import {
  Eye,
  FileCheck,
  Handshake,
  LayoutDashboard,
  MapIcon,
  Megaphone,
  Pentagon,
  ScrollText,
  Settings,
  Ship,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/api/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: Permission;
  badge?: "reviews";
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Monitor",
    items: [
      { href: "/app", label: "Overview", icon: LayoutDashboard, perm: "dashboard:read" },
      { href: "/app/map", label: "Map", icon: MapIcon, perm: "plots:read" },
      { href: "/app/plots", label: "Plots", icon: Pentagon, perm: "plots:read" },
      { href: "/app/reviews", label: "Reviews", icon: Eye, perm: "plots:read", badge: "reviews" },
    ],
  },
  {
    group: "Supply chain",
    items: [
      { href: "/app/suppliers", label: "Suppliers", icon: Handshake, perm: "suppliers:read" },
      { href: "/app/campaigns", label: "Campaigns", icon: Megaphone, perm: "campaigns:read" },
      { href: "/app/shipments", label: "Shipments", icon: Ship, perm: "shipments:read" },
      { href: "/app/statements", label: "Statements", icon: FileCheck, perm: "dds:read" },
    ],
  },
  {
    group: "Organisation",
    items: [
      { href: "/app/audit", label: "Activity log", icon: ScrollText, perm: "audit:read" },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
