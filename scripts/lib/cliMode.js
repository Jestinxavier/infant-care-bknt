/**
 * Shared CLI mode handling for maintenance scripts.
 *
 * Standard contract:
 *   --dry-run   Force preview mode. Never writes.
 *   --apply     Force apply/write mode. Aliases: --write, --execute, --live.
 *
 * If neither flag is passed, each script keeps its historical default so
 * existing commands keep working. New commands should pass one explicitly.
 */

const WRITE_FLAGS = new Set(["--apply", "--write", "--execute", "--live"]);

function parseMode(argv = process.argv.slice(2), { defaultMode = "dry" } = {}) {
  const apply = argv.some((arg) => WRITE_FLAGS.has(arg));
  const dryRunFlag = argv.includes("--dry-run");

  if (apply && dryRunFlag) {
    console.error(
      "❌ Conflicting flags: --dry-run cannot be combined with --apply/--write/--execute/--live.",
    );
    process.exit(2);
  }

  if (defaultMode !== "apply" && defaultMode !== "dry") {
    throw new Error(`Invalid defaultMode "${defaultMode}" (expected "apply" or "dry")`);
  }

  const mode = apply ? "apply" : dryRunFlag ? "dry" : defaultMode;
  return {
    mode,
    apply: mode === "apply",
    dryRun: mode === "dry",
    argv,
  };
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function flagValue(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
}

function flagValues(argv, name) {
  const values = [];
  argv.forEach((arg, index) => {
    if (arg === name && argv[index + 1]) values.push(argv[index + 1]);
  });
  return values;
}

function resolveMongoUri(argv = process.argv.slice(2), fallback = "mongodb://localhost:27017") {
  return flagValue(argv, "--uri") || process.env.MONGODB_URI || fallback;
}

function redactUri(uri) {
  return String(uri || "").replace(/\/\/[^@]*@/, "//***@");
}

function hostDbOf(uri) {
  try {
    const noProto = String(uri).replace(/^mongodb(\+srv)?:\/\//, "");
    const afterAt = noProto.includes("@") ? noProto.split("@").pop() : noProto;
    const [hosts, rest = ""] = afterAt.split("/");
    return { hosts, db: rest.split("?")[0] };
  } catch {
    return { hosts: "?", db: "?" };
  }
}

function modeLabel(mode) {
  return mode === "apply" ? "APPLY (writes enabled)" : "DRY RUN (no writes)";
}

function printBanner({ name, description, mode, extra = [] }) {
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log(`  ${name}`);
  if (description) console.log(`  ${description}`);
  console.log(`  Mode: ${modeLabel(mode)}`);
  for (const item of extra) console.log(`  ${item}`);
  console.log(`${line}\n`);
}

function printHelp({ name, description, usage, flags = [], examples = [] }) {
  console.log(`\n${name}`);
  if (description) console.log(description);
  if (usage) console.log(`\nUsage:\n  ${usage}`);
  if (flags.length) {
    console.log("\nFlags:");
    for (const [flag, text] of flags) console.log(`  ${String(flag).padEnd(24)} ${text}`);
  }
  if (examples.length) {
    console.log("\nExamples:");
    for (const example of examples) console.log(`  ${example}`);
  }
  console.log("");
}

module.exports = {
  parseMode,
  hasFlag,
  flagValue,
  flagValues,
  resolveMongoUri,
  redactUri,
  hostDbOf,
  modeLabel,
  printBanner,
  printHelp,
};
