import type { UserRole } from "./App";

const CAN_EDIT_KEY = "canEdit";
const ROLE_KEY = "authRole";

export function getCurrentRole(): UserRole | null {
  try {
    const role = localStorage.getItem(ROLE_KEY);
    if (role === "manager" || role === "admin" || role === "technician" || role === "account") return role;
    return null;
  } catch {
    return null;
  }
}

function getRoleFromWindow(): UserRole | null {
  try {
    const role = (window as any).__authRole;
    if (role === "manager" || role === "admin" || role === "technician" || role === "account") return role;
    return null;
  } catch {
    return null;
  }
}

function getCanEditFromWindow(): boolean | null {
  try {
    const v = (window as any).__canEdit;
    if (typeof v === "boolean") return v;
    return null;
  } catch {
    return null;
  }
}

function getRoleFromToken(): UserRole | null {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return null;
    const parts = String(token).split(".");
    // token is: header.body.signature (demo JWT-like format)
    if (parts.length !== 3) return null;
    const b64Body = parts[1];
    let s = String(b64Body);
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const json = atob(s);
    const body = JSON.parse(json || "{}") as { role?: string };
    const role = String(body.role || "").toLowerCase();
    if (role === "manager" || role === "admin" || role === "technician" || role === "account") return role;
    return null;
  } catch {
    return null;
  }
}

export function canCurrentUserEditData(): boolean {
  try {
    // `canEdit` is stored in localStorage, but it can become stale if a user keeps an old session
    // after role/access rules are updated. Enforce the main rules based on role first.
    const role = getCurrentRole() || getRoleFromWindow() || getRoleFromToken();
    if (role === "admin") return false; // admin = view only
    if (role === "manager") return true; // manager = full access
    if (role === "account") return true; // account = full access

    // technician (and any other non-admin role) follows the stored permission flag
    const windowCanEdit = getCanEditFromWindow();
    if (windowCanEdit != null) return windowCanEdit;
    return localStorage.getItem(CAN_EDIT_KEY) === "true";
  } catch {
    return false;
  }
}

export function getCurrentUserDisplayName(): string {
  // Prefer in-memory fallback for environments where localStorage is blocked.
  try {
    const name = (window as any).__authDisplayName;
    if (name && String(name).trim()) return String(name).trim();
  } catch {}

  try {
    const name = localStorage.getItem("authDisplayName");
    if (name && String(name).trim()) return String(name).trim();
  } catch {
    // ignore
  }
  return "";
}

