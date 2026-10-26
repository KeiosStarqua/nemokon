import { defineConfig } from "tsdown";

/** Shared defaults. Each workspace package runs `tsdown` via its own `build` script. */
export default defineConfig({
  entry: "src/index.ts",
  platform: "node",
  format: "esm",
  unbundle: true,
  // Packages export `src/index.ts`; type errors are caught by `pnpm typecheck`.
  dts: false,
});
