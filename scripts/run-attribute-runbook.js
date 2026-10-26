/**
 * Attribute-value migration runbook — runs the full sequence in the correct
 * order, with a preflight DB-identity check and dry-run-by-default safety.
 *
 * This is an ORCHESTRATOR: it never re-implements the migrations, it spawns the
 * existing scripts as child processes so behaviour stays identical to running
 * them by hand. See README notes below for what each step does.
 *
 * STAGES (in order):
 *   1. backup            — full DB backup (only with --write)
 *   2. recon             — read-only review + propose (always safe)
 *   3. material          — migrate-material-values.js       (mergeUser labels/codes)
 *   4. needs-review      — backfill-needs-review.js         (badge flags)
 *   5. reconcile         — reconcile-product-attribute-values.js (layer-2 canonical)
 *   6. reindex           — reindex-search.js                (Meilisearch rebuild)
 *
 * USAGE (run from `backend/`):
 *   node scripts/run-attribute-runbook.js                 # DRY RUN: recon + dry-runs of every write step
 *   node scripts/run-attribute-runbook.js --write         # LIVE: perform backup + all writes + reindex
 *   node scripts/run-attribute-runbook.js --write --skip-backup
 *   node scripts/run-attribute-runbook.js --only material,needs-review
 *   node scripts/run-attribute-runbook.js --from reconcile
 *   node scripts/run-attribute-runbook.js --uri <mongodb-url>   # override DB for all steps
 *
 * SAFETY:
 *   - Dry run is the default; nothing is written unless --write is passed.
 *   - The backup step runs FIRST in --write mode (unless --skip-backup).
 *   - Preflight prints a redacted URI + host/db so you can confirm it's the
 *     DB you intend (dev vs live) before any write.
 *   - The reindex is INDEPENDENT of attribute changes (the Meilisearch index
 *     stores only title/sku/category); it runs last so it reads final Mongo
 *     state.
 */

const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ARGS = process.argv.slice(2);
const WRITE = ARGS.includes("--write");
const SKIP_BACKUP = ARGS.includes("--skip-backup");

const flagValue = (name) => {
  const i = ARGS.indexOf(name);
  return i !== -1 && ARGS[i + 1] ? ARGS[i + 1] : null;
};
const URI_OVERRIDE = flagValue("--uri");
const ONLY = flagValue("--only")
  ? new Set(flagValue("--only").split(",").map((s) => s.trim()))
  : null;
const FROM = flagValue("--from");

const SCRIPTS_DIR = __dirname;

// Ordered stages. `writes` marks steps that change data; in dry-run mode these
// are still executed but with their own dry-run flag so you can preview.
const STAGES = [
  {
    id: "backup",
    label: "Full database backup",
    script: "backup-database.js",
    writes: true,
    writeArgs: [],
    dryArgs: null, // no dry-run mode for backup — skipped unless --write
    backupOnly: true,
  },
  {
    id: "recon",
    label: "Recon: review-attribute-values (read-only)",
    script: "review-attribute-values.js",
    writes: false,
    writeArgs: [],
    dryArgs: [],
  },
  {
    id: "propose",
    label: "Recon: propose-attribute-values (read-only)",
    script: "propose-attribute-values.js",
    writes: false,
    writeArgs: [],
    dryArgs: [],
  },
  {
    id: "material",
    label: "Migrate material values (merge dupes + rename codes)",
    script: "migrate-material-values.js",
    writes: true,
    writeArgs: ["--write"],
    dryArgs: [],
  },
  {
    id: "needs-review",
    label: "Backfill needsReview badges",
    script: "backfill-needs-review.js",
    writes: true,
    writeArgs: ["--write"],
    dryArgs: [],
  },
  {
    id: "reconcile",
    label: "Reconcile product attribute values (layer-2 canonicalisation)",
    script: "reconcile-product-attribute-values.js",
    writes: true,
    writeArgs: ["--write"],
    dryArgs: [],
  },
  {
    id: "reindex",
    label: "Rebuild Meilisearch products index",
    script: "reindex-search.js",
    writes: true,
    writeArgs: [],
    dryArgs: ["--dry-run"],
  },
];

const REDACTED = (uri) =>
  String(uri || "")
    .replace(/\/\/[^@]*@/, "//***@")
    .replace(/\/\/([^@]*@)?/, "//$1");

const hostDbOf = (uri) => {
  try {
    const noProto = String(uri).replace(/^mongodb(\+srv)?:\/\//, "");
    const afterAt = noProto.includes("@") ? noProto.split("@").pop() : noProto;
    const [hosts, rest = ""] = afterAt.split("/");
    const db = rest.split("?")[0];
    return { hosts, db };
  } catch {
    return { hosts: "?", db: "?" };
  }
};

function log(msg = "") {
  process.stdout.write(msg + "\n");
}

function rule() {
  log("─".repeat(72));
}

function banner() {
  log("");
  rule();
  log(WRITE ? "  ATTRIBUTE MIGRATION RUNBOOK  —  LIVE MODE (writes enabled)" : "  ATTRIBUTE MIGRATION RUNBOOK  —  DRY RUN (no writes)");
  rule();
}

function preflight() {
  const uri = URI_OVERRIDE || process.env.MONGODB_URI;
  const { hosts, db } = hostDbOf(uri);
  rule();
  log("PREFLIGHT");
  rule();
  log(`  Mode        : ${WRITE ? "LIVE (writes)" : "DRY RUN (no writes)"}`);
  log(`  Target host : ${hosts}`);
  log(`  Target db   : ${db}`);
  log(`  URI (redact): ${REDACTED(uri)}`);
  log(`  Backup      : ${WRITE ? (SKIP_BACKUP ? "SKIPPED (--skip-backup)" : "WILL RUN first") : "n/a (dry run)"}`);
  if (ONLY) log(`  Only        : ${[...ONLY].join(", ")}`);
  if (FROM) log(`  From stage  : ${FROM}`);
  log("");
  if (WRITE && !SKIP_BACKUP) {
    log("  ⚠️  LIVE mode will WRITE to the DB above. Backup runs first.");
  } else if (WRITE) {
    log("  ⚠️  LIVE mode + --skip-backup: writes WILL occur without a fresh backup.");
  } else {
    log("  ℹ️  Dry run — every write step runs in its own read-only mode.");
  }
  log("");
}

function selectStages() {
  let stages = STAGES;
  if (FROM) {
    const idx = stages.findIndex((s) => s.id === FROM);
    if (idx === -1) {
      log(`❌ Unknown --from stage: ${FROM}`);
      log(`   Valid stages: ${STAGES.map((s) => s.id).join(", ")}`);
      process.exit(1);
    }
    stages = stages.slice(idx);
  }
  if (ONLY) {
    stages = stages.filter((s) => ONLY.has(s.id));
    if (stages.length === 0) {
      log(`❌ --only matched no stages. Valid: ${STAGES.map((s) => s.id).join(", ")}`);
      process.exit(1);
    }
  }
  return stages;
}

function runStage(stage) {
  rule();
  log(`▶  ${stage.label}`);
  rule();

  // Backup only runs in live mode; skip on dry run / skip-backup.
  if (stage.backupOnly && (!WRITE || SKIP_BACKUP)) {
    log("   ⏭  skipped (dry run / --skip-backup)");
    log("");
    return { ok: true, skipped: true };
  }

  let args;
  if (stage.dryArgs === null) {
    // No dry-run mode (backup) — run as-is (live only).
    args = [...(stage.writeArgs || [])];
  } else {
    args = WRITE ? [...(stage.writeArgs || [])] : [...(stage.dryArgs || [])];
  }
  if (URI_OVERRIDE) args.push("--uri", URI_OVERRIDE);

  const scriptPath = path.join(SCRIPTS_DIR, stage.script);
  log(`   $ node scripts/${stage.script} ${args.join(" ")}`.trim());
  log("");

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    log(`   ❌ failed to launch: ${result.error.message}`);
    return { ok: false };
  }
  if (result.status !== 0) {
    log("");
    log(`   ❌ stage exited with code ${result.status}`);
    return { ok: false };
  }
  log("");
  return { ok: true };
}

function main() {
  banner();
  preflight();

  const stages = selectStages();
  const results = [];

  for (const stage of stages) {
    const res = runStage(stage);
    results.push({ stage, res });
    if (!res.ok) {
      rule();
      log("STOPPED — a stage failed. Fix the issue and re-run (stages are idempotent).");
      rule();
      summarize(results);
      process.exit(1);
    }
  }

  rule();
  log(WRITE ? "RUNBOOK COMPLETE (writes applied)" : "RUNBOOK COMPLETE (dry run — nothing written)");
  rule();
  summarize(results);

  if (!WRITE) {
    log("");
    log("👉 Re-run with --write to apply for real (backup runs first).");
  } else {
    log("");
    log("👉 Next: restart the backend to load new utility code, and clear the");
    log("   Redis suggest cache (120s TTL) before checking the storefront UI.");
  }
}

function summarize(results) {
  log("");
  log("SUMMARY");
  for (const { stage, res } of results) {
    const state = res.skipped ? "⏭ skipped" : res.ok ? "✅ ok" : "❌ failed";
    log(`  ${state.padEnd(10)} ${stage.id.padEnd(14)} ${stage.script}`);
  }
  log("");
}

main();
