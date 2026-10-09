import { useState } from "react";
import { useStore } from "../store";
import { IconEye, IconEyeOff } from "../components/Icons";

type Screen = "login" | "forgot";

export default function Login() {
  const { login, users, shopSettings: ss, notifyAll } = useStore();
  const [screen, setScreen] = useState<Screen>("login");

  // ── Login state ──
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Forgot state ──
  const [forgotId, setForgotId] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // ── Login : accept email, phone, or name ──
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    if (!identifier.trim() || !password) {
      setLoginError("Veuillez remplir tous les champs.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const result = login(identifier.trim(), password);
      if (!result.ok) setLoginError(result.error || "Erreur de connexion.");
      setLoading(false);
    }, 350);
  };

  // ── Forgot password ──
  const handleForgot = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError("");
    if (!forgotId.trim()) { setForgotError("Veuillez saisir votre email ou téléphone."); return; }

    setForgotLoading(true);
    setTimeout(() => {
      const q = forgotId.trim().toLowerCase();
      const found = users.find(u =>
        u.email.toLowerCase() === q ||
        (u.phone || "").replace(/\s/g, "") === q.replace(/\s/g, "")
      );

      if (!found) {
        setForgotError("Aucun compte trouvé avec cet email ou ce numéro de téléphone.");
        setForgotLoading(false);
        return;
      }

      // Notify all admins (general channel "*" since we target admins by role in store)
      notifyAll(
        "Demande de réinitialisation de mot de passe",
        `L'employé « ${found.name} » (${found.email}${found.phone ? " · " + found.phone : ""}) a oublié son mot de passe et demande de l'aide pour se connecter. Veuillez contacter cet employé pour l'assister.`,
        "warning",
        found.id,
        found.name,
      );
      setForgotSuccess(true);
      setForgotLoading(false);
    }, 400);
  };

  const brandLogo = ss.logo ? (
    <img src={ss.logo} alt="Logo" className="w-14 h-14 rounded-2xl object-cover shadow-lg" />
  ) : (
    <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white font-black text-2xl flex items-center justify-center shadow-lg">
      {(ss.name || "H")[0]?.toUpperCase()}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex mb-3">{brandLogo}</div>
          <h1 className="text-2xl font-black text-slate-900 tracking-wide">{ss.name || "Hi-Market"}</h1>
          <p className="text-sm text-slate-500 mt-1">{ss.type || "Gestion Commerciale"}</p>
        </div>

        {/* ══ LOGIN FORM ══ */}
        {screen === "login" && (
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-7 sm:p-9">
            <h2 className="text-2xl font-black text-slate-900 mb-6">Connexion</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Identifier */}
              <div>
                <input
                  type="text"
                  placeholder="Email, nom d'utilisateur ou téléphone"
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setLoginError(""); }}
                  className="w-full bg-slate-50 border-0 rounded-2xl px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 transition"
                  autoComplete="username"
                  autoFocus
                />
              </div>

              {/* Password */}
              <div className="relative">
                <input
                  type={showPwd ? "text" : "password"}
                  placeholder="Mot de passe"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setLoginError(""); }}
                  className="w-full bg-slate-50 border-0 rounded-2xl px-5 py-3.5 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 transition"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
                  tabIndex={-1}
                >
                  {showPwd ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                </button>
              </div>

              {/* Error */}
              {loginError && (
                <div className="bg-rose-50 text-rose-700 text-sm font-medium px-4 py-3 rounded-2xl border border-rose-100">
                  {loginError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm py-3.5 rounded-2xl transition active:scale-[.98] disabled:opacity-70 shadow-lg shadow-slate-900/20"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Connexion en cours...
                  </span>
                ) : "Se connecter"}
              </button>
            </form>

            {/* Forgot password link */}
            <div className="mt-6 text-center">
              <button
                onClick={() => { setScreen("forgot"); setForgotId(""); setForgotError(""); setForgotSuccess(false); }}
                className="text-sm text-slate-500 hover:text-slate-900 transition underline underline-offset-2"
              >
                Mot de passe oublié ?
              </button>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400">Contactez l'administrateur si vous n'avez pas de compte.</p>
            </div>
          </div>
        )}

        {/* ══ FORGOT PASSWORD FORM ══ */}
        {screen === "forgot" && (
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 p-7 sm:p-9">
            <button
              onClick={() => setScreen("login")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition mb-5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Retour à la connexion
            </button>

            <h2 className="text-2xl font-black text-slate-900 mb-2">Mot de passe oublié</h2>
            <p className="text-sm text-slate-500 mb-6">
              Renseignez votre email ou numéro de téléphone. L'administrateur sera notifié et pourra vous aider.
            </p>

            {!forgotSuccess ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <input
                  type="text"
                  placeholder="Email ou numéro de téléphone"
                  value={forgotId}
                  onChange={e => { setForgotId(e.target.value); setForgotError(""); }}
                  className="w-full bg-slate-50 border-0 rounded-2xl px-5 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-slate-900/10 transition"
                  autoFocus
                />

                {forgotError && (
                  <div className="bg-rose-50 text-rose-700 text-sm font-medium px-4 py-3 rounded-2xl border border-rose-100">
                    {forgotError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm py-3.5 rounded-2xl transition active:scale-[.98] disabled:opacity-70 shadow-lg shadow-slate-900/20"
                >
                  {forgotLoading ? "Envoi en cours..." : "Envoyer la notification"}
                </button>
              </form>
            ) : (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
                  ✓
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-lg">Notification envoyée</div>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                    L'administrateur a été notifié de votre demande dans son espace. Contactez-le directement si besoin.
                  </p>
                </div>
                <button
                  onClick={() => setScreen("login")}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm py-3 rounded-2xl transition mt-2"
                >
                  Retour à la connexion
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 mt-6">
          © {new Date().getFullYear()} {ss.name || "Hi-Market"} · Tous droits réservés
        </p>
      </div>
    </div>
  );
}
