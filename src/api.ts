/**
 * Client HTTP de l'API Hi-Market (Laravel + Sanctum).
 *
 * - URL de base : VITE_API_URL (ex. https://api.monmagasin.com/api), sinon « /api »
 *   (proxy Vite en développement, ou même domaine quand Laravel sert l'interface).
 * - Authentification : jeton Bearer conservé dans le localStorage (c'est la SEULE donnée gardée côté navigateur).
 */

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || "/api").replace(/\/+$/, "");
const TOKEN_KEY = "hm_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* stockage indisponible : la session ne survivra pas au rechargement */ }
}

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(message: string, status: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

let onUnauthorized: (() => void) | null = null;
/** Appelé quand le serveur répond 401 sur une session ouverte (jeton expiré, compte désactivé…). */
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

/**
 * Mode « stockage local » (VITE_STORAGE=local, version GitHub Pages) : aucune requête réseau,
 * l'API est rejouée dans le navigateur (src/local) et les données restent dans le localStorage.
 */
export const LOCAL_MODE = import.meta.env.VITE_STORAGE === "local";

export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let status: number;
  let data: unknown = null;

  if (LOCAL_MODE) {
    const { localRequest } = await import("./local/server");
    const r = await localRequest(method, path, body !== undefined ? JSON.parse(JSON.stringify(body)) : undefined, token);
    status = r.status;
    data = r.data;
  } else {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError("Impossible de joindre le serveur. Vérifiez votre connexion et que l'API est démarrée.", 0);
    }
    status = res.status;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  }

  if (status < 200 || status >= 300) {
    const res = { status };
    const d = (data || {}) as { message?: string; errors?: Record<string, string[]> };
    const errors = d.errors || {};
    // Message le plus parlant : première erreur de validation, sinon message du serveur
    const first = Object.values(errors)[0]?.[0];
    if (res.status === 401 && token && path !== "/login") onUnauthorized?.();
    throw new ApiError(
      first || d.message || (res.status === 401 ? "Session expirée. Reconnectez-vous." : `Erreur serveur (${res.status}).`),
      res.status,
      errors,
    );
  }
  return data as T;
}

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : "Une erreur est survenue.");
