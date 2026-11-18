import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "scripts", "boundary-baseline.json");
const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : [];

const rules = [
  { from: "packages/core", disallow: ["@pneuma/ui"], reason: "core 永不依赖 ui" },
  {
    from: "packages/protocol",
    disallow: ["@pneuma/core", "@pneuma/ui", "react"],
    reason: "protocol 只放纯类型与事件契约",
  },
];

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry.name)) {
      const src = readFileSync(p, "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      for (const rule of rules) {
        if (!p.startsWith(join(root, rule.from))) continue;
        for (const imp of imports) {
          if (rule.disallow.some((d) => imp === d || imp.startsWith(d + "/"))) {
            violations.push(`${p.replace(root + "/", "")}: ${imp} (${rule.reason})`);
          }
        }
      }
    }
  }
}

walk(join(root, "packages"));

const known = new Set(baseline);
const fresh = violations.filter((v) => !known.has(v));
const removed = baseline.filter((b) => !violations.includes(b));

if (removed.length) {
  console.log("边界基线可收缩，请更新 boundary-baseline.json 移除：");
  for (const r of removed) console.log("  - " + r);
}

if (fresh.length) {
  console.error("新增边界违规：");
  for (const v of fresh) console.error("  ✗ " + v);
  process.exit(1);
}

console.log(
  `边界 gate 通过（存量 ${violations.length}，新增 0）`,
);