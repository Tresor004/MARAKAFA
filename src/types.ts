export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  barcode?: string;
  expiryDate?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  items: SaleItem[];
  total: number;
  paid: number;
  change: number;
  customerId?: string;
  customerName?: string;
  userId: string;
  userName: string;
  date: string;
  paymentMethod: string;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Purchase {
  id: string;
  items: PurchaseItem[];
  total: number;
  supplierId: string;
  supplierName: string;
  date: string;
  reference?: string;
  managerName?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalPurchases: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[]; // NavKey[]
  isSystem?: boolean;    // non supprimable (rôles seed)
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string; // id du rôle (Role.id)
  password?: string;
  avatar?: string; // base64 data-url
  active: boolean;
  createdAt: string;
  lastSeen?: number; // timestamp (ms) de dernière activité
}

export interface Loss {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason: string;
  date: string;
  notedBy: string;
}

export interface InventoryCount {
  id: string;
  productId: string;
  productName: string;
  expected: number;
  actual: number;
  difference: number;
  date: string;
  period: string;
}

/** Types d'opérations exécutables après validation admin */
export type ActionKind =
  | "product.add" | "product.update" | "product.delete"
  | "customer.add" | "customer.update" | "customer.delete"
  | "supplier.add" | "supplier.update" | "supplier.delete"
  | "user.add" | "user.update" | "user.delete"
  | "loss.add" | "loss.delete"
  | "stock.adjust"
  | "inventory.do"
  | "purchase.add" | "purchase.update" | "purchase.delete"
  | "profile.update";

export interface PendingAction {
  id: string;
  kind: ActionKind;
  module: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedByName: string;
  date: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedDate?: string;
  rejectReason?: string;
}

export interface AppNotification {
  id: string;
  userId: string;           // destinataire ("*" = tous les employés)
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  date: number;             // timestamp ms
  read: boolean;
  scope: "personal" | "general";
  triggeredById?: string;   // id de l'émetteur (ou "system" si automatique)
  triggeredByName?: string; // nom de l'émetteur lisible
  targetPage?: string;      // clé de navigation NavKey (ex: "stock", "products", "myspace")
  targetId?: string;        // identifiant de l'objet concerné (id produit, etc.)
}

export interface ShopSettings {
  name: string;
  type: string;
  logo: string; // base64 data-url or empty
  slogan: string;
  ifu: string;
  rccm: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  currencyCode: string;
  taxRate: number; // percentage, e.g. 18
  invoicePrefix: string;
  invoiceFooter: string;
  thankYouMessage: string;
}
