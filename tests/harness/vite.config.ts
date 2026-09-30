import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import federation from "@originjs/vite-plugin-federation";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./node_modules/.vite", import.meta.url)),
  plugins: [
    federation({
      name: "onboarding_test_host",
      remotes: { care_onboarding_fe: "http://127.0.0.1:4178/assets/remoteEntry.js" },
      shared: ["react", "react-dom"],
    }),
    react(),
  ],
  build: { target: "es2022" },
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});
