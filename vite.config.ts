import federation from "@originjs/vite-plugin-federation";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import type { Plugin as PostcssPlugin } from "postcss";
import { defineConfig } from "vite";

function scopeStyles(): PostcssPlugin {
  return {
    postcssPlugin: "care-onboarding-scope",
    OnceExit(root) {
      root.walkRules((rule) => {
        if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
        rule.selectors = rule.selectors.map((selector) => {
          if ([":root", ":host"].includes(selector.trim())) return ".care-onboarding-fe";
          return selector.includes(".care-onboarding-fe") ? selector : `.care-onboarding-fe ${selector}`;
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    federation({
      name: "care_onboarding_fe",
      filename: "remoteEntry.js",
      exposes: { "./manifest": "./src/manifest.tsx" },
      shared: ["react", "react-dom"],
    }),
    tailwindcss(),
    react(),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  css: { postcss: { plugins: [scopeStyles()] } },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: "./src/index.ts", output: { format: "esm" } },
  },
  preview: { host: "127.0.0.1", port: 4178, strictPort: true, cors: true },
});
