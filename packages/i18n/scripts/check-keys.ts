// Fails CI when en.json and hu.json do not have the same message keys.
import { readFileSync } from "node:fs";

type Tree = { [key: string]: string | Tree };

function keysOf(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key}`]
      : keysOf(value, `${prefix}${key}.`),
  );
}

function load(locale: string): Set<string> {
  const url = new URL(`../messages/${locale}.json`, import.meta.url);
  return new Set(keysOf(JSON.parse(readFileSync(url, "utf8")) as Tree));
}

const hu = load("hu");
const en = load("en");
const problems = [
  ...[...hu].filter((k) => !en.has(k)).map((k) => `missing in en.json: ${k}`),
  ...[...en].filter((k) => !hu.has(k)).map((k) => `missing in hu.json: ${k}`),
];

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Message keys match (${hu.size} keys).`);
