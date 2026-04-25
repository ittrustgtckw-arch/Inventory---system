import { getAuthToken } from "./authToken";

/** JSON request headers plus Bearer token when logged in. */
export function authHeadersJson(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
