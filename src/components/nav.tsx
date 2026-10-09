import { ReactNode } from "react";
import {
  IconDashboard, IconBox, IconCart, IconTruck, IconUsers,
  IconUserShield, IconAlert, IconClipboard, IconSettings,
} from "./Icons";

export type NavKey =
  | "dashboard" | "products" | "stock" | "sales"
  | "purchases" | "customers" | "suppliers"
  | "users" | "losses" | "inventory" | "settings" | "myspace";

export interface NavItem {
  key: NavKey;
  label: string;
  icon: ReactNode;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard",  label: "Tableau de bord",     icon: <IconDashboard   size={18} /> },
  { key: "products",   label: "Produits",            icon: <IconBox         size={18} /> },
  { key: "stock",      label: "Stocks",              icon: <IconClipboard   size={18} /> },
  { key: "sales",      label: "Caisse / Ventes",     icon: <IconCart        size={18} /> },
  { key: "purchases",  label: "Achats Fournisseurs", icon: <IconTruck       size={18} /> },
  { key: "customers",  label: "Clients",             icon: <IconUsers       size={18} /> },
  { key: "suppliers",  label: "Fournisseurs",        icon: <IconTruck       size={18} /> },
  { key: "users",      label: "Employés / Rôles",     icon: <IconUserShield  size={18} /> },
  { key: "losses",     label: "Pertes & Péremptions",icon: <IconAlert       size={18} /> },
  { key: "inventory",  label: "Inventaire",          icon: <IconClipboard   size={18} /> },
  { key: "settings",   label: "Paramètres",          icon: <IconSettings    size={18} /> },
  { key: "myspace",    label: "Mon espace",           icon: <IconUserShield size={18} /> },
];

export const NAV_LABEL: Record<NavKey, string> = NAV_ITEMS.reduce(
  (acc, n) => ({ ...acc, [n.key]: n.label }),
  {} as Record<NavKey, string>
);
