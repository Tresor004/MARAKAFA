import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { Product, Sale, Purchase, Customer, Supplier, User, Loss, InventoryCount, Role, ShopSettings, PendingAction, ActionKind, AppNotification, Promotion, CashSession } from "./types";
import { NavKey } from "./components/nav";
import { api, ApiError, errMsg, getToken, setToken, setUnauthorizedHandler } from "./api";
import { useToast } from "./components/ui";

/**
 * Store Hi-Market — cache de l'API.
 *
 * Toutes les données métier viennent du serveur Laravel (aucune donnée n'est persistée dans le navigateur,
 * hormis le jeton de session). Les écritures sont asynchrones ; après chaque écriture, les ressources
 * concernées sont rechargées depuis l'API (le serveur est la seule source de vérité : stocks, totaux, numéros).
 */

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
  maxDiscountPercent: 10,
  requireCashSession: false,
  allowCredit: true,
};

/** done = exécuté ; pending = demande envoyée à l'administrateur ; error = refusé par le serveur (message déjà affiché) */
export type ActionResult = "done" | "pending" | "error";

export type Resource =
  | "me" | "products" | "categories" | "customers" | "suppliers" | "users" | "sales" | "purchases"
  | "losses" | "inventory" | "roles" | "settings" | "pending" | "notifications" | "online"
  | "promotions" | "cashSession";

/** Ligne de panier envoyée au serveur : seuls produit, quantité et remise manuelle — les montants sont calculés côté serveur. */
export interface CartLine { productId: string; quantity: number; discountPercent?: number }

type CategoryRow = { id: string; name: string; productsCount: number };

interface ActionMeta {
  kind: ActionKind;
  module: string;
  action: string;
  description: string;
  details?: Record<string, unknown>;
  payload: Record<string, unknown>;
}

interface StoreContextType {
  /** false tant que la session (jeton) n'a pas été vérifiée au démarrage */
  ready: boolean;
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  customers: Customer[];
  suppliers: Supplier[];
  users: User[];
  losses: Loss[];
  inventory: InventoryCount[];
  roles: Role[];
  promotions: Promotion[];
  /** Ma caisse ouverte (null = aucune) */
  cashSession: CashSession | null;
  shopSettings: ShopSettings;
  categories: string[];
  /** Catégories avec leur identifiant (ciblage des promotions) */
  categoryList: { id: string; name: string }[];
  currentUser: User | null;
  currentUserRole: Role | undefined;
  canAccess: (key: NavKey) => boolean;
  roleName: (roleId: string) => string;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  forgotPassword: (identifier: string) => Promise<{ ok: boolean; message: string }>;
  /** Re-vérifie le mot de passe de l'utilisateur connecté (opérations sensibles). */
  verifyPassword: (password: string) => Promise<boolean>;
  isLoggedIn: boolean;
  refresh: (...resources: Resource[]) => Promise<void>;

  pendingActions: PendingAction[];
  pendingCount: number;
  approveAction: (id: string) => Promise<boolean>;
  rejectAction: (id: string, reason: string) => Promise<boolean>;
  /** Admin : exécute directement. Autre employé : crée une demande de validation. */
  requestOrExec: (meta: ActionMeta) => Promise<ActionResult>;

  notifications: AppNotification[];
  myNotifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
  updateProfile: (data: { name?: string; email?: string; password?: string; avatar?: string }) => Promise<ActionResult>;
  makeAvatarPreview: (dataUrl: string, maxSize?: number) => Promise<string>;
  onlineUsers: string[];

  /** `paid` omis = payé en totalité ; inférieur au total = paiement partiel / à crédit (client obligatoire). */
  addSale: (items: CartLine[], customerId?: string, paymentMethod?: string, paid?: number) => Promise<Sale | null>;

  openCashSession: (openingFloat: number) => Promise<boolean>;
  closeCashSession: (id: string, countedCash: number, note: string) => Promise<CashSession | null>;
  /** Encaisse un règlement sur la créance d'un client (sans saleId : dettes les plus anciennes d'abord). */
  settleCustomer: (customerId: string, data: { amount: number; method: string; saleId?: string; note?: string }) => Promise<boolean>;

  addRole: (r: Pick<Role, "name" | "description" | "permissions">) => Promise<Role | null>;
  updateRole: (id: string, r: Pick<Role, "name" | "description" | "permissions">) => Promise<boolean>;
  deleteRole: (id: string) => Promise<boolean>;

  updateShopSettings: (s: Partial<ShopSettings>) => Promise<boolean>;

  addCategory: (name: string) => Promise<boolean>;
  deleteCategory: (name: string) => Promise<boolean>;
  renameCategory: (oldName: string, newName: string) => Promise<boolean>;
}

const StoreContext = createContext<StoreContextType | null>(null);

/** Page (permission) requise pour lire chaque ressource — évite des appels voués au 403. */
const READ_PERMISSIONS: Partial<Record<Resource, NavKey[]>> = {
  customers: ["customers", "sales"],
  suppliers: ["suppliers", "purchases"],
  users: ["users"],
  sales: ["sales", "dashboard", "inventory", "myspace"],
  purchases: ["purchases", "suppliers", "dashboard", "inventory"],
  losses: ["losses", "dashboard", "inventory"],
  inventory: ["inventory"],
  cashSession: ["sales"],
};

const ALL_RESOURCES: Resource[] = [
  "products", "categories", "customers", "suppliers", "users", "sales", "purchases", "losses",
  "inventory", "roles", "settings", "pending", "notifications", "online", "promotions", "cashSession",
];

export function StoreProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();

  const [ready, setReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<Role | undefined>(undefined);

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [losses, setLosses] = useState<Loss[]>([]);
  const [inventory, setInventory] = useState<InventoryCount[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [cashSession, setCashSession] = useState<CashSession | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const isAdmin = currentUserRole?.slug === "admin";
  const roleRef = useRef<Role | undefined>(undefined);
  const userRef = useRef<User | null>(null);
  roleRef.current = currentUserRole;
  userRef.current = currentUser;

  const canAccess = (key: NavKey): boolean => {
    if (!currentUserRole) return false;
    return currentUserRole.slug === "admin" || currentUserRole.permissions.includes(key);
  };
  const canAny = (keys: NavKey[]): boolean => {
    const r = roleRef.current;
    if (!r) return false;
    return r.slug === "admin" || keys.some(k => r.permissions.includes(k));
  };
  const roleName = (roleId: string): string => roles.find(r => r.id === roleId)?.name || (currentUserRole?.id === roleId ? currentUserRole.name : roleId);

  // ───────────────────────── Chargement des ressources ─────────────────────────
  const loaders: Record<Resource, () => Promise<void>> = {
    me: async () => {
      const r = await api<{ user: User; role: Role }>("GET", "/me");
      setCurrentUser(r.user);
      setCurrentUserRole(r.role);
      roleRef.current = r.role;
      userRef.current = r.user;
    },
    products: async () => setProducts(await api<Product[]>("GET", "/products")),
    categories: async () => setCategoryRows(await api<CategoryRow[]>("GET", "/categories")),
    customers: async () => setCustomers(await api<Customer[]>("GET", "/customers")),
    suppliers: async () => setSuppliers(await api<Supplier[]>("GET", "/suppliers")),
    users: async () => setUsers(await api<User[]>("GET", "/users")),
    sales: async () => setSales(await api<Sale[]>("GET", "/sales")),
    purchases: async () => setPurchases(await api<Purchase[]>("GET", "/purchases")),
    losses: async () => setLosses(await api<Loss[]>("GET", "/losses")),
    inventory: async () => setInventory(await api<InventoryCount[]>("GET", "/inventory")),
    roles: async () => setRoles(await api<Role[]>("GET", "/roles")),
    settings: async () => setShopSettings({ ...DEFAULT_SETTINGS, ...(await api<ShopSettings>("GET", "/settings")) }),
    pending: async () => setPendingActions(await api<PendingAction[]>("GET", "/pending-actions")),
    notifications: async () => setNotifications(await api<AppNotification[]>("GET", "/notifications")),
    online: async () => setOnlineUsers(await api<string[]>("GET", "/users/online")),
    promotions: async () => setPromotions(await api<Promotion[]>("GET", "/promotions")),
    cashSession: async () => { const r = await api<CashSession | null>("GET", "/cash-sessions/current"); setCashSession(r && r.id ? r : null); },
  };

  const refresh = useCallback(async (...resources: Resource[]) => {
    const wanted = Array.from(new Set(resources));
    await Promise.allSettled(wanted.map(async res => {
      const need = READ_PERMISSIONS[res];
      if (res !== "me" && need && !canAny(need)) return;
      try { await loaders[res](); } catch (e) {
        if (!(e instanceof ApiError && (e.status === 401 || e.status === 403))) console.warn(`[store] ${res}:`, errMsg(e));
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Réinitialise tout (déconnexion / session expirée) : aucune donnée ne reste en mémoire. */
  const resetState = () => {
    setCurrentUser(null); setCurrentUserRole(undefined);
    setProducts([]); setSales([]); setPurchases([]); setCustomers([]); setSuppliers([]); setUsers([]);
    setLosses([]); setInventory([]); setRoles([]); setCategoryRows([]); setPendingActions([]);
    setNotifications([]); setOnlineUsers([]); setPromotions([]); setCashSession(null);
    roleRef.current = undefined; userRef.current = null;
  };

  // Les employés sans accès à la liste complète voient au moins leur propre fiche
  useEffect(() => {
    // Vérifié dans la mise à jour elle-même : la liste a pu être rechargée entre-temps (sinon doublon)
    if (currentUser && !users.some(u => u.id === currentUser.id)) setUsers(us => (us.some(u => u.id === currentUser.id) ? us : [...us, currentUser]));
  }, [currentUser, users]);

  // ───────────────────────── Démarrage : reprise de session ─────────────────────────
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      resetState();
      push("Votre session a expiré. Veuillez vous reconnecter.", "error");
    });
    (async () => {
      // Identité de la boutique visible dès l'écran de connexion
      api<Partial<ShopSettings>>("GET", "/public/shop")
        .then(info => setShopSettings(prev => ({ ...prev, ...info, logo: info.logo || "" })))
        .catch(() => { /* API injoignable : on garde les valeurs par défaut */ });
      if (getToken()) {
        try {
          await loaders.me();
          await refresh(...ALL_RESOURCES);
        } catch {
          setToken(null);
          resetState();
        }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────────────────────── Synchronisation périodique ─────────────────────────
  const loggedIn = !!currentUser;
  useEffect(() => {
    if (!loggedIn) return;
    const fast = setInterval(() => { void refresh("notifications", "pending", "online"); }, 20_000);
    const slow = setInterval(() => { void refresh("me", "products", "customers", "sales", "purchases", "losses", "promotions", "cashSession"); }, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh("me", ...ALL_RESOURCES); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(fast); clearInterval(slow); document.removeEventListener("visibilitychange", onVisible); };
  }, [loggedIn, refresh]);

  // ───────────────────────── Session ─────────────────────────
  const login = async (identifier: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const r = await api<{ token: string; user: User; role: Role }>("POST", "/login", { identifier: identifier.trim(), password });
      setToken(r.token);
      setCurrentUser(r.user);
      setCurrentUserRole(r.role);
      roleRef.current = r.role;
      userRef.current = r.user;
      await refresh(...ALL_RESOURCES);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  };

  const logout = async () => {
    try { await api("POST", "/logout"); } catch { /* jeton déjà invalide : peu importe */ }
    setToken(null);
    resetState();
  };

  const forgotPassword = async (identifier: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const r = await api<{ message: string }>("POST", "/forgot-password", { identifier: identifier.trim() });
      return { ok: true, message: r.message };
    } catch (e) {
      return { ok: false, message: errMsg(e) };
    }
  };

  const verifyPassword = async (password: string): Promise<boolean> => {
    try { await api("POST", "/me/verify-password", { password }); return true; }
    catch (e) {
      if (e instanceof ApiError && e.status === 422) return false;
      push(errMsg(e), "error");
      return false;
    }
  };

  // ───────────────────────── Opérations soumises à validation ─────────────────────────
  const requestOrExec = async (meta: ActionMeta): Promise<ActionResult> => {
    try {
      const r = await api<{ executed: boolean; affects: string[] }>("POST", "/actions", meta);
      await refresh(...(r.affects as Resource[]), "notifications");
      return r.executed ? "done" : "pending";
    } catch (e) {
      push(errMsg(e), "error");
      return "error";
    }
  };

  const approveAction = async (id: string): Promise<boolean> => {
    try {
      const r = await api<{ affects: string[] }>("POST", `/pending-actions/${id}/approve`);
      await refresh(...(r.affects as Resource[]), "notifications");
      return true;
    } catch (e) {
      push(errMsg(e), "error");
      await refresh("pending");
      return false;
    }
  };

  const rejectAction = async (id: string, reason: string): Promise<boolean> => {
    try {
      await api("POST", `/pending-actions/${id}/reject`, { reason: reason || null });
      await refresh("pending", "notifications");
      return true;
    } catch (e) {
      push(errMsg(e), "error");
      await refresh("pending");
      return false;
    }
  };

  // ───────────────────────── Ventes ─────────────────────────
  const addSale = async (items: CartLine[], customerId?: string, paymentMethod = "Espèces", paid?: number): Promise<Sale | null> => {
    try {
      const r = await api<{ sale: Sale; products: Product[] }>("POST", "/sales", {
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, discountPercent: i.discountPercent || 0 })),
        customerId: customerId || null,
        paymentMethod,
        paid: paid ?? null,
      });
      await refresh("products", "sales", "customers", "notifications", "cashSession", "promotions");
      return r.sale;
    } catch (e) {
      push(errMsg(e), "error");
      await refresh("products", "promotions", "cashSession"); // stock / promotions / caisse affichés peut-être périmés
      return null;
    }
  };

  // ───────────────────────── Caisse : sessions et créances ─────────────────────────
  const openCashSession = async (openingFloat: number): Promise<boolean> => {
    try {
      await api("POST", "/cash-sessions", { openingFloat });
      await refresh("cashSession");
      return true;
    } catch (e) { push(errMsg(e), "error"); return false; }
  };

  const closeCashSession = async (id: string, countedCash: number, note: string): Promise<CashSession | null> => {
    try {
      const closed = await api<CashSession>("POST", `/cash-sessions/${id}/close`, { countedCash, note: note || null });
      await refresh("cashSession", "notifications");
      return closed;
    } catch (e) { push(errMsg(e), "error"); return null; }
  };

  const settleCustomer = async (customerId: string, data: { amount: number; method: string; saleId?: string; note?: string }): Promise<boolean> => {
    try {
      await api("POST", `/customers/${customerId}/payments`, {
        amount: data.amount, method: data.method, saleId: data.saleId || null, note: data.note || null,
      });
      await refresh("customers", "sales", "cashSession");
      return true;
    } catch (e) { push(errMsg(e), "error"); return false; }
  };

  // ───────────────────────── Rôles / paramètres / catégories ─────────────────────────
  const addRole = async (r: Pick<Role, "name" | "description" | "permissions">): Promise<Role | null> => {
    try {
      const created = await api<Role>("POST", "/roles", r);
      await refresh("roles");
      return created;
    } catch (e) { push(errMsg(e), "error"); return null; }
  };
  const updateRole = async (id: string, r: Pick<Role, "name" | "description" | "permissions">): Promise<boolean> => {
    try {
      await api("PUT", `/roles/${id}`, r);
      await refresh("roles", "me");
      return true;
    } catch (e) { push(errMsg(e), "error"); return false; }
  };
  const deleteRole = async (id: string): Promise<boolean> => {
    try {
      await api("DELETE", `/roles/${id}`);
      await refresh("roles");
      return true;
    } catch (e) { push(errMsg(e), "error"); return false; }
  };

  const updateShopSettings = async (s: Partial<ShopSettings>): Promise<boolean> => {
    try {
      setShopSettings({ ...DEFAULT_SETTINGS, ...(await api<ShopSettings>("PUT", "/settings", s)) });
      return true;
    } catch (e) { push(errMsg(e), "error"); return false; }
  };

  const categories = categoryRows.map(c => c.name);
  const catId = (name: string) => categoryRows.find(c => c.name === name)?.id;

  const addCategory = async (name: string): Promise<boolean> => {
    try { await api("POST", "/categories", { name }); await refresh("categories"); return true; }
    catch (e) { push(errMsg(e), "error"); return false; }
  };
  const deleteCategory = async (name: string): Promise<boolean> => {
    const id = catId(name);
    if (!id) return false;
    try { await api("DELETE", `/categories/${id}`); await refresh("categories", "products"); return true; }
    catch (e) { push(errMsg(e), "error"); return false; }
  };
  const renameCategory = async (oldName: string, newName: string): Promise<boolean> => {
    const id = catId(oldName);
    if (!id) return false;
    try { await api("PUT", `/categories/${id}`, { name: newName }); await refresh("categories", "products"); return true; }
    catch (e) { push(errMsg(e), "error"); return false; }
  };

  // ───────────────────────── Notifications ─────────────────────────
  const unreadCount = notifications.filter(n => !n.read).length;
  const markRead = (id: string) => {
    setNotifications(ns => ns.map(n => n.id === id ? { ...n, read: true } : n));
    api("POST", `/notifications/${id}/read`).catch(() => void refresh("notifications"));
  };
  const markAllRead = () => {
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    api("POST", "/notifications/read-all").catch(() => void refresh("notifications"));
  };

  // ───────────────────────── Profil ─────────────────────────
  // Réduit une image (data URL) à une petite miniature via canvas (comparaison avant/après pour l'admin).
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

  const updateProfile = async (data: { name?: string; email?: string; password?: string; avatar?: string }): Promise<ActionResult> => {
    if (!currentUser) return "error";
    const clean: Partial<User> = {};
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
    const avatarChanged = data.avatar !== undefined && data.avatar !== (currentUser.avatar ?? "");
    if (avatarChanged) {
      clean.avatar = data.avatar;
      changedFields["Photo de profil"] = {
        avant: currentUser.avatar ? "Photo existante" : "Aucune photo",
        après: data.avatar ? "Nouvelle photo" : "Suppression de la photo",
      };
    }

    if (Object.keys(clean).length === 0) return "done"; // Rien à changer

    // L'ancienne photo (miniature) est conservée dans les détails pour que l'admin compare avant/après.
    const avatarAvant = avatarChanged
      ? currentUser.avatar ? await makeAvatarPreview(currentUser.avatar) : ""
      : undefined;

    const changesTable = Object.entries(changedFields)
      .filter(([field]) => field !== "Photo de profil")
      .map(([field, v]) => ({ champ: field, avant: v.avant, après: v.après }));

    const details: Record<string, unknown> = { employé: currentUser.name, changes: changesTable };
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

  const pendingCount = pendingActions.filter(a => a.status === "pending").length;

  return (
    <StoreContext.Provider value={{
      ready,
      products, sales, purchases, customers, suppliers, users, losses, inventory, roles, promotions, cashSession, shopSettings, categories,
      categoryList: categoryRows.map(c => ({ id: c.id, name: c.name })),
      currentUser, currentUserRole, canAccess, roleName, isAdmin,
      login, logout, forgotPassword, verifyPassword, isLoggedIn: !!currentUser, refresh,
      pendingActions, pendingCount, approveAction, rejectAction, requestOrExec,
      notifications, myNotifications: notifications, unreadCount, markAllRead, markRead,
      updateProfile, makeAvatarPreview, onlineUsers,
      addSale, openCashSession, closeCashSession, settleCustomer, addRole, updateRole, deleteRole, updateShopSettings,
      addCategory, deleteCategory, renameCategory,
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
