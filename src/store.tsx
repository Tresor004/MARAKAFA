import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Product, Sale, Purchase, Customer, Supplier, User, Loss, InventoryCount, SaleItem, PurchaseItem, Role, ShopSettings, PendingAction, ActionKind, AppNotification } from "./types";
import { seedProducts, seedCustomers, seedSuppliers, seedUsers, seedSales, seedPurchases, seedLosses, seedInventory, seedRoles } from "./seedData";
import { NavKey } from "./components/nav";

export const DEFAULT_SETTINGS: ShopSettings = {
  name: "Hi-Market",
  type: "Supermarché",
  logo: "",
  slogan: "Votre supermarché de confiance",
  ifu: "",
  rccm: "",
  phone: "",
  phone2: "",
  email: "",
  website: "",
  address: "",
  city: "",
  country: "",
  currency: "FCFA",
  currencyCode: "XOF",
  taxRate: 0,
  invoicePrefix: "FAC",
  invoiceFooter: "",
  thankYouMessage: "Merci pour votre visite ! À bientôt.",
};

interface StoreContextType {
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  suppliers: Supplier[];
  users: User[];
  losses: Loss[];
  inventory: InventoryCount[];
  roles: Role[];
  shopSettings: ShopSettings;
  currentUser: User | null;
  currentUserRole: Role | undefined;
  canAccess: (key: NavKey) => boolean;
  roleName: (roleId: string) => string;
  isAdmin: boolean;
  login: (email: string, password: string) => { ok: boolean; error?: string };
  logout: () => void;
  isLoggedIn: boolean;

  pendingActions: PendingAction[];
  pendingCount: number;
  approveAction: (id: string) => void;
  rejectAction: (id: string, reason: string) => void;
  /** Exécute directement si admin, sinon crée une demande en attente. Retourne true si exécuté immédiatement. */
  requestOrExec: (meta: { kind: ActionKind; module: string; action: string; description: string; details?: Record<string, unknown>; payload: Record<string, unknown> }) => boolean;

  notifications: AppNotification[];
  myNotifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  notifyAll: (title: string, message: string, type?: AppNotification["type"], byId?: string, byName?: string, targetPage?: string, targetId?: string) => void;
  updateProfile: (data: { name?: string; email?: string; password?: string; avatar?: string }) => Promise<boolean>;
  makeAvatarPreview: (dataUrl: string, maxSize?: number) => Promise<string>;
  onlineUsers: string[];

  addProduct: (p: Omit<Product, "id">) => void;
  updateProduct: (id: string, p: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  addSale: (items: SaleItem[], customerId?: string, customerName?: string, paymentMethod?: string, paid?: number) => Sale;

  addPurchase: (items: PurchaseItem[], supplierId: string, supplierName: string) => Purchase;
  updatePurchase: (id: string, p: Partial<Purchase>) => void;
  deletePurchase: (id: string) => void;

  addCustomer: (c: Omit<Customer, "id" | "totalPurchases" | "createdAt">) => void;
  updateCustomer: (id: string, c: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;

  addSupplier: (s: Omit<Supplier, "id">) => void;
  updateSupplier: (id: string, s: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;

  addUser: (u: Omit<User, "id" | "createdAt">) => void;
  updateUser: (id: string, u: Partial<User>) => void;
  deleteUser: (id: string) => void;

  addRole: (r: Omit<Role, "id" | "createdAt">) => Role;
  updateRole: (id: string, r: Partial<Role>) => void;
  deleteRole: (id: string) => void;

  addLoss: (l: Omit<Loss, "id">) => void;
  deleteLoss: (id: string) => void;

  doInventory: (counts: { productId: string; productName: string; expected: number; actual: number }[], period: string) => void;

  adjustStock: (productId: string, delta: number) => void;

  updateShopSettings: (s: Partial<ShopSettings>) => void;

  categories: string[];
  addCategory: (name: string) => void;
  deleteCategory: (name: string) => void;
  renameCategory: (oldName: string, newName: string) => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(() => loadState("hm_products", seedProducts));
  const [sales, setSales] = useState<Sale[]>(() => loadState("hm_sales", seedSales));
  const [purchases, setPurchases] = useState<Purchase[]>(() => loadState("hm_purchases", seedPurchases));
  const [customers, setCustomers] = useState<Customer[]>(() => loadState("hm_customers", seedCustomers));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadState("hm_suppliers", seedSuppliers));
  const [users, setUsers] = useState<User[]>(() => {
    const loaded = loadState<User[]>("hm_users", seedUsers);
    // Migration douce : garantir un mot de passe pour chaque employé existant
    return loaded.map(u => {
      if (u.password) return u;
      const stem = (u.email?.split("@")[0] || u.name.toLowerCase().replace(/\s+/g, "") || "user").slice(0, 12);
      return { ...u, password: stem + "123" };
    });
  });
  const [losses, setLosses] = useState<Loss[]>(() => loadState("hm_losses", seedLosses));
  const [inventory, setInventory] = useState<InventoryCount[]>(() => loadState("hm_inventory", seedInventory));
  const [roles, setRoles] = useState<Role[]>(() => loadState("hm_roles", seedRoles));
  const [shopSettings, setShopSettings] = useState<ShopSettings>(() => ({ ...DEFAULT_SETTINGS, ...loadState<Partial<ShopSettings>>("hm_settings", {}) }));
  const defaultCategories = ["Epicerie", "Boissons", "Laitier", "Boulangerie", "Hygiène", "Frais", "Divers"];
  const [categories, setCategories] = useState<string[]>(() => {
    const stored = loadState<string[]>("hm_categories", []);
    if (stored.length > 0) return stored;
    // Bootstrap from existing products + defaults
    const fromProducts = Array.from(new Set(products.map(p => p.category))).filter(Boolean);
    const merged = Array.from(new Set([...defaultCategories, ...fromProducts]));
    return merged.sort((a, b) => a.localeCompare(b, "fr"));
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => loadState<string | null>("hm_currentUser", null));
  const currentUser = users.find(u => u.id === currentUserId) || null;
  const currentUserRole = currentUser ? roles.find(r => r.id === currentUser.role) : undefined;
  const isAdmin = currentUser?.role === "admin";
  useEffect(() => { localStorage.setItem("hm_currentUser", JSON.stringify(currentUserId)); }, [currentUserId]);

  const [pendingActions, setPendingActions] = useState<PendingAction[]>(() => loadState<PendingAction[]>("hm_pending", []));
  useEffect(() => { localStorage.setItem("hm_pending", JSON.stringify(pendingActions)); }, [pendingActions]);
  const pendingCount = pendingActions.filter(a => a.status === "pending").length;

  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadState<AppNotification[]>("hm_notifs", []));
  useEffect(() => { localStorage.setItem("hm_notifs", JSON.stringify(notifications)); }, [notifications]);

  // Crée une notification avec navigation ciblée
  const pushNotif = (
    userId: string,
    title: string,
    message: string,
    type: AppNotification["type"],
    scope: AppNotification["scope"],
    triggeredById = "system",
    triggeredByName = "Système",
    targetPage?: string,
    targetId?: string,
  ) => {
    const n: AppNotification = {
      id: uid("n"), userId, title, message, type,
      date: Date.now(), read: false, scope,
      triggeredById, triggeredByName,
      targetPage, targetId,
    };
    setNotifications(ns => [n, ...ns].slice(0, 500));
  };

  // Notifie tous les employés (scope général) avec page cible optionnelle
  const notifyAll = (
    title: string,
    message: string,
    type: AppNotification["type"] = "info",
    byId = "system",
    byName = "Système",
    targetPage?: string,
    targetId?: string,
  ) => pushNotif("*", title, message, type, "general", byId, byName, targetPage, targetId);

  const myNotifications = notifications.filter(n => n.userId === "*" || n.userId === currentUserId);
  const unreadCount = myNotifications.filter(n => !n.read).length;
  const markAllRead = () => setNotifications(ns => ns.map(n => (n.userId === "*" || n.userId === currentUserId) ? { ...n, read: true } : n));
  const markRead = (id: string) => setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));

  useEffect(() => { localStorage.setItem("hm_products", JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem("hm_sales", JSON.stringify(sales)); }, [sales]);
  useEffect(() => { localStorage.setItem("hm_purchases", JSON.stringify(purchases)); }, [purchases]);
  useEffect(() => { localStorage.setItem("hm_customers", JSON.stringify(customers)); }, [customers]);
  useEffect(() => { localStorage.setItem("hm_suppliers", JSON.stringify(suppliers)); }, [suppliers]);
  useEffect(() => { localStorage.setItem("hm_users", JSON.stringify(users)); }, [users]);
  useEffect(() => { localStorage.setItem("hm_losses", JSON.stringify(losses)); }, [losses]);
  useEffect(() => { localStorage.setItem("hm_inventory", JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem("hm_roles", JSON.stringify(roles)); }, [roles]);
  useEffect(() => { localStorage.setItem("hm_settings", JSON.stringify(shopSettings)); }, [shopSettings]);
  useEffect(() => { localStorage.setItem("hm_categories", JSON.stringify(categories)); }, [categories]);

  // Détection automatique des produits périmés → NOTIFICATION uniquement aux utilisateurs ayant accès au module pertes
  // Le système n'enregistre PAS lui-même la perte (règle 6)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const expired = products.filter(p => p.stock > 0 && p.expiryDate && p.expiryDate < today);
    if (expired.length === 0) return;
    const names = expired.map(p => p.name).join(", ");
    // Notifie uniquement les employés ayant accès au module "losses"
    const lossUsers = users.filter(u => {
      const role = roles.find(r => r.id === u.role);
      return role?.permissions?.includes("losses");
    });
    lossUsers.forEach(u => {
      pushNotif(
        u.id,
        "Produits périmés détectés",
        `${expired.length} produit(s) périmé(s) nécessite(nt) une déclaration de perte : ${names}. Veuillez déclarer ces pertes manuellement dans le module Pertes & Péremptions.`,
        "warning",
        "personal",
        "system",
        "Système"
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canAccess = (key: NavKey): boolean => {
    if (!currentUserRole) return true; // fallback : si rôle inconnu, on ne verrouille pas (sécurité anti-lockout)
    return currentUserRole.permissions.includes(key);
  };
  const roleName = (roleId: string): string => roles.find(r => r.id === roleId)?.name || roleId;

  const addProduct = (p: Omit<Product, "id">) => setProducts(ps => [...ps, { ...p, id: uid("p") }]);
  const updateProduct = (id: string, p: Partial<Product>) => setProducts(ps => ps.map(x => x.id === id ? { ...x, ...p } : x));
  const deleteProduct = (id: string) => setProducts(ps => ps.filter(x => x.id !== id));

  const addSale = (items: SaleItem[], customerId?: string, customerName?: string, paymentMethod = "Espèces", paidOverride?: number): Sale => {
    const total = items.reduce((a, b) => a + b.total, 0);
    const paid = paidOverride ?? total;
    const change = Math.max(paid - total, 0);
    const newSale: Sale = {
      id: uid("v"),
      invoiceNo: "FAC-" + new Date().getFullYear() + "-" + String(sales.length + 1).padStart(4, "0"),
      items, total, paid, change,
      customerId, customerName,
      userId: currentUser?.id || "", userName: currentUser?.name || "",
      date: new Date().toISOString().slice(0, 10),
      paymentMethod
    };
    setSales(s => [newSale, ...s]);
    setProducts(ps => ps.map(p => {
      const item = items.find(i => i.productId === p.id);
      return item ? { ...p, stock: Math.max(p.stock - item.quantity, 0) } : p;
    }));
    if (customerId) {
      setCustomers(cs => cs.map(c => c.id === customerId ? { ...c, totalPurchases: c.totalPurchases + total } : c));
    }
    return newSale;
  };

  const addPurchase = (items: PurchaseItem[], supplierId: string, supplierName: string): Purchase => {
    const total = items.reduce((a, b) => a + b.total, 0);
    const ref = "BA-" + new Date().getFullYear() + "-" + String(purchases.length + 1).padStart(4, "0");
    const newPurchase: Purchase = { id: uid("a"), items, total, supplierId, supplierName, reference: ref, date: new Date().toISOString().slice(0, 10), managerName: currentUser?.name || "" };
    setPurchases(a => [newPurchase, ...a]);
    setProducts(ps => {
      const updated = [...ps];
      items.forEach(item => {
        const idx = updated.findIndex(p => p.id === item.productId);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], stock: updated[idx].stock + item.quantity, cost: item.price };
        } else {
          updated.push({
            id: uid("p"), name: item.name, category: "Divers", price: Math.round(item.price * 1.3),
            cost: item.price, stock: item.quantity, minStock: 5, unit: "pièce"
          });
        }
      });
      return updated;
    });
    return newPurchase;
  };
  const updatePurchase = (id: string, p: Partial<Purchase>) => setPurchases(ps => ps.map(x => x.id === id ? { ...x, ...p } : x));
  const deletePurchase = (id: string) => setPurchases(ps => ps.filter(x => x.id !== id));

  const addCustomer = (c: Omit<Customer, "id" | "totalPurchases" | "createdAt">) =>
    setCustomers(cs => [...cs, { ...c, id: uid("c"), totalPurchases: 0, createdAt: new Date().toISOString().slice(0, 10) }]);
  const updateCustomer = (id: string, c: Partial<Customer>) => setCustomers(cs => cs.map(x => x.id === id ? { ...x, ...c } : x));
  const deleteCustomer = (id: string) => setCustomers(cs => cs.filter(x => x.id !== id));

  const addSupplier = (s: Omit<Supplier, "id">) => setSuppliers(ss => [...ss, { ...s, id: uid("s") }]);
  const updateSupplier = (id: string, s: Partial<Supplier>) => setSuppliers(ss => ss.map(x => x.id === id ? { ...x, ...s } : x));
  const deleteSupplier = (id: string) => setSuppliers(ss => ss.filter(x => x.id !== id));

  const addUser = (u: Omit<User, "id" | "createdAt">) => setUsers(us => [...us, { ...u, id: uid("u"), createdAt: new Date().toISOString().slice(0, 10) }]);
  const updateUser = (id: string, u: Partial<User>) => setUsers(us => us.map(x => x.id === id ? { ...x, ...u } : x));
  const deleteUser = (id: string) => setUsers(us => us.filter(x => x.id !== id));

  const addRole = (r: Omit<Role, "id" | "createdAt">): Role => {
    const newRole: Role = { ...r, id: uid("r"), createdAt: new Date().toISOString().slice(0, 10) };
    setRoles(rs => [...rs, newRole]);
    return newRole;
  };
  const updateRole = (id: string, r: Partial<Role>) => setRoles(rs => rs.map(x => x.id === id ? { ...x, ...r } : x));
  const deleteRole = (id: string) => setRoles(rs => rs.filter(x => x.id !== id));

  const addLoss = (l: Omit<Loss, "id">) => {
    setLosses(ls => [{ ...l, id: uid("pe") }, ...ls]);
    setProducts(ps => ps.map(p => p.id === l.productId ? { ...p, stock: Math.max(p.stock - l.quantity, 0) } : p));
  };
  const deleteLoss = (id: string) => setLosses(ls => ls.filter(x => x.id !== id));

  const doInventory = (counts: { productId: string; productName: string; expected: number; actual: number }[], period: string) => {
    const date = new Date().toISOString().slice(0, 10);
    const entries: InventoryCount[] = counts.map(c => ({
      id: uid("i"), productId: c.productId, productName: c.productName,
      expected: c.expected, actual: c.actual, difference: c.actual - c.expected, date, period
    }));
    setInventory(inv => [...entries, ...inv]);
    entries.forEach(e => {
      setProducts(ps => ps.map(p => p.id === e.productId ? { ...p, stock: e.actual } : p));
    });
  };

  const adjustStock = (productId: string, delta: number) => setProducts(ps => ps.map(p => p.id === productId ? { ...p, stock: Math.max(p.stock + delta, 0) } : p));

  const updateShopSettings = (s: Partial<ShopSettings>) => setShopSettings(prev => ({ ...prev, ...s }));

  const login = (identifier: string, password: string): { ok: boolean; error?: string } => {
    const q = identifier.trim().toLowerCase();
    const user = users.find(u =>
      u.email.toLowerCase() === q ||
      u.name.toLowerCase() === q ||
      (u.phone || "").replace(/\s/g, "") === q.replace(/\s/g, "")
    );
    if (!user) return { ok: false, error: "Identifiant introuvable. Vérifiez votre email, nom ou numéro de téléphone." };
    if (user.password !== password) return { ok: false, error: "Mot de passe incorrect." };
    if (!user.active) return { ok: false, error: "Ce compte est désactivé. Contactez l'administrateur." };
    setCurrentUserId(user.id);
    // Mettre à jour lastSeen
    setUsers(us => us.map(u => u.id === user.id ? { ...u, lastSeen: Date.now() } : u));
    return { ok: true };
  };
  const logout = () => { setCurrentUserId(null); localStorage.removeItem("hm_currentUser"); };
  const isLoggedIn = !!currentUser;

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories(cs => {
      if (cs.some(c => c.toLowerCase() === trimmed.toLowerCase())) return cs;
      return [...cs, trimmed].sort((a, b) => a.localeCompare(b, "fr"));
    });
  };
  const deleteCategory = (name: string) => setCategories(cs => cs.filter(c => c !== name));
  const renameCategory = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setCategories(cs => cs.map(c => c === oldName ? trimmed : c).sort((a, b) => a.localeCompare(b, "fr")));
    setProducts(ps => ps.map(p => p.category === oldName ? { ...p, category: trimmed } : p));
  };

  // ---------- Exécuteur des actions validées ----------
  const executeKind = (kind: ActionKind, payload: Record<string, unknown>) => {
    const p = payload as never;
    switch (kind) {
      case "product.add": addProduct(payload as unknown as Omit<Product, "id">); break;
      case "product.update": updateProduct((payload as { id: string }).id, (payload as { data: Partial<Product> }).data); break;
      case "product.delete": deleteProduct((payload as { id: string }).id); break;
      case "customer.add": addCustomer(payload as unknown as Omit<Customer, "id" | "totalPurchases" | "createdAt">); break;
      case "customer.update": updateCustomer((payload as { id: string }).id, (payload as { data: Partial<Customer> }).data); break;
      case "customer.delete": deleteCustomer((payload as { id: string }).id); break;
      case "supplier.add": addSupplier(payload as unknown as Omit<Supplier, "id">); break;
      case "supplier.update": updateSupplier((payload as { id: string }).id, (payload as { data: Partial<Supplier> }).data); break;
      case "supplier.delete": deleteSupplier((payload as { id: string }).id); break;
      case "user.add": addUser(payload as unknown as Omit<User, "id" | "createdAt">); break;
      case "user.update": updateUser((payload as { id: string }).id, (payload as { data: Partial<User> }).data); break;
      case "user.delete": deleteUser((payload as { id: string }).id); break;
      case "loss.add": addLoss(payload as unknown as Omit<Loss, "id">); break;
      case "loss.delete": deleteLoss((payload as { id: string }).id); break;
      case "stock.adjust": adjustStock((payload as { productId: string }).productId, (payload as { delta: number }).delta); break;
      case "inventory.do": doInventory((payload as { counts: { productId: string; productName: string; expected: number; actual: number }[] }).counts, (payload as { period: string }).period); break;
      case "purchase.add": addPurchase((payload as { items: PurchaseItem[] }).items, (payload as { supplierId: string }).supplierId, (payload as { supplierName: string }).supplierName); break;
      case "purchase.update": updatePurchase((payload as { id: string }).id, (payload as { data: Partial<Purchase> }).data); break;
      case "purchase.delete": deletePurchase((payload as { id: string }).id); break;
      case "profile.update": updateUser((payload as { id: string }).id, (payload as { data: Partial<User> }).data); break;
    }
    void p;
  };

  // Résout la page cible selon le type d'action
  const kindToPage = (kind: ActionKind): string => {
    if (kind.startsWith("product"))   return "products";
    if (kind.startsWith("stock"))     return "stock";
    if (kind.startsWith("customer"))  return "customers";
    if (kind.startsWith("supplier"))  return "suppliers";
    if (kind.startsWith("purchase"))  return "purchases";
    if (kind.startsWith("loss"))      return "losses";
    if (kind.startsWith("inventory")) return "inventory";
    if (kind.startsWith("user"))      return "users";
    if (kind.startsWith("profile"))   return "myspace";
    return "dashboard";
  };

  const requestOrExec = (meta: {
    kind: ActionKind;
    module: string;
    action: string;
    description: string;
    details?: Record<string, unknown>;
    payload: Record<string, unknown>;
  }): boolean => {
    const adminUser = users.find(u => u.role === "admin");
    const targetPage = kindToPage(meta.kind);

    if (isAdmin) {
      executeKind(meta.kind, meta.payload);
      const generalKinds: ActionKind[] = [
        "product.add", "product.update", "product.delete",
        "customer.add", "customer.delete", "supplier.add", "supplier.delete",
        "purchase.add",
      ];
      if (generalKinds.includes(meta.kind)) {
        pushNotif("*",
          `${meta.module} — ${meta.action}`,
          `${meta.description} (par ${currentUser?.name || "Admin"}).`,
          "info", "general",
          currentUser?.id || "system", currentUser?.name || "Administrateur",
          targetPage
        );
      }

      // Notifier personnellement l'employé concerné si l'admin modifie son profil
      if ((meta.kind === "user.update") && (meta.payload as { id: string }).id) {
        const affectedId = (meta.payload as { id: string }).id;
        if (affectedId !== currentUser?.id) {
          // Admin modifie un autre utilisateur
          const changedInfo = Object.entries(meta.details || {})
            .filter(([k]) => k !== "employé" && k !== "rôle" && k !== "champs modifiés")
            .map(([k, v]) => `${k} : ${String(v)}`)
            .join(" | ");
          pushNotif(
            affectedId,
            "Votre profil a été modifié",
            `Des informations de votre compte ont été mises à jour par ${currentUser?.name}${changedInfo ? ` — ${changedInfo}` : ""}.`,
            "info", "personal",
            currentUser?.id || "system", currentUser?.name || "Administrateur",
            "myspace"
          );
        }
      }
      return true;
    }

    // Employé : crée une demande en attente
    const pa: PendingAction = {
      id: uid("pa"), kind: meta.kind, module: meta.module, action: meta.action,
      description: meta.description, details: meta.details || {}, payload: meta.payload,
      date: new Date().toISOString().slice(0, 10), status: "pending",
      requestedBy: currentUser?.id || "", requestedByName: currentUser?.name || "",
    };
    setPendingActions(ps => [pa, ...ps]);

    // Notifie l'admin → le clic l'amène dans "Mon espace > Validations"
    if (adminUser) {
      pushNotif(
        adminUser.id,
        "Nouvelle demande en attente",
        `${currentUser?.name} demande : « ${meta.action} » — ${meta.description}`,
        "warning", "personal",
        currentUser?.id || "system", currentUser?.name || "Employé",
        "myspace"  // ← l'admin sera redirigé vers Mon espace (onglet validations)
      );
    }
    return false;
  };

  const approveAction = (id: string) => {
    const pa = pendingActions.find(a => a.id === id);
    if (!pa) return;
    const targetPage = kindToPage(pa.kind);

    // 1. Exécuter l'action
    executeKind(pa.kind, pa.payload);

    // 2. Changer le statut
    setPendingActions(ps => ps.map(a => a.id === id ? {
      ...a, status: "approved",
      reviewedBy: currentUser?.id, reviewedByName: currentUser?.name,
      reviewedDate: new Date().toISOString().slice(0, 10),
    } : a));

    // 3. Notifier le demandeur → clic le renvoie sur la page modifiée
    pushNotif(
      pa.requestedBy,
      "Demande approuvée ✓",
      `Votre demande « ${pa.action} » (${pa.description}) a été approuvée et appliquée par ${currentUser?.name || "l'administrateur"}.`,
      "success", "personal",
      currentUser?.id || "system", currentUser?.name || "Administrateur",
      targetPage  // ← l'employé voit directement la page concernée
    );

    // 4. Notification générale → tous les employés, clic → page concernée
    const generalKinds: ActionKind[] = [
      "product.add", "product.update", "product.delete",
      "customer.add", "customer.delete", "supplier.add", "supplier.delete",
      "stock.adjust", "loss.add", "inventory.do", "purchase.add",
    ];
    if (generalKinds.includes(pa.kind)) {
      pushNotif("*",
        `${pa.module} — ${pa.action}`,
        `${pa.description} (demandé par ${pa.requestedByName}, approuvé par ${currentUser?.name}).`,
        "info", "general",
        currentUser?.id || "system", currentUser?.name || "Administrateur",
        targetPage
      );
    }

    // 5. Notifier personnellement l'employé concerné par une modification de compte/profil
    if (pa.kind === "user.update" || pa.kind === "profile.update") {
      const affectedUserId = (pa.payload as { id: string }).id;
      if (affectedUserId && affectedUserId !== pa.requestedBy) {
        // L'admin a modifié un autre employé — notifier cet employé
        pushNotif(
          affectedUserId,
          "Votre profil a été modifié",
          `Des informations de votre compte ont été mises à jour par ${currentUser?.name}. Consultez votre espace pour voir les détails.`,
          "info", "personal",
          currentUser?.id || "system", currentUser?.name || "Administrateur",
          "myspace"
        );
      }
      // Si c'est l'employé lui-même qui avait demandé (profile.update)
      if (pa.kind === "user.update" && affectedUserId === pa.requestedBy) {
        // La notif "approuvée" suffit
      }
    }
  };

  const rejectAction = (id: string, reason: string) => {
    const pa = pendingActions.find(a => a.id === id);
    if (!pa) return;

    setPendingActions(ps => ps.map(a => a.id === id ? {
      ...a, status: "rejected",
      reviewedBy: currentUser?.id, reviewedByName: currentUser?.name,
      reviewedDate: new Date().toISOString().slice(0, 10),
      rejectReason: reason || undefined,
    } : a));

    // Notifier le demandeur → clic renvoie vers Mon espace pour voir le motif
    pushNotif(
      pa.requestedBy,
      "Demande refusée ✗",
      `Votre demande « ${pa.action} » (${pa.description}) a été refusée par ${currentUser?.name || "l'administrateur"}${reason ? " : " + reason : "."}`,
      "error", "personal",
      currentUser?.id || "system", currentUser?.name || "Administrateur",
      "myspace"  // ← l'employé peut consulter le motif dans son espace
    );
  };

  // Réduit une image (data URL) à une petite miniature via canvas,
  // afin de pouvoir l'afficher dans les requêtes sans alourdir le stockage.
  const makeAvatarPreview = (dataUrl: string, maxSize = 220): Promise<string> =>
    new Promise((resolve) => {
      if (!dataUrl) { resolve(""); return; }
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(dataUrl); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const updateProfile = async (data: { name?: string; email?: string; password?: string; avatar?: string }): Promise<boolean> => {
    if (!currentUser) return false;
    const clean: Partial<User> = {};

    // Construire les détails lisibles des champs modifiés pour l'admin
    const changedFields: Record<string, { avant: string; après: string }> = {};
    if (data.name !== undefined && data.name !== currentUser.name) {
      clean.name = data.name;
      changedFields["Nom complet"] = { avant: currentUser.name, après: data.name };
    }
    if (data.email !== undefined && data.email !== currentUser.email) {
      clean.email = data.email;
      changedFields["Email"] = { avant: currentUser.email, après: data.email };
    }
    if (data.password) {
      clean.password = data.password;
      changedFields["Mot de passe"] = { avant: "••••••••", après: "Nouveau mot de passe défini" };
    }
    const avatarChanged = data.avatar !== undefined && data.avatar !== currentUser.avatar;
    if (avatarChanged) {
      clean.avatar = data.avatar;
      changedFields["Photo de profil"] = {
        avant: currentUser.avatar ? "Photo existante" : "Aucune photo",
        après: data.avatar ? "Nouvelle photo" : "Suppression de la photo",
      };
    }

    if (Object.keys(clean).length === 0) return true; // Rien à changer

    // L'ancienne photo (miniature) est conservée dans les détails
    // pour que l'admin puisse comparer avant/après avant de statuer.
    const avatarAvant = avatarChanged
      ? currentUser.avatar ? await makeAvatarPreview(currentUser.avatar) : ""
      : undefined;

    // Tableau des champs modifiés (hors photo, affichée séparément en comparatif)
    const changesTable = Object.entries(changedFields)
      .filter(([field]) => field !== "Photo de profil")
      .map(([field, v]) => ({ champ: field, avant: v.avant, après: v.après }));

    const details: Record<string, unknown> = {
      employé: currentUser.name,
      changes: changesTable,
    };
    if (avatarChanged) details.avatar_avant = avatarAvant ?? "";

    return requestOrExec({
      kind: "profile.update",
      module: "Profil",
      action: "Modifier mon profil",
      description: `Mise à jour du profil de ${currentUser.name}`,
      details,
      payload: { id: currentUser.id, data: clean },
    });
  };

  // ---------- Surveillance du stock critique ----------
  useEffect(() => {
    const low = products.filter(p => p.stock > 0 && p.stock <= p.minStock);
    if (low.length === 0) return;
    // Ne notifier que si la notif n'existe pas encore pour aujourd'hui (évite les doublons)
    const todayStr = new Date().toISOString().slice(0, 10);
    const alreadyNotified = notifications.some(n => n.triggeredById === "system" && n.title.includes("Stock critique") && new Date(n.date).toISOString().slice(0, 10) === todayStr);
    if (alreadyNotified) return;
    const names = low.slice(0, 5).map(p => `${p.name} (${p.stock} restant${p.stock > 1 ? "s" : ""})`).join(", ");
    pushNotif("*", "Stock critique", `${low.length} article${low.length > 1 ? "s" : ""} en stock critique : ${names}.`, "warning", "general", "system", "Système", "stock", undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Présence en ligne ----------
  useEffect(() => {
    if (!currentUserId) return;
    const ping = () => setUsers(us => us.map(u => u.id === currentUserId ? { ...u, lastSeen: Date.now() } : u));
    ping();
    const iv = setInterval(ping, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);
  const onlineUsers = users.filter(u => u.lastSeen && Date.now() - u.lastSeen < 120000).map(u => u.id);

  return (
    <StoreContext.Provider value={{
      products, sales, purchases, customers, suppliers, users, losses, inventory, roles, shopSettings, categories, currentUser, currentUserRole,
      canAccess, roleName, isAdmin,
      addProduct, updateProduct, deleteProduct, addSale, addPurchase, updatePurchase, deletePurchase,
      addCustomer, updateCustomer, deleteCustomer,
      addSupplier, updateSupplier, deleteSupplier,
      addUser, updateUser, deleteUser,
      addRole, updateRole, deleteRole,
      addLoss, deleteLoss, doInventory, adjustStock,
      updateShopSettings,
      addCategory, deleteCategory, renameCategory,
      login, logout, isLoggedIn,
      pendingActions, pendingCount, approveAction, rejectAction, requestOrExec,
      notifications, myNotifications, unreadCount, markAllRead, markRead, notifyAll, updateProfile, makeAvatarPreview, onlineUsers
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

export function fmtCurrency(n: number) {
  return new Intl.NumberFormat("fr-SN", { style: "currency", currency: "XOF", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

/** Format an ISO date string (YYYY-MM-DD) to French format (JJ/MM/AAAA) */
export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
