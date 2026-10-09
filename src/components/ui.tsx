import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  footer?: ReactNode;
  bodyClassName?: string;
};

export function Modal({ open, onClose, title, children, size = "md", footer, bodyClassName = "" }: ModalProps) {
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${w} flex flex-col max-h-[calc(100vh-1.5rem)] animate-[fadeIn_.15s_ease-out]`}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 flex-shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate pr-2">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none w-8 h-8 rounded-lg hover:bg-slate-100 transition flex items-center justify-center flex-shrink-0">✕</button>
        </div>
        <div className={`p-5 overflow-y-auto flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-200 flex-shrink-0 bg-slate-50/70 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

type ToastCtx = { push: (msg: string, type?: "success" | "error" | "info") => void };
const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; type: string }[]>([]);
  const push = (msg: string, type = "success") => {
    const id = Date.now();
    setItems(xs => [...xs, { id, msg, type }]);
    setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), 2800);
  };
  const colors: Record<string, string> = {
    success: "bg-emerald-600",
    error: "bg-rose-600",
    info: "bg-slate-800",
  };
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {items.map(it => (
          <div key={it.id} className={`${colors[it.type]} text-white text-sm px-4 py-3 rounded-xl shadow-xl min-w-[220px] max-w-sm`}>
            {it.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function Button({ children, variant = "primary", className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "success" | "outline" }) {
  const styles: Record<string, string> = {
    primary: "bg-slate-900 hover:bg-slate-800 text-white shadow-sm",
    ghost: "bg-slate-100 hover:bg-slate-200 text-slate-800",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white",
    outline: "bg-white border border-slate-300 hover:border-slate-500 text-slate-800",
  };
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}>{children}</button>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full border border-slate-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 transition";

export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 mb-4">{icon ?? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>}</div>
      <h4 className="text-lg font-bold text-slate-800">{title}</h4>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "emerald" | "rose" | "amber" | "sky" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    amber: "bg-amber-100 text-amber-700",
    sky: "bg-sky-100 text-sky-700",
  };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 ${className}`}>{children}</div>;
}

// ─── SearchSelect — select avec champ de recherche ───────────────────

interface SearchSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; [key: string]: unknown }[];
  placeholder?: string;
  className?: string;
  /** Option 'Toutes' affichée en haut (uniquement si non vide) */
  allLabel?: string;
}

export function SearchSelect({ value, onChange, options, placeholder = "Rechercher…", className = "", allLabel }: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fermer au clic extérieur
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = options.filter(o => !query || o.label.toLowerCase().includes(query.toLowerCase()));

  // Texte affiché quand le dropdown est fermé
  const displayLabel = options.find(o => o.value === value)?.label || placeholder;

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Champ affichage */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-sm text-left transition ${open ? "border-slate-800 ring-2 ring-slate-800/10" : "border-slate-300 hover:border-slate-400"} ${value ? "text-slate-900" : "text-slate-400"}`}
      >
        <span className="truncate">{displayLabel}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-[280px] overflow-hidden animate-[fadeIn_.12s_ease-out]">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-800/10 transition"
            />
          </div>
          <div className="overflow-y-auto max-h-[230px]">
            {/* Option "Toutes" si défini */}
            {allLabel && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={`w-full text-left px-3 py-2 text-sm font-semibold transition ${value === "" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {allLabel}
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">Aucun résultat</div>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => handleSelect(o.value)}
                className={`w-full text-left px-3 py-2 text-sm transition ${o.value === value ? "bg-slate-900 text-white font-semibold" : "text-slate-700 hover:bg-slate-50"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  icon?: ReactNode;
};

type ConfirmCtx = { ask: (opts: ConfirmOptions) => Promise<boolean> };
const ConfirmContext = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const respond = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  };

  const isDanger = state?.variant === "danger";
  const defaultIcon = isDanger
    ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  const icon = state?.icon ?? defaultIcon;

  return (
    <ConfirmContext.Provider value={{ ask }}>
      {children}
      {state?.open && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_.12s_ease-out]"
          onClick={() => respond(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-0 animate-[popIn_.18s_ease-out] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${isDanger ? "bg-rose-100" : "bg-slate-100"}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-lg font-black text-slate-900">{state?.title || "Confirmation"}</h3>
                  <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{state?.message}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => respond(false)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-sm transition active:scale-[.97]"
              >
                {state?.cancelLabel || "Annuler"}
              </button>
              <button
                onClick={() => respond(true)}
                className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition active:scale-[.97] shadow-sm ${
                  isDanger
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20"
                    : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-900/20"
                }`}
              >
                {state?.confirmLabel || "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: translateY(6px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx.ask;
}
