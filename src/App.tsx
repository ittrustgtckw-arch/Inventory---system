import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { StockAvailability } from "./pages/StockAvailability";
import { SoldStock } from "./pages/SoldStock";
import { SoldStockDetail } from "./pages/SoldStockDetail";
import { Equipment } from "./pages/Equipment";
import { EquipmentDetail } from "./pages/EquipmentDetail";
import { Clients } from "./pages/Clients";
import { Projects } from "./pages/Projects";
import { Alerts } from "./pages/Alerts";
import { Activities } from "./pages/Activities";
import { SearchResultDetail } from "./pages/SearchResultDetail";
import { Login } from "./pages/Login";
import { AuthProvider } from "./auth";
import { clearAuthToken, getAuthToken, setAuthToken } from "./utils/authToken";
import { COMPANY_CHANGED_EVENT, getSelectedCompanyId, type CompanyId } from "./company";

export type UserRole = "manager" | "admin" | "technician" | "account";

function readStoredAuth(): {
  role: UserRole | null;
  token: string | null;
  displayName: string;
  canEdit: boolean;
} {
  try {
    const token = getAuthToken();
    const role = localStorage.getItem("authRole") as UserRole | null;
    if (!token || !role) return { role: null, token: null, displayName: "", canEdit: false };
    const displayName = localStorage.getItem("authDisplayName") || role;
    const canEdit = localStorage.getItem("canEdit") === "true";
    return { role, token, displayName, canEdit };
  } catch {
    return { role: null, token: null, displayName: "", canEdit: false };
  }
}

function App() {
  const [auth, setAuth] = useState<{
    role: UserRole | null;
    token: string | null;
    displayName: string;
    canEdit: boolean;
  }>(() => readStoredAuth());
  const [selectedCompanyId, setSelectedCompanyId] = useState<CompanyId>(() => getSelectedCompanyId());

  useEffect(() => {
    const onCompanyChanged = () => setSelectedCompanyId(getSelectedCompanyId());
    window.addEventListener(COMPANY_CHANGED_EVENT, onCompanyChanged);
    return () => window.removeEventListener(COMPANY_CHANGED_EVENT, onCompanyChanged);
  }, []);

  const handleLogin = (nextRole: UserRole, token: string, displayName: string, canEdit: boolean) => {
    setAuthToken(token);
    setAuth({
      role: nextRole,
      token,
      displayName: displayName || nextRole,
      canEdit,
    });

    // Still attempt localStorage so refresh works in normal browser setups.
    try {
      localStorage.setItem("authToken", token);
      localStorage.setItem("authRole", nextRole);
      localStorage.setItem("authDisplayName", displayName || nextRole);
      localStorage.setItem("canEdit", canEdit ? "true" : "false");
    } catch {}
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuth({ role: null, token: null, displayName: "", canEdit: false });
    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authRole");
      localStorage.removeItem("authDisplayName");
      localStorage.removeItem("canEdit");
    } catch {}
  };

  return (
    <AuthProvider value={auth}>
      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route element={<Layout key={selectedCompanyId} onLogout={handleLogout} />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/search/:entity/:id" element={<SearchResultDetail />} />
          <Route path="/stock-availability" element={<StockAvailability />} />
          <Route path="/sold-stock" element={<SoldStock />} />
          <Route path="/sold-stock/:id" element={<SoldStockDetail />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/equipment/:id" element={<EquipmentDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/activities" element={<Activities />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
