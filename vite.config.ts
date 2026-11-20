import { defineConfig } from "vitest/config";
import { injectCsp } from "./csp";

export default defineConfig({
  base: "./",
  plugins: [{ name: "lifeboat-csp", apply: "build", transformIndexHtml: (html) => injectCsp(html) }],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: { input: { main: "index.html", redirect: "redirect.html" } },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
