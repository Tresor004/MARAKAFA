/**
 * « Serveur » du mode stockage local : reproduit routes/api.php du backend Laravel dans le navigateur.
 * Mêmes URL, mêmes contrôles (connexion, compte actif, permissions), mêmes réponses JSON et mêmes erreurs.
 */
import type { Db, UserRow } from "./db";
import { getDb, transaction, nextId, isoDate, round, randomHex, hashPassword, StorageFullError } from "./db";
import { HttpError, V, invalid, forbidden, notFound, isObj } from "./http";
import * as P from "./present";
import * as S from "./services";
import { dashboard, stats } from "./stats";

type Obj = Record<string, unknown>;
export interface LocalResponse { status: number; data: unknown }

const SESSION_HOURS = 12;
const normalizePhone = (s: string | null | undefined) => String(s ?? "").replace(/\D+/g, "");

function findByIdentifier(db: Db, identifier: string): UserRow | undefined {
  const q = identifier.trim().toLowerCase();
  const live = db.users.filter(u => !u.deleted);
  const byText = live.find(u => u.email.toLowerCase() === q || u.name.toLowerCase() === q);
  if (byText) return byText;
  const digits = normalizePhone(identifier);
  return digits.length >= 6 ? live.find(u => normalizePhone(u.phone) === digits) : undefined;
}

function authUser(db: Db, token: string | null): UserRow {
  const t = token ? db.tokens.find(x => x.token === token && x.expiresAt > Date.now()) : undefined;
  const u = t ? db.users.find(x => x.id === t.userId && !x.deleted) : undefined;
  if (!u) throw new HttpError(401, "Session expirée. Reconnectez-vous.");
  if (!u.active) throw new HttpError(401, "Ce compte est désactivé. Contactez l'administrateur.");
  return u;
}

/** Équivalent du middleware « permission: » : au moins une des permissions (admin : toujours). */
function need(db: Db, u: UserRow, ...perms: string[]) {
  if (perms.includes("admin")) { if (!S.isAdmin(db, u)) throw forbidden("Réservé à l'administrateur."); return; }
  if (!perms.some(p => S.hasPermission(db, u, p))) throw forbidden();
}

const visibleNotifications = (db: Db, u: UserRow) => {
  const admin = S.isAdmin(db, u);
  const perms = S.roleOf(db, u)?.permissions ?? [];
  return db.notifications.filter(n => n.userId === u.id || (n.userId === null && n.scope === "general" && (admin || !n.permission || perms.includes(n.permission))));
};

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "fr");

/** Point d'entrée : (méthode, chemin avec query, corps, jeton) → { status, data }. Ne lève jamais d'erreur HTTP. */
export async function localRequest(method: string, fullPath: string, body: unknown, token: string | null): Promise<LocalResponse> {
  try {
    const data = await route(method, fullPath, isObj(body) ? body : {}, token);
    // Copie : l'interface ne doit jamais tenir une référence vers la base
    return { status: data.status ?? 200, data: data.body === undefined ? null : JSON.parse(JSON.stringify(data.body)) };
  } catch (e) {
    if (e instanceof HttpError) {
      const first = Object.values(e.errors)[0]?.[0];
      const count = Object.keys(e.errors).length;
      return { status: e.status, data: { message: first && count > 1 ? `${first} (et ${count - 1} autre${count > 2 ? "s" : ""} erreur${count > 2 ? "s" : ""})` : e.message, errors: e.errors } };
    }
    if (e instanceof StorageFullError) return { status: 507, data: { message: e.message } };
    console.error("[stockage local]", e);
    return { status: 500, data: { message: "Erreur interne du stockage local." } };
  }
}

interface Out { status?: number; body: unknown }
const ok = (body: unknown, status = 200): Out => ({ status, body });

async function route(method: string, fullPath: string, b: Obj, token: string | null): Promise<Out> {
  const [path, qs = ""] = fullPath.split("?");
  const q = new URLSearchParams(qs);
  const seg = path.replace(/^\/+|\/+$/g, "").split("/");
  const is = (m: string, pattern: string) => {
    if (m !== method) return null;
    const ps = pattern.split("/");
    if (ps.length !== seg.length) return null;
    const params: string[] = [];
    for (let i = 0; i < ps.length; i++) {
      if (ps[i] === ":id") { if (!/^\d+$/.test(seg[i])) return null; params.push(seg[i]); }
      else if (ps[i] !== seg[i]) return null;
    }
    return params.map(Number);
  };

  // ───────────── Routes publiques ─────────────
  if (is("GET", "public/shop")) {
    const s = (await getDb()).settings;
    return ok({ name: s.name || "Hi-Market", type: s.type, slogan: s.slogan, logo: s.logo });
  }

  if (is("POST", "login")) {
    const v = new V(b);
    const identifier = v.str("identifier", { required: true, max: 255 }) as string;
    const password = v.str("password", { required: true, max: 255 }) as string;
    return transaction(async db => {
      const u = findByIdentifier(db, identifier);
      if (!u || (await hashPassword(password, u.salt)) !== u.passwordHash) throw invalid("identifier", "Identifiant ou mot de passe incorrect.");
      if (!u.active) throw invalid("identifier", "Ce compte est désactivé. Contactez l'administrateur.");
      const tok = randomHex(32);
      db.tokens = db.tokens.filter(t => t.expiresAt > Date.now());
      db.tokens.push({ token: tok, userId: u.id, expiresAt: Date.now() + SESSION_HOURS * 3600_000 });
      u.lastSeen = Date.now();
      S.runDailyChecksOncePerDay(db);
      return ok({ token: tok, user: P.user(u), role: P.role(S.roleOf(db, u)!) });
    });
  }

  if (is("POST", "forgot-password")) {
    const identifier = new V(b).str("identifier", { required: true, max: 255 }) as string;
    await transaction(db => {
      const u = findByIdentifier(db, identifier);
      if (u && u.active) S.notifyAdmins(db, "Réinitialisation de mot de passe demandée", `${u.name} (${u.email}) a oublié son mot de passe. Modifiez-le dans la page Employés.`, "warning", u, "users");
    });
    return ok({ message: "Si ce compte existe, l'administrateur a été prévenu et vous communiquera un nouveau mot de passe." });
  }

  // ───────────── Routes protégées ─────────────
  // Toute requête authentifiée passe par une transaction : présence en ligne + écritures éventuelles
  return transaction(async db => {
    const me = authUser(db, token);
    if (!me.lastSeen || Date.now() - me.lastSeen >= 30_000) me.lastSeen = Date.now();
    const out = await protectedRoute(db, me, is, q, b, token);
    return out;
  });
}

type Matcher = (m: string, pattern: string) => number[] | null;

async function protectedRoute(db: Db, me: UserRow, is: Matcher, q: URLSearchParams, b: Obj, token: string | null): Promise<Out> {
  let m: number[] | null;

  // ── Session
  if (is("POST", "logout")) { db.tokens = db.tokens.filter(t => t.token !== token); return ok({ message: "Déconnecté." }); }
  if (is("GET", "me")) return ok({ user: P.user(me), role: P.role(S.roleOf(db, me)!) });
  if (is("POST", "me/verify-password")) {
    const pw = new V(b).str("password", { required: true, max: 255 }) as string;
    if ((await hashPassword(pw, me.salt)) !== me.passwordHash) throw invalid("password", "Mot de passe incorrect.");
    return ok({ ok: true });
  }

  // ── Lectures accessibles à tout employé connecté
  if (is("GET", "products")) return ok(db.products.filter(p => !p.deleted).sort(byName).map(p => P.product(db, p)));
  if (is("GET", "products/next-barcode")) {
    need(db, me, "products");
    for (let i = 0; i < 20; i++) {
      const body = "2" + String(Math.floor(Math.random() * 1e11)).padStart(11, "0");
      const sum = body.split("").reduce((a, d, idx) => a + Number(d) * (idx % 2 === 0 ? 1 : 3), 0);
      const code = body + ((10 - (sum % 10)) % 10);
      if (!db.products.some(p => p.barcode === code)) return ok({ barcode: code });
    }
    throw new HttpError(503, "Impossible de générer un code-barres unique, réessayez.");
  }
  if ((m = is("GET", "products/:id"))) {
    const p = db.products.find(x => x.id === m![0] && !x.deleted);
    if (!p) throw notFound();
    return ok(P.product(db, p));
  }
  if (is("GET", "promotions")) return ok([...db.promotions].sort((a, b2) => Number(b2.active) - Number(a.active) || b2.id - a.id).map(p => P.promotion(db, p)));
  if (is("GET", "categories")) {
    return ok([...db.categories].sort(byName).map(c => ({ id: String(c.id), name: c.name, productsCount: db.products.filter(p => p.categoryId === c.id && !p.deleted).length })));
  }
  if (is("GET", "settings")) return ok(P.settings(db.settings));
  if (is("GET", "roles")) return ok([...db.roles].sort((a, b2) => a.id - b2.id).map(P.role));
  if (is("GET", "users/online")) {
    return ok(db.users.filter(u => u.active && !u.deleted && u.lastSeen && Date.now() - u.lastSeen <= 120_000).map(u => String(u.id)));
  }

  // ── Lectures soumises à permission
  if (is("GET", "customers")) { need(db, me, "customers", "sales"); return ok(db.customers.filter(c => !c.deleted).sort(byName).map(c => P.customer(db, c))); }
  if (is("GET", "suppliers")) { need(db, me, "suppliers", "purchases"); return ok([...db.suppliers].sort(byName).map(P.supplier)); }
  if (is("GET", "users")) { need(db, me, "users"); return ok(db.users.filter(u => !u.deleted).sort(byName).map(u => P.user(u))); }
  if (is("GET", "sales")) {
    need(db, me, "sales", "dashboard", "inventory", "myspace");
    const from = q.get("from"), to = q.get("to");
    const limit = Math.min(5000, Math.max(1, Number(q.get("limit") ?? 2000) || 2000));
    return ok(db.sales.filter(s => (!from || s.date >= from) && (!to || s.date <= to)).sort((a, b2) => b2.id - a.id).slice(0, limit).map(s => P.sale(db, s)));
  }
  if ((m = is("GET", "sales/:id"))) {
    need(db, me, "sales", "dashboard", "inventory", "myspace");
    const s = db.sales.find(x => x.id === m![0]);
    if (!s) throw notFound();
    return ok(P.sale(db, s));
  }
  if (is("GET", "purchases")) { need(db, me, "purchases", "suppliers", "dashboard", "inventory"); return ok(db.purchases.filter(p => !p.deleted).sort((a, b2) => b2.id - a.id).slice(0, 2000).map(p => P.purchase(db, p))); }
  if (is("GET", "losses")) {
    need(db, me, "losses", "dashboard", "inventory");
    return ok(db.losses.filter(l => !l.deleted).sort((a, b2) => b2.date.localeCompare(a.date) || b2.id - a.id).slice(0, 2000).map(l => P.loss(db, l)));
  }
  if (is("GET", "inventory")) {
    need(db, me, "inventory");
    return ok([...db.inventoryItems].sort((a, b2) => b2.sessionId - a.sessionId || a.id - b2.id).slice(0, 3000).map(i => P.inventoryRow(db, i)));
  }
  if (is("GET", "dashboard")) { need(db, me, "dashboard"); return ok(dashboard(db, q)); }
  if (is("GET", "stats")) { need(db, me, "dashboard"); return ok(stats(db, q)); }
  if (is("GET", "stock-movements")) {
    need(db, me, "stock", "inventory");
    const pid = q.get("productId"), type = q.get("type"), from = q.get("from"), to = q.get("to"), text = (q.get("q") ?? "").toLowerCase();
    const rows = db.stockMovements.filter(x =>
      (!pid || x.productId === Number(pid)) && (!type || x.type === type) &&
      (!from || x.createdAt.slice(0, 10) >= from) && (!to || x.createdAt.slice(0, 10) <= to) &&
      (!text || [x.productName, x.reason, x.referenceLabel, x.userName].some(f => (f ?? "").toLowerCase().includes(text))),
    ).sort((a, b2) => b2.id - a.id);
    const perPage = Math.min(200, Math.max(1, Number(q.get("perPage") ?? 50) || 50));
    const lastPage = Math.max(1, Math.ceil(rows.length / perPage));
    const page = Math.max(1, Number(q.get("page") ?? 1) || 1);
    return ok({ data: rows.slice((page - 1) * perPage, page * perPage).map(P.stockMovement), total: rows.length, page, lastPage });
  }

  // ── Caisse et créances clients
  if (is("GET", "cash-sessions/current")) {
    need(db, me, "sales");
    const c = S.currentCash(db, me);
    return ok(c ? P.cashSession(db, c, S.cashSummary(db, c)) : null);
  }
  if (is("GET", "cash-sessions")) {
    need(db, me, "sales", "dashboard");
    const admin = S.isAdmin(db, me);
    return ok(db.cashSessions.filter(c => admin || c.userId === me.id).sort((a, b2) => b2.id - a.id).slice(0, 100).map(c => P.cashSession(db, c, S.cashSummary(db, c))));
  }
  if (is("POST", "cash-sessions")) {
    need(db, me, "sales");
    const amount = new V(b).num("openingFloat", { required: true, min: 0, max: 999999999999 }) as number;
    const c = S.cashOpen(db, me, amount);
    return ok(P.cashSession(db, c, S.cashSummary(db, c)), 201);
  }
  if ((m = is("POST", "cash-sessions/:id/close"))) {
    need(db, me, "sales");
    const c = db.cashSessions.find(x => x.id === m![0]);
    if (!c) throw notFound();
    if (c.userId !== me.id && !S.isAdmin(db, me)) throw forbidden("Vous ne pouvez fermer que votre propre caisse.");
    const v = new V(b);
    const counted = v.num("countedCash", { required: true, min: 0, max: 999999999999 }) as number;
    S.cashClose(db, c, me, counted, v.str("note", { max: 500 }) ?? null);
    return ok(P.cashSession(db, c, S.cashSummary(db, c)));
  }
  if ((m = is("GET", "customers/:id/account"))) {
    need(db, me, "customers", "sales");
    const c = db.customers.find(x => x.id === m![0] && !x.deleted);
    if (!c) throw notFound();
    const open = db.sales.filter(s => s.customerId === c.id && s.balanceDue > 0.004).sort((a, b2) => a.id - b2.id);
    return ok({
      customerId: String(c.id), balance: round(open.reduce((a, s) => a + s.balanceDue, 0)), creditLimit: c.creditLimit,
      openSales: open.map(s => ({ id: String(s.id), invoiceNo: s.invoiceNo, date: s.date, total: s.total - s.returnedTotal, balanceDue: s.balanceDue })),
      payments: db.payments.filter(p => p.customerId === c.id && p.kind === "settlement").sort((a, b2) => b2.id - a.id).slice(0, 50).map(p => ({
        id: String(p.id), date: p.date, amount: p.amount, method: p.method, userName: db.users.find(u => u.id === p.userId)?.name ?? "—", saleId: p.saleId ? String(p.saleId) : null,
      })),
    });
  }
  if ((m = is("POST", "customers/:id/payments"))) {
    need(db, me, "sales", "customers");
    const applied = S.settleCustomer(db, me, m[0], b);
    return ok({ message: "Règlement enregistré.", applied }, 201);
  }

  // ── Écritures directes
  if (is("POST", "sales")) {
    need(db, me, "sales");
    const sale = S.createSale(db, me, b);
    const ids = new Set(sale.items.map(i => i.productId));
    return ok({ sale: P.sale(db, sale), products: db.products.filter(p => ids.has(p.id) && !p.deleted).map(p => P.product(db, p)) }, 201);
  }
  if (is("POST", "categories") || (m = is("PUT", "categories/:id"))) {
    need(db, me, "products");
    const name = new V(b).str("name", { required: true, max: 100 }) as string;
    const id = m ? m[0] : null;
    if (id !== null && !db.categories.some(c => c.id === id)) throw notFound();
    if (db.categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== id)) throw invalid("name", "Cette catégorie existe déjà.");
    if (id === null) {
      const c = { id: nextId(db, "categories"), name };
      db.categories.push(c);
      return ok({ id: String(c.id), name, productsCount: 0 }, 201);
    }
    const c = db.categories.find(x => x.id === id)!;
    c.name = name;
    return ok({ id: String(c.id), name, productsCount: db.products.filter(p => p.categoryId === c.id && !p.deleted).length });
  }
  if ((m = is("DELETE", "categories/:id"))) {
    need(db, me, "products");
    const id = m[0];
    if (!db.categories.some(c => c.id === id)) throw notFound();
    db.categories = db.categories.filter(c => c.id !== id);
    db.products.forEach(p => { if (p.categoryId === id) p.categoryId = null; });
    return ok({ message: "Catégorie supprimée." });
  }
  if (is("PUT", "settings")) {
    need(db, me, "settings");
    const v = new V(b), s = db.settings;
    const str = (k: keyof typeof s, max: number, required = false) => {
      if (!v.present(k)) return;
      const val = v.str(k, { required, max });
      (s as unknown as Record<string, unknown>)[k] = val ?? "";
    };
    str("name", 255, true); str("type", 255); str("slogan", 255); str("logo", 3000000); str("ifu", 50); str("rccm", 80);
    str("phone", 30); str("phone2", 30); str("website", 255); str("address", 1000); str("city", 100); str("country", 100);
    str("currency", 20, true); str("currencyCode", 10, true); str("invoiceFooter", 2000); str("thankYouMessage", 255);
    if (v.present("email")) s.email = v.email("email") ?? "";
    if (v.present("invoicePrefix")) {
      const pfx = v.str("invoicePrefix", { required: true, max: 20 }) as string;
      if (!/^[A-Za-z0-9]+$/.test(pfx)) throw invalid("invoicePrefix", "Le format du champ préfixe de facture n'est pas valide.");
      s.invoicePrefix = pfx;
    }
    if (v.present("taxRate")) s.taxRate = v.num("taxRate", { min: 0, max: 100 }) ?? 0;
    if (v.present("maxDiscountPercent")) s.maxDiscountPercent = v.num("maxDiscountPercent", { min: 0, max: 100 }) ?? 0;
    const rcs = v.bool("requireCashSession"); if (rcs !== undefined) s.requireCashSession = rcs;
    const ac = v.bool("allowCredit"); if (ac !== undefined) s.allowCredit = ac;
    return ok(P.settings(s));
  }

  // ── Rôles (administrateur)
  if (is("POST", "roles")) {
    need(db, me, "admin");
    const d = S.roleData(db, b, null);
    const r = { id: nextId(db, "roles"), slug: S.uniqueSlug(db, d.name), isSystem: false, createdAt: isoDate(), ...d };
    db.roles.push(r);
    return ok(P.role(r), 201);
  }
  if ((m = is("PUT", "roles/:id"))) {
    need(db, me, "admin");
    const r = db.roles.find(x => x.id === m![0]);
    if (!r) throw notFound();
    if (r.slug === "admin") throw invalid("role", "Le rôle Administrateur ne peut pas être modifié.");
    Object.assign(r, S.roleData(db, b, r.id));
    return ok(P.role(r));
  }
  if ((m = is("DELETE", "roles/:id"))) {
    need(db, me, "admin");
    const r = db.roles.find(x => x.id === m![0]);
    if (!r) throw notFound();
    if (r.isSystem) throw invalid("role", "Un rôle système ne peut pas être supprimé.");
    if (db.users.some(u => u.roleId === r.id)) throw invalid("role", "Ce rôle est attribué à des employés : réaffectez-les d'abord.");
    db.roles = db.roles.filter(x => x.id !== r.id);
    return ok({ message: "Rôle supprimé." });
  }

  // ── Opérations soumises à validation
  if (is("POST", "actions")) {
    const v = new V(b);
    const kind = v.oneOf("kind", Object.keys(S.CATALOG), { required: true }) as string;
    if (!isObj(b.payload)) throw invalid("payload", "Le champ données est obligatoire.");
    const payload = b.payload as Obj;
    S.authorizeAction(db, me, kind, payload);
    if (S.isAdmin(db, me)) {
      await S.executeAction(db, kind, payload, me, null, String(b.description ?? ""));
      return ok({ executed: true, affects: S.CATALOG[kind][1] });
    }
    const pa = S.submitPending(db, me, kind, b, payload);
    return ok({ executed: false, affects: ["pending"], pending: P.pending(db, pa) }, 202);
  }
  if (is("GET", "pending-actions")) {
    const admin = S.isAdmin(db, me);
    return ok(db.pendingActions.filter(a => admin || a.requestedBy === me.id)
      .sort((a, b2) => Number(a.status !== "pending") - Number(b2.status !== "pending") || b2.id - a.id).slice(0, 500).map(a => P.pending(db, a)));
  }
  if ((m = is("POST", "pending-actions/:id/approve"))) {
    need(db, me, "admin");
    const pa = db.pendingActions.find(x => x.id === m![0]);
    if (!pa) throw notFound();
    await S.approvePending(db, pa, me);
    return ok({ pending: P.pending(db, pa), affects: ["pending", ...S.CATALOG[pa.kind][1]] });
  }
  if ((m = is("POST", "pending-actions/:id/reject"))) {
    need(db, me, "admin");
    const pa = db.pendingActions.find(x => x.id === m![0]);
    if (!pa) throw notFound();
    S.rejectPending(db, pa, me, new V(b).str("reason", { max: 500 }) ?? null);
    return ok({ pending: P.pending(db, pa), affects: ["pending"] });
  }

  // ── Notifications
  if (is("GET", "notifications")) {
    const rows = visibleNotifications(db, me).sort((a, b2) => b2.notifiedAt - a.notifiedAt || b2.id - a.id).slice(0, 200);
    const read = db.notificationReads[me.id] ?? [];
    return ok(rows.map(n => P.notification(n, read)));
  }
  if ((m = is("POST", "notifications/:id/read"))) {
    const n = visibleNotifications(db, me).find(x => x.id === m![0]);
    if (!n) throw notFound();
    const read = (db.notificationReads[me.id] ??= []);
    if (!read.includes(n.id)) read.push(n.id);
    return ok({ ok: true });
  }
  if (is("POST", "notifications/read-all")) {
    const read = new Set(db.notificationReads[me.id] ?? []);
    visibleNotifications(db, me).forEach(n => read.add(n.id));
    db.notificationReads[me.id] = [...read];
    return ok({ ok: true });
  }

  throw notFound();
}
