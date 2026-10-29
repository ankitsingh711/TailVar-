// Converts a Claude Code session transcript (.jsonl) into a readable, redacted Markdown log.
//   node ai-logs/export-transcript.mjs <session.jsonl> <out.md> [private-terms.txt]
// Keeps user prompts, assistant replies, tool calls and (truncated) tool results; drops
// internal metadata. Redacts credentials, connection strings and emails. Extra names to hide
// (unrelated accounts/organisations) are read from a local terms file that is never committed
// or packaged, so this script does not itself reveal what it redacts.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [input, output, termsFile = ".deploy-auth/redact-terms.txt"] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node ai-logs/export-transcript.mjs <session.jsonl> <out.md>");
  process.exit(1);
}

const KEEP_EMAILS = new Set(["hello@tailvar.com", "noreply@anthropic.com"]);
const REDACTIONS = [
  [/postgres(?:ql)?:\/\/[^\s"'@]+@/g, "postgresql://[credentials-redacted]@"],
  [/\bnpg_[A-Za-z0-9]+/g, "[neon-secret-redacted]"],
  [/\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]+/g, "[github-token-redacted]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9-_]{16,}/g, "[api-key-redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer [token-redacted]"],
  [/\bep-[a-z]+-[a-z]+-[a-z0-9]+/g, "ep-[endpoint-redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (KEEP_EMAILS.has(m.toLowerCase()) ? m : "[email-redacted]")],
  [/arn:aws:[^\s"]+/g, "[aws-arn-redacted]"],
  [/(state|code_challenge|code)=[A-Za-z0-9_-]{20,}/g, "$1=[redacted]"],
];

const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const privateTerms = existsSync(termsFile)
  ? readFileSync(termsFile, "utf8").split("\n").map((t) => t.trim()).filter(Boolean)
  : [];
// Longest first so a full name is replaced before any of its parts.
for (const term of privateTerms.sort((a, b) => b.length - a.length)) {
  REDACTIONS.push([new RegExp(escapeRe(term), "gi"), "[redacted]"]);
}

const redact = (s) => REDACTIONS.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}\n… [truncated ${s.length - n} chars]` : s);
const fence = (s, lang = "") => "```" + lang + "\n" + s.replace(/```/g, "ˋˋˋ") + "\n```";

function toolCall(block) {
  const i = block.input ?? {};
  if (block.name === "Bash") return `**Tool: Bash** — ${i.description ?? ""}\n\n${fence(truncate(i.command ?? "", 6000), "bash")}`;
  if (block.name === "Write") return `**Tool: Write** \`${i.file_path}\`\n\n${fence(truncate(i.content ?? "", 8000))}`;
  if (block.name === "Edit") return `**Tool: Edit** \`${i.file_path}\`\n\n${fence(truncate(`- ${i.old_string}\n+ ${i.new_string}`, 3000))}`;
  if (block.name === "Read") return `**Tool: Read** \`${i.file_path}\``;
  if (block.name === "AskUserQuestion") {
    const qs = (i.questions ?? []).map((q) => `> **Q:** ${q.question}\n>\n${q.options.map((o) => `> - ${o.label}: ${o.description}`).join("\n")}`);
    return `**Tool: AskUserQuestion**\n\n${qs.join("\n\n")}`;
  }
  return `**Tool: ${block.name}**\n\n${fence(truncate(JSON.stringify(i, null, 2), 3000), "json")}`;
}

function toolResult(block) {
  const content = Array.isArray(block.content)
    ? block.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n")
    : String(block.content ?? "");
  return `<details><summary>Result${block.is_error ? " (error)" : ""}</summary>\n\n${fence(truncate(content, 2500))}\n\n</details>`;
}

const lines = readFileSync(input, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const out = [
  "# AI-assisted development session (Claude Code)",
  "",
  `Exported from \`${input.split("/").pop()}\` on ${new Date().toISOString().slice(0, 10)}. Tool: Claude Code (VS Code extension), model Claude Opus 5.5.`,
  "Model reasoning blocks and internal metadata are omitted; long tool outputs are truncated; secrets and unrelated personal/organisation details are redacted.",
  "",
];

for (const entry of lines) {
  if (entry.isSidechain || (entry.type !== "user" && entry.type !== "assistant")) continue;
  const content = entry.message?.content;
  const blocks = typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
  for (const b of blocks) {
    if (b.type === "text" && b.text?.trim()) {
      const text = b.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
      if (!text) continue;
      out.push(entry.type === "user" ? `## 👤 User\n\n${text}` : `### 🤖 Assistant\n\n${text}`);
    } else if (b.type === "tool_use") {
      out.push(toolCall(b));
    } else if (b.type === "tool_result") {
      out.push(toolResult(b));
    }
  }
}

writeFileSync(output, redact(out.join("\n\n")) + "\n");
console.log(`Wrote ${output}`);
