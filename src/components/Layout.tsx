import { ReactNode, useState, useEffect } from "react";
import { IconMenu, IconClose, IconLogout, IconBell } from "./Icons";
import { NAV_ITEMS, NavKey } from "./nav";
import { useStore } from "../store";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("") || "U";
}

export default function Layout({ active, setActive, children }: { active: NavKey; setActive: (k: NavKey) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const { currentUser, currentUserRole, roleName, canAccess, shopSettings, logout, unreadCount } = useStore();

  // "myspace" toujours visible pour tout employé connecté
  const visibleNav = NAV_ITEMS.filter(n => n.key === "myspace" || canAccess(n.key));

  // Fallback si la page active n'est plus permise (ex: après changement de rôle)
  useEffect(() => {
    if (active !== "myspace" && !canAccess(active)) {
      const fallback = visibleNav[0]?.key || "dashboard";
      setActive(fallback as NavKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserRole, active]);

  const go = (k: NavKey) => { setActive(k); setOpen(false); };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-lg h-16">
        <div className="max-w-[1600px] h-full mx-auto flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(o => !o)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/10 active:scale-95 transition">
              {open ? <IconClose size={20} /> : <IconMenu size={20} />}
            </button>
            <div className="flex items-center gap-2.5">
              {shopSettings.logo ? (
                <img src={shopSettings.logo} alt="Logo" className="w-9 h-9 rounded-xl object-cover shadow" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-white text-slate-900 font-black flex items-center justify-center text-lg shadow">
                  {(shopSettings.name || "H")[0]?.toUpperCase()}
                </div>
              )}
              <div className="leading-tight">
                <div className="font-black text-lg tracking-wide">{shopSettings.name || "Hi-Market"}</div>
                <div className="text-[11px] text-slate-300 -mt-0.5">{shopSettings.type || "Gestion Commerciale"}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notification bell */}
            <button
              onClick={() => go("myspace")}
              className="relative p-2 rounded-lg hover:bg-white/10 transition active:scale-95"
              title="Mes notifications"
            >
              <IconBell size={19} className="text-slate-200" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {/* User profile */}
            <button onClick={() => go("myspace")} className="flex items-center gap-2.5 pl-1 sm:pl-2 pr-1 py-1 rounded-xl hover:bg-white/10 transition" title="Mon espace">
              <div className="relative">
                {currentUser?.avatar ? (
                  <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-white/20" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-xs">{initials(currentUser?.name || "")}</div>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900" title="En ligne" />
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-sm font-semibold text-white">{currentUser?.name}</div>
                <div className="text-[11px] text-slate-300">{roleName(currentUser?.role || "")}</div>
              </div>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex min-h-[calc(100vh-4rem)]">
        <aside
          className={`${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-16 z-30 w-72 lg:w-64 xl:w-72 shrink-0 bg-white border-r border-slate-200 transition-transform duration-200 ease-out flex flex-col h-[calc(100vh-4rem)]`}
        >
          <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
            {visibleNav.map(n => {
              const isActive = n.key === active;
              return (
                <button
                  key={n.key}
                  onClick={() => go(n.key)}
                  className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-slate-900 text-white shadow-md shadow-slate-900/20"
                      : "text-slate-700 hover:bg-slate-100 hover:translate-x-0.5"
                  }`}
                >
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-white" />}
                  <span className={`transition-colors ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-900"}`}>{n.icon}</span>
                  <span>{n.label}</span>
                </button>
              );
            })}
            {visibleNav.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">Aucune page autorisée.</p>
            )}
          </nav>

          <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50/60">
            <button
              onClick={() => setLogoutOpen(true)}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <span className="transition-transform duration-200 group-hover:-translate-x-0.5">
                <IconLogout size={18} />
              </span>
              <span>Se déconnecter</span>
            </button>

            <div className="text-[11px] text-slate-400 px-2 pt-1">
              © {new Date().getFullYear()} {shopSettings.name || "Hi-Market"}
            </div>
          </div>
        </aside>

        {open && <div onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 top-16 bg-slate-900/40 backdrop-blur-[2px] z-20" />}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {children}
        </main>
      </div>

      {logoutOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_.15s_ease-out]"
          onClick={() => setLogoutOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-[popIn_.18s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-5">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <IconLogout size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-black text-slate-900">Se déconnecter ?</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Vous êtes connecté en tant que <span className="font-semibold text-slate-700">{currentUser?.name}</span>. Voulez-vous vraiment fermer la session ?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLogoutOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm transition active:scale-[.97]"
              >
                Annuler
              </button>
              <button
                onClick={() => { setLogoutOpen(false); logout(); }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition active:scale-[.97] shadow-sm shadow-rose-600/30"
              >
                Me déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: translateY(6px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

export type { NavKey };
