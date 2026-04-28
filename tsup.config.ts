import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts"
    },
    format: ["esm", "cjs"],
    outDir: "dist",
    outExtension({ format }) {
      return {
        js: format === "cjs" ? ".cjs" : ".mjs"
      };
    },
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: {
      entry: "src/index.ts"
    }
  },
  {
    entry: {
      cli: "src/cli.ts"
    },
    format: ["esm", "cjs"],
    outDir: "dist",
    outExtension({ format }) {
      return {
        js: format === "cjs" ? ".cjs" : ".mjs"
      };
    },
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    banner: {
      js: "#!/usr/bin/env node"
    }
  }
]);
