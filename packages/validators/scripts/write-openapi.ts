// Writes dist/openapi.json for Redocly lint in CI. Runs on Node's type stripping, no build tool.
import { mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";

// src uses extensionless relative imports (bundler style); Node's ESM resolver needs the .ts added.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { buildOpenApiDocument } = await import("../src/openapi.ts");

const outDir = new URL("../dist/", import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("openapi.json", outDir),
  `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`,
);
