import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = String(env.PORT || "3001").trim() || "3001";
  const target = `http://localhost:${apiPort}`;
  const apiProxy = {
    "/api": { target, changeOrigin: true },
    "/uploads": { target, changeOrigin: true },
  } as const;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { ...apiProxy },
    },
    preview: {
      port: 5173,
      proxy: { ...apiProxy },
    },
  };
});

