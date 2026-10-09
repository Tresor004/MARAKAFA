import { useState, useMemo } from "react";
import { useStore, fmtDate } from "../store";
import { PendingAction, AppNotification } from "../types";
import { Card, Button, Badge, Modal, Field, inputClass, EmptyState } from "../components/ui";
import {
  IconCheck, IconTrash, IconAlert, IconClipboard, IconCart, IconBox,
  IconTruck, IconUserShield, IconSettings, IconSearch, IconClose,
  IconEye, IconEyeOff, IconCamera, IconBell, IconEdit,
} from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

// ─── Helpers ──────────────────────────────────────────────────────────────
function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 2) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h}h`;
  return `Il y a ${Math.floor(h / 24)}j`;
}

function moduleIcon(mod: string) {
  const m = mod.toLowerCase();
  if (m.includes("produit")) return <IconBox size={15} className="text-amber-600" />;
  if (m.includes("stock") || m.includes("inventaire")) return <IconClipboard size={15} className="text-sky-600" />;
  if (m.includes("vente") || m.includes("caisse")) return <IconCart size={15} className="text-emerald-600" />;
  if (m.includes("achat") || m.includes("fournisseur")) return <IconTruck size={15} className="text-indigo-600" />;
  if (m.includes("employé") || m.includes("profil")) return <IconUserShield size={15} className="text-rose-600" />;
  if (m.includes("perte")) return <IconAlert size={15} className="text-orange-600" />;
  return <IconSettings size={15} className="text-slate-600" />;
}

const notifTypeTone = (t: string) =>
  t === "success" ? "emerald" : t === "warning" ? "amber" : t === "error" ? "rose" : "sky";

const statusTone = (s: string) =>
  s === "pending" ? "amber" : s === "approved" ? "emerald" : "rose";

const statusLabel = (s: string) =>
  s === "pending" ? "En attente" : s === "approved" ? "Approuvée" : "Refusée";

// ─── Composant principal ────────────────────────────────────────────────────
interface MySpaceProps {
  navigate: (key: string, opts?: Record<string, unknown>) => void;
}

export default function MySpace({ navigate }: MySpaceProps) {
  const {
    pendingActions, approveAction, rejectAction,
    isAdmin, currentUser, myNotifications, unreadCount,
    markAllRead, markRead, updateProfile, roleName,
  } = useStore();
  const { push } = useToast();

  // Tabs — toujours notifications en premier (règle 3)
  const [tab, setTab] = useState<"notifs" | "validations" | "profile">("notifs");

  // ── Validations (admin) ──
  const [statusFilter, setStatusFilter] = useState<"pending" | "all" | "approved" | "rejected">("pending");
  const [searchV, setSearchV] = useState("");
  const [detail, setDetail] = useState<PendingAction | null>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ── Notifications ──
  const [searchN, setSearchN] = useState("");
  const [notifTypeFilter, setNotifTypeFilter] = useState<"all" | "personal" | "general">("all");

  // ── Profil ──
  const [pName, setPName] = useState(currentUser?.name || "");
  const [pEmail, setPEmail] = useState(currentUser?.email || "");
  const [pPassword, setPPassword] = useState("");
  const [pAvatar, setPAvatar] = useState(currentUser?.avatar || "");
  const [showPwd, setShowPwd] = useState(false);

  // ── Computed ──
  const pending = pendingActions.filter(a => a.status === "pending");
  const approved = pendingActions.filter(a => a.status === "approved");
  const rejected = pendingActions.filter(a => a.status === "rejected");

  const qV = searchV.toLowerCase().trim();
  const filteredActions = useMemo(() => {
    let list = pendingActions;
    if (statusFilter !== "all") list = list.filter(a => a.status === statusFilter);
    if (qV) list = list.filter(a =>
      a.module.toLowerCase().includes(qV) ||
      a.action.toLowerCase().includes(qV) ||
      a.requestedByName.toLowerCase().includes(qV) ||
      a.description.toLowerCase().includes(qV)
    );
    return list;
  }, [pendingActions, statusFilter, qV]);

  const qN = searchN.toLowerCase().trim();
  const filteredNotifs = useMemo(() => {
    let list = myNotifications;
    if (notifTypeFilter !== "all") list = list.filter(n => n.scope === notifTypeFilter);
    if (qN) list = list.filter(n => n.title.toLowerCase().includes(qN) || n.message.toLowerCase().includes(qN));
    return list;
  }, [myNotifications, notifTypeFilter, qN]);

  const confirmAction = useConfirm();

  // ── Actions (avec pop-up de confirmation pour l'admin) ──
  const doApprove = async (pa: PendingAction) => {
    const ok = await confirmAction({
      title: "Approuver la demande",
      message: `Êtes-vous sûr de vouloir approuver la demande « ${pa.action} » de ${pa.requestedByName} ? Cette action sera immédiatement appliquée dans l'application.`,
      confirmLabel: "Oui, approuver",
      variant: "primary",
    });
    if (!ok) return;
    approveAction(pa.id);
    push(`✓ Demande de ${pa.requestedByName} approuvée et appliquée`);
    setDetail(null);
  };

  const openRejectModal = (id: string) => { setRejectId(id); setRejectReason(""); setRejectModal(true); setDetail(null); };

  const doReject = async () => {
    if (!rejectId) return;
    const pa = pendingActions.find(a => a.id === rejectId);
    const ok = await confirmAction({
      title: "Refuser la demande",
      message: `Êtes-vous sûr de vouloir refuser la demande « ${pa?.action || ""} » de ${pa?.requestedByName || ""} ?`,
      confirmLabel: "Oui, refuser",
      variant: "danger",
    });
    if (!ok) return;
    rejectAction(rejectId, rejectReason || "Non approuvé");
    push("Demande refusée", "error");
    setRejectModal(false); setRejectId(null);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) return push("Image trop lourde (max 1,5 Mo)", "error");
    const reader = new FileReader();
    reader.onload = () => setPAvatar(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Confirmation de modification du profil (employé) ──
  const [profileConfirmOpen, setProfileConfirmOpen] = useState(false);
  const [currentPwdInput, setCurrentPwdInput] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [submittingProfile, setSubmittingProfile] = useState(false);

  // Une demande de profil est-elle déjà en cours ?
  const hasPendingProfileRequest = pendingActions.some(
    a => a.status === "pending" && a.kind === "profile.update" && a.requestedBy === currentUser?.id
  );

  // Liste des champs que l'employé s'apprête à modifier
  const pendingProfileChanges = useMemo(() => {
    if (!currentUser) return [] as { champ: string; avant: string; après: string }[];
    const list: { champ: string; avant: string; après: string }[] = [];
    if (pName.trim() && pName.trim() !== currentUser.name)
      list.push({ champ: "Nom complet", avant: currentUser.name, après: pName.trim() });
    if (pEmail.trim() && pEmail.trim() !== currentUser.email)
      list.push({ champ: "Email", avant: currentUser.email, après: pEmail.trim() });
    if (pPassword)
      list.push({ champ: "Mot de passe", avant: "••••••••", après: "Nouveau mot de passe" });
    return list;
  }, [currentUser, pName, pEmail, pPassword]);

  const avatarWillChange = pAvatar !== (currentUser?.avatar || "");

  const openProfileConfirm = () => {
    if (!pName.trim() || !pEmail.trim()) return push("Nom et email requis", "error");
    if (pendingProfileChanges.length === 0 && !avatarWillChange) {
      return push("Aucune modification détectée.", "info");
    }
    setCurrentPwdInput("");
    setPwdError("");
    setProfileConfirmOpen(true);
  };

  const confirmProfileUpdate = async () => {
    if (!currentUser) return;
    if (!currentPwdInput) { setPwdError("Veuillez saisir votre mot de passe actuel."); return; }
    if (currentPwdInput !== currentUser.password) {
      setPwdError("Mot de passe incorrect.");
      return;
    }
    setSubmittingProfile(true);
    try {
      const immediate = await updateProfile({
        name: pName.trim(),
        email: pEmail.trim(),
        password: pPassword || undefined,
        avatar: pAvatar,
      });
      push(immediate ? "Profil mis à jour" : "Demande envoyée — en attente de validation de l'administrateur");
      setPPassword("");
      setProfileConfirmOpen(false);
    } catch {
      push("Une erreur est survenue lors de l'enregistrement.", "error");
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handleProfileCancel = () => {
    if (hasPendingProfileRequest) {
      push("Vous ne pouvez pas annuler une demande déjà en cours de traitement.", "error");
      return;
    }
    setPName(currentUser?.name || "");
    setPEmail(currentUser?.email || "");
    setPAvatar(currentUser?.avatar || "");
    setPPassword("");
  };

  const tabs: { key: typeof tab; label: string; badge?: number; show: boolean }[] = [
    { key: "notifs", label: "Notifications", badge: unreadCount, show: true },
    { key: "validations", label: "Validations", badge: pending.length, show: isAdmin },
    { key: "profile", label: "Mon compte", show: true },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Mon espace</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">{currentUser?.name} · {roleName(currentUser?.role || "")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === t.key
                ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                : "bg-white border border-slate-200 text-slate-700 hover:border-slate-400"
            }`}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                tab === t.key ? "bg-white text-slate-900" : "bg-rose-500 text-white"
              }`}>{t.badge > 99 ? "99+" : t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════ NOTIFICATIONS ══════════ */}
      {tab === "notifs" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputClass + " pl-9 pr-9 !py-2"} placeholder="Rechercher..." value={searchN} onChange={e => setSearchN(e.target.value)} />
              {searchN && <button onClick={() => setSearchN("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><IconClose size={13} /></button>}
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "personal", "general"] as const).map(f => (
                <button key={f} onClick={() => setNotifTypeFilter(f)} className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${notifTypeFilter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  {f === "all" ? "Toutes" : f === "personal" ? "Personnelles" : "Générales"}
                </button>
              ))}
              {myNotifications.some(n => !n.read) && (
                <button onClick={() => { markAllRead(); push("Tout marqué comme lu", "info"); }} className="px-3 py-2 rounded-xl text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition whitespace-nowrap">
                  Tout lire
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="space-y-2">
            {filteredNotifs.length === 0 && (
              <Card className="p-8">
                <EmptyState title="Aucune notification" subtitle={searchN ? "Modifiez votre recherche" : "Vous serez notifié ici des événements vous concernant."} icon={<IconBell size={28} />} />
              </Card>
            )}
            {filteredNotifs.map((n: AppNotification) => (
              <div
                key={n.id}
                onClick={() => {
                  markRead(n.id);
                  if (n.targetPage) {
                    // Notification avec cible de navigation
                    if (n.targetPage === "myspace" && isAdmin) {
                      // Admin → aller directement à l'onglet Validations
                      setTab("validations");
                    } else if (n.targetPage === "myspace") {
                      // Employé → rester dans Mon espace, onglet notifs (déjà là)
                    } else {
                      // Naviguer vers la page concernée
                      navigate(n.targetPage);
                    }
                  }
                }}
                className={`flex items-start gap-3 p-4 bg-white rounded-2xl border cursor-pointer transition-all hover:border-slate-300 ${!n.read ? "border-l-4 border-l-sky-400 border-slate-200" : "border-slate-200"}`}
              >
                {/* Type indicator */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  n.type === "success" ? "bg-emerald-100" : n.type === "warning" ? "bg-amber-100" : n.type === "error" ? "bg-rose-100" : "bg-sky-100"
                }`}>
                  <IconBell size={16} className={
                    n.type === "success" ? "text-emerald-600" : n.type === "warning" ? "text-amber-600" : n.type === "error" ? "text-rose-600" : "text-sky-600"
                  } />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-slate-900 leading-snug">{n.title}</div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge tone={notifTypeTone(n.type)}>{n.scope === "general" ? "Général" : "Personnel"}</Badge>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />}
                    </div>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.message}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                    <span>{timeAgo(n.date)}</span>
                    {n.triggeredByName && (
                      <span className="flex items-center gap-1">
                        <span>Par</span>
                        <b className="text-slate-600">{n.triggeredByName}</b>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ VALIDATIONS (admin seulement) ══════════ */}
      {tab === "validations" && isAdmin && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: "En attente", count: pending.length, color: "border-amber-400 text-amber-700 bg-amber-50" },
              { label: "Approuvées", count: approved.length, color: "border-emerald-400 text-emerald-700 bg-emerald-50" },
              { label: "Refusées", count: rejected.length, color: "border-rose-400 text-rose-700 bg-rose-50" },
            ].map(s => (
              <Card key={s.label} className={`p-3 sm:p-4 border-l-4 ${s.color}`}>
                <div className="text-[10px] sm:text-[11px] uppercase font-bold tracking-wider opacity-70">{s.label}</div>
                <div className="text-2xl sm:text-3xl font-black mt-1">{s.count}</div>
              </Card>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputClass + " pl-9 pr-9 !py-2"} placeholder="Rechercher par module, action, employé..." value={searchV} onChange={e => setSearchV(e.target.value)} />
              {searchV && <button onClick={() => setSearchV("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><IconClose size={13} /></button>}
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {(["pending", "all", "approved", "rejected"] as const).map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${statusFilter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                  {s === "pending" ? `En attente (${pending.length})` : s === "all" ? "Toutes" : s === "approved" ? "Approuvées" : "Refusées"}
                </button>
              ))}
            </div>
          </div>

          {/* Actions list */}
          <div className="space-y-2">
            {filteredActions.length === 0 && (
              <Card className="p-8">
                <EmptyState title="Aucune demande" subtitle={statusFilter === "pending" ? "Aucune action en attente — l'application est à jour." : "Aucune demande pour cette sélection."} icon={<IconCheck size={28} />} />
              </Card>
            )}
            {filteredActions.map(pa => (
              <div
                key={pa.id}
                onClick={() => setDetail(pa)}
                className={`p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-400 transition cursor-pointer ${
                  pa.status === "pending" ? "border-l-4 border-l-amber-400"
                  : pa.status === "approved" ? "border-l-4 border-l-emerald-400"
                  : "border-l-4 border-l-rose-400"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {moduleIcon(pa.module)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm text-slate-900 truncate">{pa.action}</div>
                      <Badge tone={statusTone(pa.status)}>{statusLabel(pa.status)}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{pa.description}</div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-400">
                      <span>Demandé par <b className="text-slate-600">{pa.requestedByName}</b></span>
                      <span>{fmtDate(pa.date)}</span>
                      <span className="font-medium text-slate-500">{pa.module}</span>
                    </div>
                    {pa.status !== "pending" && pa.reviewedByName && (
                      <div className={`mt-1.5 text-[11px] font-medium ${pa.status === "approved" ? "text-emerald-600" : "text-rose-600"}`}>
                        {pa.status === "approved" ? "✓" : "✗"} {pa.status === "approved" ? "Approuvée" : "Refusée"} par {pa.reviewedByName}
                        {pa.rejectReason && ` : "${pa.rejectReason}"`}
                      </div>
                    )}
                  </div>
                  {pa.status === "pending" && (
                    <div className="flex gap-1 flex-shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => doApprove(pa)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition active:scale-90" title="Approuver">
                        <IconCheck size={16} />
                      </button>
                      <button onClick={() => openRejectModal(pa.id)} className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 flex items-center justify-center transition active:scale-90" title="Refuser">
                        <IconTrash size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ MON COMPTE ══════════ */}
      {tab === "profile" && (
        <div className="max-w-2xl">
          <Card className="p-5 sm:p-6">
            {/* Avatar section */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-6 pb-6 border-b border-slate-200">
              <div className="relative group flex-shrink-0">
                {pAvatar ? (
                  <img src={pAvatar} alt="" className="w-20 h-20 rounded-2xl object-cover shadow border border-slate-200" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-2xl font-black shadow">
                    {(pName || "?")[0]?.toUpperCase()}
                  </div>
                )}
                <label className="absolute inset-0 bg-slate-900/60 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
                  <IconCamera size={20} className="text-white" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                </label>
              </div>
              <div className="text-center sm:text-left">
                <div className="font-black text-lg text-slate-900">{currentUser?.name}</div>
                <div className="text-sm text-slate-500 mt-0.5">{roleName(currentUser?.role || "")}</div>
                {currentUser?.email && <div className="text-xs text-slate-400 mt-0.5">{currentUser.email}</div>}
                <div className="flex flex-wrap gap-2 mt-2 justify-center sm:justify-start">
                  {pAvatar && (
                    <button onClick={() => setPAvatar("")} className="text-xs text-rose-600 hover:underline">Retirer la photo</button>
                  )}
                  <label className="text-xs text-sky-600 hover:underline cursor-pointer">
                    Changer la photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                  </label>
                </div>
              </div>
            </div>

            {!isAdmin && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
                <b>Validation requise</b> : toute modification de profil est soumise à l'administrateur avant d'être appliquée dans l'application.
              </div>
            )}
            {isAdmin && (
              <div className="mb-4 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800 leading-relaxed">
                En tant qu'administrateur, vos modifications de profil sont appliquées immédiatement.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nom complet">
                <input className={inputClass} value={pName} onChange={e => setPName(e.target.value)} placeholder="Votre nom" />
              </Field>
              <Field label="Adresse email">
                <input type="email" className={inputClass} value={pEmail} onChange={e => setPEmail(e.target.value)} placeholder="email@exemple.sn" />
              </Field>
              <Field label="Nouveau mot de passe" hint="Laissez vide pour ne pas modifier">
                <div className="relative">
                  <input type={showPwd ? "text" : "password"} className={inputClass + " pr-10 font-mono"} value={pPassword} onChange={e => setPPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition">
                    {showPwd ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
              </Field>
            </div>

            {/* Bandeau si une demande est déjà en cours */}
            {hasPendingProfileRequest && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Une demande de modification de votre profil est <b>déjà en cours de traitement</b>. Vous ne pouvez pas l'annuler.
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6 pt-5 border-t border-slate-200">
              <Button variant="ghost" onClick={handleProfileCancel} className="w-full sm:w-auto">
                Annuler
              </Button>
              <Button variant="success" onClick={openProfileConfirm} className="w-full sm:w-auto">
                <IconEdit size={16} />
                {isAdmin ? "Enregistrer" : "Soumettre pour validation"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ══════════ DETAIL MODAL (admin) ══════════ */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Détail de la demande"
        footer={detail ? (
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDetail(null)} className="flex-1 sm:flex-none">Fermer</Button>
            {detail.status === "pending" && (
              <>
                <Button variant="danger" onClick={() => openRejectModal(detail.id)} className="flex-1 sm:flex-none">
                  <IconTrash size={14} /> Refuser
                </Button>
                <Button variant="success" onClick={() => doApprove(detail)} className="flex-1 sm:flex-none">
                  <IconCheck size={14} /> Approuver
                </Button>
              </>
            )}
          </div>
        ) : undefined}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
                {moduleIcon(detail.module)}
                <span>{detail.module}</span>
              </div>
              <Badge tone={statusTone(detail.status)}>{statusLabel(detail.status)}</Badge>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1.5">Action demandée</div>
              <div className="font-bold text-slate-900">{detail.action}</div>
              <div className="text-sm text-slate-600 mt-1">{detail.description}</div>
            </div>

            {Object.keys(detail.details).length > 0 && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Détails de la demande</div>

                {/* Comparaison avant / après pour les changements de photo de profil */}
                {(() => {
                  const payloadData = (detail.payload as { data?: { avatar?: string } } | undefined)?.data;
                  const hasAvatarChange =
                    detail.kind === "profile.update" || detail.kind === "user.update";
                  const newAvatar = payloadData?.avatar;
                  const oldAvatar = (detail.details.avatar_avant as string | undefined) ?? "";
                  // On affiche la comparaison uniquement si une photo est concernée
                  if (!hasAvatarChange || newAvatar === undefined) return null;
                  return (
                    <div className="mb-3 p-3 rounded-lg bg-white border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-3">Photo de profil</div>
                      <div className="flex items-center justify-center gap-4">
                        {/* Avant */}
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-300 flex items-center justify-center">
                            {oldAvatar ? (
                              <img src={oldAvatar} alt="Avant" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-slate-400 text-center px-1 leading-tight">Aucune<br />photo</span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-slate-500">Avant</span>
                        </div>

                        {/* Flèche */}
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                        </svg>

                        {/* Après */}
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-emerald-400 flex items-center justify-center">
                            {newAvatar ? (
                              <img src={newAvatar} alt="Après" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[10px] text-rose-500 text-center px-1 leading-tight font-semibold">Photo<br />supprimée</span>
                            )}
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-600">Après</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Employé concerné */}
                {typeof detail.details.employé === "string" && (
                  <div className="flex items-center justify-between gap-3 text-sm mb-3 px-1">
                    <span className="text-slate-500">Employé</span>
                    <span className="text-slate-900 font-semibold">{String(detail.details.employé)}</span>
                  </div>
                )}

                {/* Tableau des champs modifiés (hors photo) */}
                {(() => {
                  const changes = detail.details.changes as
                    | { champ: string; avant: string; après: string }[]
                    | undefined;

                  if (Array.isArray(changes) && changes.length > 0) {
                    return (
                      <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-slate-100">
                            <tr className="text-left text-slate-600 uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-2.5 font-bold">Champ</th>
                              <th className="py-2 px-2.5 font-bold">Avant</th>
                              <th className="py-2 px-2.5 font-bold">Après</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changes.map((c, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="py-2 px-2.5 font-semibold text-slate-700 align-top">{c.champ}</td>
                                <td className="py-2 px-2.5 text-slate-500 align-top break-words">{c.avant || "—"}</td>
                                <td className="py-2 px-2.5 text-emerald-700 font-medium align-top break-words">{c.après || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // Fallback : anciennes requêtes ou autres modules sans tableau structuré
                  const otherEntries = Object.entries(detail.details).filter(
                    ([k]) => k !== "avatar_avant" && k !== "changes" && k !== "employé"
                  );
                  if (otherEntries.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      {otherEntries.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-slate-500 capitalize">{k}</span>
                          <span className="text-slate-900 font-medium text-right max-w-[60%] truncate" title={String(v)}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Demandé par — pleine largeur */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Demandé par</div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="font-semibold text-slate-900">{detail.requestedByName}</span>
                <span className="text-[11px] text-slate-400">{fmtDate(detail.date)}</span>
              </div>
            </div>

            {detail.reviewedByName && (
              <div className={`p-3 rounded-xl border ${detail.status === "approved" ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
                <div className={`text-[10px] uppercase font-semibold ${detail.status === "approved" ? "text-emerald-600" : "text-rose-600"}`}>
                  {detail.status === "approved" ? "Approuvée par" : "Refusée par"}
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="font-semibold text-slate-900">{detail.reviewedByName}</span>
                  <span className="text-[11px] text-slate-400">{fmtDate(detail.reviewedDate || "")}</span>
                </div>
              </div>
            )}

            {detail.rejectReason && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
                <b>Motif du refus :</b> {detail.rejectReason}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ══════════ CONFIRMATION MODIFICATION PROFIL (employé) ══════════ */}
      <Modal
        open={profileConfirmOpen}
        onClose={() => !submittingProfile && setProfileConfirmOpen(false)}
        title="Confirmer la modification"
        footer={
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setProfileConfirmOpen(false)}
              disabled={submittingProfile}
              className="flex-1 sm:flex-none"
            >
              Retour
            </Button>
            <Button
              variant="success"
              onClick={confirmProfileUpdate}
              disabled={submittingProfile}
              className="flex-1 sm:flex-none"
            >
              <IconCheck size={14} />
              {submittingProfile ? "Envoi..." : "Confirmer"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Vous êtes sur le point de modifier vos informations personnelles.
            {!isAdmin && " Cette demande sera soumise à l'administrateur pour validation."}
            {" "}<b className="text-slate-800">Une fois lancée, l'opération ne pourra plus être annulée.</b>
          </p>

          {/* Comparaison photo — uniquement si la photo change */}
          {avatarWillChange && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-3">Photo de profil</div>
              <div className="flex items-center justify-center gap-4">
                {/* Avant */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-300 flex items-center justify-center">
                    {currentUser?.avatar ? (
                      <img src={currentUser.avatar} alt="Avant" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400 text-center px-1 leading-tight">Aucune<br />photo</span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">Avant</span>
                </div>

                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>

                {/* Après */}
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-emerald-400 flex items-center justify-center">
                    {pAvatar ? (
                      <img src={pAvatar} alt="Après" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-rose-500 text-center px-1 leading-tight font-semibold">Photo<br />supprimée</span>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600">Après</span>
                </div>
              </div>
            </div>
          )}

          {/* Tableau des champs modifiés */}
          {pendingProfileChanges.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-100">
                  <tr className="text-left text-slate-600 uppercase text-[10px] tracking-wider">
                    <th className="py-2 px-2.5 font-bold">Champ</th>
                    <th className="py-2 px-2.5 font-bold">Avant</th>
                    <th className="py-2 px-2.5 font-bold">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingProfileChanges.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 px-2.5 font-semibold text-slate-700 align-top">{c.champ}</td>
                      <td className="py-2 px-2.5 text-slate-500 align-top break-words">{c.avant || "—"}</td>
                      <td className="py-2 px-2.5 text-emerald-700 font-medium align-top break-words">{c.après || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Vérification du mot de passe actuel */}
          <Field label="Mot de passe actuel" hint="Requis pour confirmer votre identité">
            <input
              type="password"
              className={inputClass + (pwdError ? " !border-rose-400" : "")}
              value={currentPwdInput}
              onChange={e => { setCurrentPwdInput(e.target.value); setPwdError(""); }}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => { if (e.key === "Enter" && !submittingProfile) confirmProfileUpdate(); }}
            />
          </Field>
          {pwdError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {pwdError}
            </div>
          )}
        </div>
      </Modal>

      {/* ══════════ REJECT MODAL ══════════ */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Refuser la demande" size="sm">
        <p className="text-sm text-slate-600 mb-3">Indiquez le motif du refus pour notifier l'employé.</p>
        <Field label="Motif (optionnel)">
          <textarea
            className={inputClass + " min-h-[80px] resize-y"}
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Ex : stock insuffisant, information incorrecte..."
          />
        </Field>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setRejectModal(false)} className="flex-1 sm:flex-none">Annuler</Button>
          <Button variant="danger" onClick={doReject} className="flex-1 sm:flex-none">Refuser la demande</Button>
        </div>
      </Modal>
    </div>
  );
}
