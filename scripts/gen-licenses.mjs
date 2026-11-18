import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");

function licenseFile(dir) {
  for (const name of readdirSync(dir)) {
    if (/^(license|licence|copying)(\..*)?$/i.test(name)) {
      return readFileSync(join(dir, name), "utf8");
    }
  }
  return "";
}

const entries = [];
function scan(dir, prefix = "") {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    if (name.startsWith("@")) {
      scan(full, name + "/");
      continue;
    }
    const pkgPath = join(full, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (!pkg.name || pkg.private) continue;
    const lic =
      typeof pkg.license === "string"
        ? pkg.license
        : pkg.license?.type ?? "UNKNOWN";
    entries.push({
      name: prefix + pkg.name,
      version: pkg.version ?? "",
      license: lic,
      text: licenseFile(full),
    });
  }
}
scan(nm);
entries.sort((a, b) => a.name.localeCompare(b.name));

const out = [
  "Pneuma 第三方许可清单（自动生成：npm run licenses）",
  "==================================================",
  "",
  ...entries.map(
    (e) =>
      `## ${e.name} ${e.version} — ${e.license}\n\n${e.text || "（许可证文本见上游仓库）"}\n`,
  ),
  "",
  "## 资产署名：供应商品牌图标",
  "",
  "来源：zai-org/ZCode（Apache-2.0），packages/ui/src/assets/provider-icons。",
  "本项目仅引用其开源品牌图标资产，未引用其代码。详见 packages/ui/src/assets/provider-icons/SOURCE.txt。",
].join("\n");

const target = join(root, "apps", "web", "src", "assets");
mkdirSync(target, { recursive: true });
writeFileSync(join(target, "THIRD-PARTY-LICENSES.txt"), out);
console.log(`已生成第三方许可清单：${entries.length} 个依赖`);