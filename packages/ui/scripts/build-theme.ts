// Writes the Tailwind v4 theme for the web apps from tokens.json; `--check` fails when it is stale.
import { readFileSync, writeFileSync } from "node:fs";

type TextRole = {
  size: string;
  lineHeight: number;
  weight: number;
  letterSpacing?: string;
};
type Tokens = {
  color: Record<string, string>;
  text: Record<string, TextRole>;
  radius: Record<string, string>;
  spacing: { unit: string };
  container: Record<string, string>;
  shadow: Record<string, string>;
  icon: { strokeWidth: number };
};

const tokensUrl = new URL("../tokens.json", import.meta.url);
const themeUrl = new URL("../../config/tailwind/theme.css", import.meta.url);
const tokens = JSON.parse(readFileSync(tokensUrl, "utf8")) as Tokens;

const vars = (prefix: string, values: Record<string, string>) =>
  Object.entries(values).map(
    ([name, value]) => `  --${prefix}-${name}: ${value};`,
  );

const textVars = Object.entries(tokens.text).flatMap(([name, role]) => [
  `  --text-${name}: ${role.size};`,
  `  --text-${name}--line-height: ${role.lineHeight};`,
  `  --text-${name}--font-weight: ${role.weight};`,
  ...(role.letterSpacing
    ? [`  --text-${name}--letter-spacing: ${role.letterSpacing};`]
    : []),
]);

// rem keeps spacing in step with the user's font size setting.
const spacingRem = `${Number.parseFloat(tokens.spacing.unit) / 16}rem`;

const css = [
  "/* Generated from packages/ui/tokens.json by `pnpm --filter @namitiszunk/ui theme`. Do not edit. */",
  "@theme {",
  // Only token values exist, so an off-system Tailwind class fails to style anything.
  "  --color-*: initial;",
  "  --text-*: initial;",
  "  --shadow-*: initial;",
  ...vars("color", tokens.color),
  ...textVars,
  ...vars("radius", tokens.radius),
  `  --spacing: ${spacingRem};`,
  ...vars("container", tokens.container),
  ...vars("shadow", tokens.shadow),
  // next/font sets --font-inter on <html>; the fallbacks cover the moment before it loads.
  "  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;",
  "}",
  "",
  "@layer base {",
  "  :root {",
  "    color-scheme: dark;",
  // Focus rings sit on the page background unless a surface (dialog, sheet) overrides it.
  "    --focus-offset: var(--color-bg);",
  "  }",
  "  body {",
  "    background-color: var(--color-bg);",
  "    color: var(--color-text);",
  "    font-family: var(--font-sans);",
  "  }",
  "  svg.lucide {",
  `    stroke-width: ${tokens.icon.strokeWidth};`,
  "  }",
  "}",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  if (readFileSync(themeUrl, "utf8") !== css) {
    console.error(
      "packages/config/tailwind/theme.css is out of date: run `pnpm --filter @namitiszunk/ui theme`.",
    );
    process.exit(1);
  }
  console.log("theme.css matches tokens.json.");
} else {
  writeFileSync(themeUrl, css);
  console.log("Wrote packages/config/tailwind/theme.css.");
}
