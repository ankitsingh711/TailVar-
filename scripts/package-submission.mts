// Exports the AI conversation log and builds the submission ZIP (no secrets, deps or build output).
//   npm run package [-- path/to/session.jsonl]
// Refuses to produce a ZIP that contains secrets, private redaction terms, or file types
// that Gmail blocks inside attachments (e.g. .js/.mjs/.sh), so the email is never rejected.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT = "AnkitSingh-TailVaR-PolicyClaims-Submission.zip";
const EXCLUDES = [
  "node_modules/*", ".next/*", ".git/*", ".vercel/*", ".deploy-auth/*",
  "test-results/*", "playwright-report/*", "coverage/*",
  ".env", ".env.*", "*.tsbuildinfo", "next-env.d.ts", "*.zip", "*.DS_Store",
];
// Gmail's blocked attachment types (checked inside archives too).
const GMAIL_BLOCKED = /\.(ade|adp|apk|appx|appxbundle|bat|cab|chm|cmd|com|cpl|diagcab|diagcfg|diagpack|dll|dmg|ex|ex_|exe|hta|img|ins|iso|isp|jar|jnlp|js|jse|lib|lnk|mde|mjs|cjs|msc|msi|msix|msixbundle|msp|mst|nsh|pif|ps1|scr|sct|sh|shb|sys|vb|vbe|vbs|vhd|vxd|wsc|wsf|wsh|xll)$/i;
const SECRET = /npg_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|postgres(ql)?:\/\/[^\s"@]+:[^\s"@]+@/;

function fail(message: string): never {
  rmSync(OUT, { force: true });
  console.error(`Refusing: ${message}`);
  process.exit(1);
}

function latestSession(): string | undefined {
  const root = join(homedir(), ".claude", "projects");
  if (!existsSync(root)) return undefined;
  const files = readdirSync(root)
    .filter((d) => d.includes("TailVar-"))
    .flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".jsonl")).map((f) => join(root, d, f)));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const session = process.argv[2] ?? latestSession();
if (session && existsSync(session)) {
  execFileSync(process.execPath, ["ai-logs/export-transcript.mts", session, "ai-logs/claude-code-session.md"], { stdio: "inherit" });
}

rmSync(OUT, { force: true });
execFileSync("zip", ["-rq", OUT, ".", "-x", ...EXCLUDES]);
execFileSync("zip", ["-q", OUT, ".env.example"]); // template without secrets

const entries = execFileSync("unzip", ["-Z1", OUT], { encoding: "utf8" }).split("\n").filter(Boolean);
const blocked = entries.filter((e) => GMAIL_BLOCKED.test(e));
if (blocked.length) fail(`file types Gmail blocks were found:\n  ${blocked.join("\n  ")}`);

const contents = execFileSync("unzip", ["-p", OUT], { encoding: "latin1", maxBuffer: 256 * 1024 * 1024 });
if (SECRET.test(contents)) fail(`possible secret found inside ${OUT}`);
const termsFile = ".deploy-auth/redact-terms.txt";
if (existsSync(termsFile)) {
  const lower = contents.toLowerCase();
  const hit = readFileSync(termsFile, "utf8")
    .split("\n")
    .map((t) => t.trim().toLowerCase())
    .find((t) => t && lower.includes(t));
  if (hit) fail(`a private redaction term was found inside ${OUT}`);
}

console.log(`Created ${OUT} (${Math.round(statSync(OUT).size / 1024)} KB, ${entries.filter((e) => !e.endsWith("/")).length} files)`);
