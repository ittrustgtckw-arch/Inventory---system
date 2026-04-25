let memoryToken: string | null = null;

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const token = localStorage.getItem("authToken");
    if (token) {
      memoryToken = token;
      return token;
    }
  } catch {
    // ignore storage access issues
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  memoryToken = token || null;
}

export function clearAuthToken(): void {
  memoryToken = null;
}
