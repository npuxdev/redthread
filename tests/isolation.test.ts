import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const GENERIC_DIRS = ["actions", "app", "server", "shared"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("architectural isolation", () => {
  it("generic modules never import case fixtures or test data", () => {
    const offenders: string[] = [];
    for (const d of GENERIC_DIRS) {
      for (const file of walk(path.join(ROOT, d))) {
        const src = readFileSync(file, "utf8");
        const imports = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
        if (imports.some((i) => /(^|\/)cases\/|(^|\/)tests\/fixtures/.test(i))) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only the generic loader reads the cases directory", () => {
    const readers: string[] = [];
    for (const d of GENERIC_DIRS) {
      for (const file of walk(path.join(ROOT, d))) {
        if (/["'`]cases["'`]/.test(readFileSync(file, "utf8"))) readers.push(path.relative(ROOT, file));
      }
    }
    expect(readers).toEqual(["server/lib/cases.ts"]);
  });

  it("case manifests contain only a question and raw sources", () => {
    const casesDir = path.join(ROOT, "cases");
    for (const slug of readdirSync(casesDir)) {
      const manifest = path.join(casesDir, slug, "case.json");
      try {
        statSync(manifest);
      } catch {
        continue;
      }
      const m = JSON.parse(readFileSync(manifest, "utf8"));
      expect(Object.keys(m).sort()).toEqual(expect.arrayContaining(["question", "sources", "title"]));
      for (const k of Object.keys(m)) expect(["title", "question", "summary", "sources"]).toContain(k);
    }
  });
});
