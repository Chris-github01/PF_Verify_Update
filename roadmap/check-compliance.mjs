import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const specPath = "roadmap/verifyplus.spec.yaml";
const distIndex = "dist/index.html";       // adjust if needed
const serverRoutesDump = "dist/routes.json"; // optional: emit your route map to JSON at build

function has(text, needle) { return text.includes(needle); }

function loadFile(p) { return fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }

function fail(msg){ console.error("❌ " + msg); process.exitCode = 1; }

// Load all JS files from dist/assets
function loadBundledJS() {
  const distAssets = "dist/assets";
  if (!fs.existsSync(distAssets)) return "";

  const files = fs.readdirSync(distAssets);
  const jsFiles = files.filter(f => f.endsWith('.js'));

  let combined = "";
  for (const file of jsFiles) {
    combined += fs.readFileSync(path.join(distAssets, file), "utf8");
  }
  return combined;
}

const spec = yaml.load(fs.readFileSync(specPath,"utf8"));
const indexHtml = loadFile(distIndex);
const bundledJS = loadBundledJS();
const allContent = indexHtml + bundledJS;
const routesJson = loadFile(serverRoutesDump);

console.log(`🔎 Checking Verify+ against roadmap v${spec.version}`);

for (const mod of spec.modules) {
  console.log(`\n— Module: ${mod.key}`);

  // Check patterns first
  for (const pattern of (mod.required_patterns||[])) {
    if (!has(allContent, pattern)) {
      fail(`Missing pattern: ${pattern} (module ${mod.key})`);
    } else {
      console.log(`  ✅ Pattern: ${pattern}`);
    }
  }

  // UI ids
  for (const id of (mod.required_ui_ids||[])) {
    // Check both formats: data-testid="id" and "data-testid":"id" (for minified bundles)
    const hasAttr = has(allContent, `data-testid="${id}"`) ||
                    has(allContent, `"data-testid":"${id}"`) ||
                    has(allContent, `"data-testid":\`${id}\``);
    if (!hasAttr) {
      fail(`Missing UI id: ${id} (module ${mod.key})`);
    } else {
      console.log(`  ✅ UI: ${id}`);
    }
  }

  // Routes
  for (const r of (mod.required_routes||[])) {
    if (!has(routesJson, r) && !has(allContent, r)) {
      fail(`Missing route declaration: ${r} (module ${mod.key})`);
    } else {
      console.log(`  ✅ Route: ${r}`);
    }
  }
}

// Rules
for (const rule of (spec.non_functional||[])) {
  if (rule.id === "brand-footer") {
    if (!has(allContent, rule.must_include_text)) fail(`Footer missing: ${rule.must_include_text}`);
    else console.log("  ✅ Footer brand");
  }
  if (rule.id === "report-guard") {
    const hasGuard = has(allContent,'data-award-needs-project="true"') ||
                     has(allContent,'"data-award-needs-project":"true"');
    if (!hasGuard) fail("Award page guard missing");
    else console.log("  ✅ Award guard");
  }
}

if (process.exitCode === 1) {
  console.error("\n❌ Roadmap compliance check FAILED");
  process.exit(1);
} else {
  console.log("\n✅ Roadmap compliance check PASSED");
}
