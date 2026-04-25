import { createContext, useContext } from "react";
import type { UserRole } from "./App";

export type AuthState = {
  role: UserRole | null;
  token: string | null;
  displayName: string;
  canEdit: boolean;
};

const AuthContext = createContext<AuthState>({
  role: null,
  token: null,
  displayName: "",
  canEdit: false,
});

export const AuthProvider = AuthContext.Provider;

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function useCanEdit(): boolean {
  return useAuth().canEdit;
}

