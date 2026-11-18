import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pkg = JSON.parse(readFileSync(r("../../package.json"), "utf8")) as {
  version: string;
};
const env = loadEnv("development", r("../../"), "");

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.md", "**/LICENSE", "**/THIRD-PARTY-LICENSES.txt"],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO__: JSON.stringify(process.env.PNEUMA_REPO ?? env.PNEUMA_REPO ?? ""),
    __AUTHOR__: JSON.stringify(process.env.PNEUMA_AUTHOR ?? env.PNEUMA_AUTHOR ?? ""),
    __COMMUNITY_URL__: JSON.stringify(
      process.env.PNEUMA_COMMUNITY_URL ?? env.PNEUMA_COMMUNITY_URL ?? "",
    ),
  },
  resolve: {
    alias: {
      "@pneuma/protocol": r("../../packages/protocol/src/index.ts"),
      "@pneuma/core": r("../../packages/core/src/index.ts"),
      "@pneuma/ui": r("../../packages/ui/src/index.ts"),
    },
  },
});