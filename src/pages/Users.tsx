import { useState } from "react";
import { useStore, fmtDate } from "../store";
import { User, Role } from "../types";
import { NAV_ITEMS, NavKey } from "../components/nav";
import { Card, Button, Modal, Field, inputClass, EmptyState, Badge, SearchSelect } from "../components/ui";
import { IconPlus, IconEdit, IconTrash, IconCheck, IconEye, IconEyeOff, IconRefresh, IconCamera } from "../components/Icons";
import { useToast, useConfirm } from "../components/ui";

type Tone = "slate" | "emerald" | "rose" | "amber" | "sky";

export default function UsersPage() {
  const { users, roles, addRole, updateRole, deleteRole, roleName, currentUser, requestOrExec, onlineUsers, makeAvatarPreview } = useStore();
  const { push } = useToast();
  const confirm = useConfirm();

  // ----- User modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const defaultRoleId = roles.find(r => r.id === "caissier")?.id || roles[0]?.id || "";
  const [form, setForm] = useState<Partial<User>>({ role: defaultRoleId, active: true });
  const [showPwd, setShowPwd] = useState(true);

  // Gestion de l'avatar dans le formulaire employé
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { push("Image trop lourde (max 2 Mo)", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, avatar: reader.result as string }));
    reader.readAsDataURL(file);
  };

  // ----- Roles modal state
  const [rolesOpen, setRolesOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fPerms, setFPerms] = useState<NavKey[]>([]);

  // ---------------- Users CRUD
  const openAdd = () => {
    setEditing(null);
    setForm({ role: defaultRoleId, active: true, password: "" });
    setShowPwd(true);
    setOpen(true);
  };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ ...u });
    setShowPwd(true);
    setOpen(true);
  };
  const saveUser = async () => {
    if (!form.name || !form.email || !form.role) return push("Nom, email et rôle requis", "error");
    const roleLabel = roles.find(r => r.id === form.role)?.name || form.role;

    if (editing) {
      // Tableau structuré des champs modifiés (hors photo, affichée en comparatif)
      const changes: { champ: string; avant: string; après: string }[] = [];
      if (form.name !== editing.name)   changes.push({ champ: "Nom complet", avant: editing.name, après: form.name || "" });
      if (form.email !== editing.email) changes.push({ champ: "Email", avant: editing.email, après: form.email || "" });
      if (form.phone !== editing.phone) changes.push({ champ: "Téléphone", avant: editing.phone || "—", après: form.phone || "—" });
      if (form.role !== editing.role)   changes.push({ champ: "Rôle", avant: roles.find(r => r.id === editing.role)?.name || editing.role, après: roleLabel });
      if (form.active !== editing.active) changes.push({ champ: "Statut", avant: editing.active ? "Actif" : "Désactivé", après: form.active ? "Actif" : "Désactivé" });
      if (form.password)                changes.push({ champ: "Mot de passe", avant: "••••••••", après: "Nouveau mot de passe" });

      // Préserver une miniature de l'ancienne photo pour la comparaison avant/après
      const avatarChanged = form.avatar !== editing.avatar;
      let avatarAvant: string | undefined;
      if (avatarChanged) {
        avatarAvant = editing.avatar ? await makeAvatarPreview(editing.avatar) : "";
      }

      const ok = requestOrExec({
        kind: "user.update", module: "Employés", action: "Modifier un employé",
        description: `Modification de « ${form.name} » — rôle : ${roleLabel}`,
        details: {
          employé: form.name || "",
          changes,
          ...(avatarChanged ? { avatar_avant: avatarAvant ?? "" } : {}),
        },
        payload: { id: editing.id, data: form },
      });
      push(ok ? "Employé modifié" : "Action en attente de validation");
    } else {
      const ok = requestOrExec({
        kind: "user.add", module: "Employés", action: "Ajouter un employé",
        description: `Nouvel employé « ${form.name} » — rôle : ${roleLabel}`,
        details: {
          nom: form.name || "",
          email: form.email || "",
          rôle: roleLabel,
          "photo de profil": form.avatar ? "Oui" : "Non",
        },
        payload: form,
      });
      push(ok ? "Employé ajouté" : "Action en attente de validation");
    }
    setOpen(false);
  };
  const removeUser = async (u: User) => {
    const ok = await confirm({
      title: "Supprimer l'employé",
      message: `Voulez-vous vraiment supprimer « ${u.name} » ? Son compte sera définitivement supprimé.`,
      confirmLabel: "Supprimer",
      variant: "danger",
    });
    if (!ok) return;
    const ok2 = requestOrExec({
      kind: "user.delete", module: "Employés", action: "Supprimer un employé",
      description: `Suppression de « ${u.name} »`, details: { nom: u.name },
      payload: { id: u.id },
    });
    push(ok2 ? "Employé supprimé" : "Action en attente de validation");
  };

  const generatePwd = () => {
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
    const digits = "23456789";
    const special = "!@#%&*?";
    const all = lower + upper + digits + special;
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    const arr = [pick(lower), pick(upper), pick(digits), pick(special)];
    for (let i = 0; i < 8; i++) arr.push(pick(all));
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    setForm(f => ({ ...f, password: arr.join("") }));
    setShowPwd(true);
  };

  const pwdStrength = (s: string): { score: number; label: string; tone: string } => {
    if (!s) return { score: 0, label: "—", tone: "bg-slate-200" };
    let score = 0;
    if (s.length >= 8) score++;
    if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score++;
    if (/\d/.test(s)) score++;
    if (/[^A-Za-z0-9]/.test(s)) score++;
    const map = [
      { label: "Très faible", tone: "bg-rose-500" },
      { label: "Faible", tone: "bg-rose-500" },
      { label: "Moyen", tone: "bg-amber-500" },
      { label: "Bon", tone: "bg-sky-500" },
      { label: "Excellent", tone: "bg-emerald-500" },
    ];
    return { score, ...map[score] };
  };

  const roleTone = (roleId: string): Tone => {
    if (roleId === "admin") return "rose";
    const r = roles.find(x => x.id === roleId);
    if (r?.isSystem) return "sky";
    return "amber";
  };
  const usersByRole = (roleId: string) => users.filter(u => u.role === roleId).length;

  // ---------------- Roles modal
  const openRolesCreate = () => {
    setRolesOpen(true);
    // on vide d'abord puis on met en mode création
    setSelectedId(null);
    setFName("");
    setFDesc("");
    setFPerms([]);
  };
  const openRolesEdit = (r: Role) => {
    setRolesOpen(true);
    setSelectedId(r.id);
    setFName(r.name);
    setFDesc(r.description || "");
    setFPerms([...r.permissions] as NavKey[]);
  };
  const loadRole = (r: Role) => {
    setSelectedId(r.id);
    setFName(r.name);
    setFDesc(r.description || "");
    setFPerms([...r.permissions] as NavKey[]);
  };
  const newRole = () => {
    setSelectedId(null);
    setFName("");
    setFDesc("");
    setFPerms([]);
  };
  const togglePerm = (k: NavKey) => {
    setFPerms(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k]);
  };
  const selectAllPerms = () => setFPerms(NAV_ITEMS.map(n => n.key));
  const clearAllPerms = () => setFPerms([]);

  const saveRole = () => {
    const name = fName.trim();
    if (!name) return push("Le nom du rôle est requis", "error");
    if (fPerms.length === 0) return push("Sélectionnez au moins une page d'accès", "error");
    if (selectedId) {
      updateRole(selectedId, { name, description: fDesc.trim(), permissions: fPerms });
      push(`Rôle « ${name} » mis à jour`);
    } else {
      const created = addRole({ name, description: fDesc.trim(), permissions: fPerms, isSystem: false });
      setSelectedId(created.id);
      push(`Rôle « ${name} » créé`);
    }
  };

  const removeRole = async () => {
    if (!selectedId) return;
    const r = roles.find(x => x.id === selectedId);
    if (!r) return;
    if (r.isSystem) return push("Les rôles système ne peuvent pas être supprimés", "error");
    const n = usersByRole(r.id);
    if (n > 0) return push(`Ce rôle est assigné à ${n} employé(s)`, "error");
    const ok = await confirm({
      title: "Supprimer le rôle",
      message: `Voulez-vous vraiment supprimer le rôle « ${r.name} » ? Cette action est irréversible.`,
      confirmLabel: "Supprimer le rôle",
      variant: "danger",
    });
    if (!ok) return;
    deleteRole(r.id);
    push(`Rôle « ${r.name} » supprimé`);
    const remaining = roles.filter(x => x.id !== r.id);
    if (remaining.length > 0) loadRole(remaining[0]); else newRole();
  };

  const selectedRole = selectedId ? roles.find(r => r.id === selectedId) : null;
  const isCurrentRole = selectedId === currentUser?.role;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900">Gestion des employés</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{users.length} employé{users.length > 1 ? "s" : ""} · {roles.length} rôle{roles.length > 1 ? "s" : ""} configuré{roles.length > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={openRolesCreate} className="flex-1 sm:flex-none">
            <IconPlus size={16} /> Nouveau rôle
          </Button>
          <Button onClick={openAdd} className="flex-1 sm:flex-none"><IconPlus size={16} /> Nouvel employé</Button>
        </div>
      </div>

      {/* Roles summary chips */}
      <div className="flex flex-wrap gap-2">
        {roles.map(r => (
          <button
            key={r.id}
            onClick={() => openRolesEdit(r)}
            className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 hover:border-slate-900 hover:bg-slate-900 hover:text-white transition text-xs font-semibold text-slate-700"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${r.isSystem ? "bg-sky-500 group-hover:bg-white" : "bg-amber-500 group-hover:bg-white"}`} />
            {r.name}
            <span className="text-slate-400 group-hover:text-slate-300">· {usersByRole(r.id)} employé{usersByRole(r.id) > 1 ? "s" : ""}</span>
          </button>
        ))}
      </div>

      {/* Users table — desktop */}
      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600 uppercase text-xs border-b border-slate-200">
                <th className="py-3 px-4">Nom</th>
                <th className="py-3 px-4 hidden lg:table-cell">Email</th>
                <th className="py-3 px-4">Rôle</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 hidden xl:table-cell">Créé le</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-semibold">
                    <div className="flex items-center gap-2.5">
                      {/* Avatar ou initiales */}
                      <div className="relative flex-shrink-0">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                            {u.name.split(" ").map(s => s[0]?.toUpperCase()).slice(0, 2).join("")}
                          </div>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${onlineUsers.includes(u.id) ? "bg-emerald-500" : "bg-slate-300"}`} title={onlineUsers.includes(u.id) ? "En ligne" : "Hors ligne"} />
                      </div>
                      <span className="font-semibold">{u.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 hidden lg:table-cell">{u.email}</td>
                  <td className="py-3 px-4"><Badge tone={roleTone(u.role)}>{roleName(u.role)}</Badge></td>
                  <td className="py-3 px-4">
                    <Badge tone={u.active ? "emerald" : "slate"}>{u.active ? "Actif" : "Désactivé"}</Badge>
                  </td>
                  <td className="py-3 px-4 text-slate-600 hidden xl:table-cell">{fmtDate(u.createdAt)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-slate-100 inline-flex"><IconEdit size={16} /></button>
                    <button onClick={() => removeUser(u)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600 inline-flex"><IconTrash size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 && <EmptyState title="Aucun employé" />}
      </Card>

      {/* Users cards — mobile */}
      <div className="md:hidden space-y-3">
        {users.length === 0 && <Card className="p-6"><EmptyState title="Aucun employé" /></Card>}
        {users.map(u => (
          <Card key={u.id} className="p-4">
            <div className="flex items-center gap-3">
              {/* Avatar mobile */}
              <div className="relative flex-shrink-0">
                {u.avatar ? (
                  <img src={u.avatar} alt={u.name} className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center shadow-sm">
                    {u.name.split(" ").map(s => s[0]?.toUpperCase()).slice(0, 2).join("")}
                  </div>
                )}
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${onlineUsers.includes(u.id) ? "bg-emerald-500" : "bg-slate-300"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 truncate">{u.name}</div>
                  <Badge tone={u.active ? "emerald" : "slate"}>{u.active ? "Actif" : "Désactivé"}</Badge>
                </div>
                {u.email && <div className="text-xs text-slate-500 mt-0.5 truncate">{u.email}</div>}
                {u.phone && <div className="text-xs text-slate-500">{u.phone}</div>}
              </div>
            </div>
            <div className="mt-2.5"><Badge tone={roleTone(u.role)}>{roleName(u.role)}</Badge></div>
            <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100">
              <button onClick={() => openEdit(u)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition active:scale-[.97]"><IconEdit size={14} /> Modifier</button>
              <button onClick={() => removeUser(u)} className="flex items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition active:scale-[.97]"><IconTrash size={14} /></button>
            </div>
          </Card>
        ))}
      </div>

      {/* ---------------- User modal ---------------- */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Modifier l'employé" : "Nouvel employé"}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 hidden sm:block">
              {editing ? "Le mot de passe est confidentiel et ne figure pas dans le tableau." : "Attribuez un mot de passe pour permettre la connexion."}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={saveUser}>{editing ? "Enregistrer" : "Créer l'employé"}</Button>
            </div>
          </div>
        }
      >
        {/* Photo de profil */}
        <div className="flex items-center gap-4 mb-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="relative group flex-shrink-0">
            {form.avatar ? (
              <img src={form.avatar} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 shadow" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-900 text-white font-black text-xl flex items-center justify-center shadow">
                {(form.name || "?").split(" ").map(s => s[0]?.toUpperCase()).slice(0, 2).join("")}
              </div>
            )}
            <label className="absolute inset-0 bg-slate-900/55 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
              <IconCamera size={18} className="text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </label>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-900">{form.name || "Nouvel employé"}</div>
            <div className="text-xs text-slate-500 mt-1">Cliquez sur la photo pour la modifier</div>
            <div className="flex gap-2 mt-2">
              <label className="cursor-pointer text-xs font-semibold text-sky-700 hover:underline flex items-center gap-1">
                <IconCamera size={13} /> Choisir une photo
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
              {form.avatar && (
                <button type="button" onClick={() => setForm(f => ({ ...f, avatar: "" }))} className="text-xs font-semibold text-rose-600 hover:underline">
                  Supprimer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom complet"><input className={inputClass} value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="employe@himarket.sn" /></Field>
          <Field label="Téléphone"><input className={inputClass} value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="77 123 45 67" /></Field>
          <Field label="Rôle">
            <SearchSelect value={form.role || ""} onChange={v => setForm({ ...form, role: v })}
              options={roles.map(r => ({ value: r.id, label: `${r.name}${r.isSystem ? " (système)" : ""}` }))} />
          </Field>
          <Field label="Statut">
            <label className="flex items-center gap-2 py-2 cursor-pointer">
              <input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-slate-900" />
              <span className="text-sm">Compte actif</span>
            </label>
          </Field>
        </div>

        {/* Password field — visible ONLY in this form, never in the users table */}
        <div className="mt-5">
          <Field
            label={editing ? "Mot de passe" : "Mot de passe initial"}
            hint="Confidentiel · affiché uniquement dans ce formulaire, jamais dans le tableau."
          >
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                className={inputClass + " pr-24 font-mono tracking-wide"}
                value={form.password || ""}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? "Modifier le mot de passe" : "Saisir ou générer un mot de passe"}
                autoComplete="new-password"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition"
                  title={showPwd ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPwd ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={generatePwd}
                  className="p-1.5 rounded-md hover:bg-slate-100 text-slate-700 transition active:scale-90"
                  title="Générer un mot de passe sécurisé"
                >
                  <IconRefresh size={14} />
                </button>
              </div>
            </div>
            {(() => {
              const st = pwdStrength(form.password || "");
              return (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= st.score ? st.tone : "bg-slate-200"}`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 w-20 text-right">{st.label}</span>
                </div>
              );
            })()}
          </Field>
        </div>

        {form.role && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <div className="font-semibold text-slate-800 mb-1">Accès accordés par ce rôle :</div>
            <div className="flex flex-wrap gap-1">
              {(roles.find(r => r.id === form.role)?.permissions || []).map(p => (
                <span key={p} className="px-2 py-0.5 rounded-md bg-white border border-slate-200">{NAV_ITEMS.find(n => n.key === p)?.label || p}</span>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- Roles modal ---------------- */}
      <Modal
        open={rolesOpen}
        onClose={() => setRolesOpen(false)}
        title="Gestion des rôles & permissions"
        size="lg"
        bodyClassName="!p-4"
        footer={
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              {selectedRole && !selectedRole.isSystem && usersByRole(selectedRole.id) === 0 && (
                <Button variant="ghost" onClick={removeRole} className="text-rose-600 hover:bg-rose-50">
                  <IconTrash size={14} /> Supprimer
                </Button>
              )}
              {selectedRole?.isSystem && (
                <span className="text-[11px] text-slate-400">Rôle système · non supprimable</span>
              )}
              {selectedRole && !selectedRole.isSystem && usersByRole(selectedRole.id) > 0 && (
                <span className="text-[11px] text-slate-400">Assigné à {usersByRole(selectedRole.id)} employé(s)</span>
              )}
              {!selectedRole && (
                <span className="text-[11px] text-slate-400">Nouveau rôle personnalisé</span>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" onClick={() => setRolesOpen(false)}>Fermer</Button>
              <Button onClick={saveRole}>
                <IconCheck size={14} /> {selectedRole ? "Enregistrer" : "Créer le rôle"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-[min(62vh,540px)]">
          {/* Left : roles list */}
          <div className="flex flex-col gap-2 md:min-h-0">
            <div className="flex items-center justify-between flex-shrink-0">
              <h4 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">Rôles <span className="text-slate-400 font-normal normal-case">({roles.length})</span></h4>
              <button
                onClick={newRole}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition active:scale-95"
              >
                <IconPlus size={12} /> Nouveau
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto md:flex-1 md:min-h-0 pr-1">
              {/* "Create" dashed card */}
              <button
                onClick={newRole}
                className={`w-full text-left p-2.5 rounded-xl border-2 border-dashed transition-all flex items-center gap-2.5 ${
                  selectedId === null
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20 -translate-y-0.5"
                    : "border-slate-300 bg-slate-50 hover:border-slate-900 hover:bg-white text-slate-700 hover:-translate-y-0.5"
                }`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedId === null ? "bg-white/15" : "bg-white border border-slate-200"}`}>
                  <IconPlus size={13} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">Créer un rôle</span>
                  <span className={`block text-[11px] truncate ${selectedId === null ? "text-slate-300" : "text-slate-500"}`}>Nouveau profil d'accès</span>
                </span>
                {selectedId === null && <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />}
              </button>

              {roles.map(r => {
                const sel = r.id === selectedId;
                const n = usersByRole(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => loadRole(r)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-all ${
                      sel
                        ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/20 -translate-y-0.5"
                        : "border-slate-200 bg-white hover:border-slate-400 hover:-translate-y-0.5 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm truncate">{r.name}</div>
                      {r.isSystem && (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${sel ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"}`}>
                          Système
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <div className={`text-[11px] mt-0.5 line-clamp-1 ${sel ? "text-slate-300" : "text-slate-500"}`}>{r.description}</div>
                    )}
                    <div className={`flex items-center gap-2 mt-1 text-[10px] ${sel ? "text-slate-300" : "text-slate-500"}`}>
                      <span>{r.permissions.length} page{r.permissions.length > 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{n} employé{n > 1 ? "s" : ""}</span>
                    </div>
                  </button>
                );
              })}
              {roles.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Aucun rôle.</p>
              )}
            </div>
          </div>

          {/* Right : editor */}
          <div
            key={selectedId ?? "__new__"}
            className="flex flex-col gap-2.5 md:min-h-0 border-t md:border-t-0 md:border-l border-slate-200 md:pl-4 pt-3 md:pt-0 animate-[editorIn_.3s_ease-out]"
          >
            {/* Contextual header — compact */}
            <div className={`relative overflow-hidden rounded-xl p-3 border flex-shrink-0 ${
              selectedRole
                ? "bg-white border-slate-200"
                : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-slate-900 text-white"
            }`}>
              {!selectedRole && <div className="pointer-events-none absolute -right-6 -top-6 w-20 h-20 rounded-full bg-white/5" />}
              <div className="relative flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base flex-shrink-0 shadow-sm ${
                  selectedRole ? "bg-slate-900 text-white" : "bg-white text-slate-900"
                }`}>
                  {selectedRole ? (selectedRole.name.trim()[0]?.toUpperCase() || "R") : "+"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[9px] font-bold uppercase tracking-[0.15em] ${selectedRole ? "text-slate-500" : "text-slate-300"}`}>
                    {selectedRole ? "Édition" : "Création"}
                  </div>
                  <div className={`text-sm font-black truncate ${selectedRole ? "text-slate-900" : "text-white"}`}>
                    {selectedRole ? selectedRole.name : "Nouveau rôle"}
                  </div>
                </div>
                {selectedRole && (
                  <div className="text-right text-[10px] text-slate-500 leading-tight flex-shrink-0">
                    <div><span className="font-black text-slate-900 text-xs">{usersByRole(selectedRole.id)}</span> employé{usersByRole(selectedRole.id) > 1 ? "s" : ""}</div>
                    <div><span className="font-black text-slate-900 text-xs">{selectedRole.permissions.length}</span> page{selectedRole.permissions.length > 1 ? "s" : ""}</div>
                  </div>
                )}
              </div>
            </div>

            {isCurrentRole && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex-shrink-0">
                Rôle actuellement utilisé · modifications immédiates
              </div>
            )}

            {/* Name + description */}
            <div className="grid grid-cols-1 gap-2 flex-shrink-0">
              <Field label="Nom du rôle">
                <input
                  className={inputClass + " !py-1.5"}
                  placeholder="Ex : Responsable rayon"
                  value={fName}
                  onChange={e => setFName(e.target.value)}
                />
              </Field>
              <Field label="Description (optionnel)">
                <input
                  className={inputClass + " !py-1.5"}
                  placeholder="Rôle dédié à la gestion du rayon frais"
                  value={fDesc}
                  onChange={e => setFDesc(e.target.value)}
                />
              </Field>
            </div>

            {/* Permissions */}
            <div className="flex flex-col gap-1.5 flex-1 md:min-h-0">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                  Pages <span className="text-slate-400 font-normal normal-case">({fPerms.length}/{NAV_ITEMS.length})</span>
                </div>
                <div className="flex gap-1 text-[11px]">
                  <button onClick={selectAllPerms} className="px-2 py-0.5 rounded-md hover:bg-slate-100 text-slate-700 font-semibold">Tout</button>
                  <button onClick={clearAllPerms} className="px-2 py-0.5 rounded-md hover:bg-slate-100 text-slate-700 font-semibold">Rien</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1.5 overflow-y-auto md:flex-1 md:min-h-0 pr-1">
                {NAV_ITEMS.map((n, i) => {
                  const on = fPerms.includes(n.key);
                  return (
                    <button
                      key={n.key}
                      type="button"
                      onClick={() => togglePerm(n.key)}
                      style={{ animationDelay: `${i * 22}ms` }}
                      className={`group flex items-center gap-2.5 p-2 rounded-lg border text-left transition-all active:scale-[.98] animate-[tileIn_.3s_ease-out_both] ${
                        on
                          ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/20"
                          : "bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                        on ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                      }`}>
                        {n.icon}
                      </span>
                      <span className="flex-1 text-xs font-semibold truncate">{n.label}</span>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                        on ? "bg-white text-slate-900 scale-100" : "bg-slate-100 text-transparent scale-90"
                      }`}>
                        <IconCheck size={10} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <style>{`
        @keyframes editorIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tileIn {
          from { opacity: 0; transform: scale(.94) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
