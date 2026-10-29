#!/usr/bin/env bash
# Exports the AI conversation log and builds the submission ZIP (no secrets, deps or build output).
#   bash scripts/package-submission.sh [path/to/session.jsonl]
set -euo pipefail
cd "$(dirname "$0")/.."

SESSION="${1:-$(ls -t "$HOME"/.claude/projects/*TailVar-*/*.jsonl 2>/dev/null | head -1 || true)}"
if [ -n "$SESSION" ] && [ -f "$SESSION" ]; then
  node ai-logs/export-transcript.mjs "$SESSION" ai-logs/claude-code-session.md
fi

OUT="AnkitSingh-TailVaR-PolicyClaims-Submission.zip"
rm -f "$OUT"
zip -rq "$OUT" . \
  -x "node_modules/*" ".next/*" ".git/*" ".vercel/*" ".deploy-auth/*" \
     "test-results/*" "playwright-report/*" "coverage/*" \
     ".env" ".env.*" "*.tsbuildinfo" "next-env.d.ts" "*.zip" "*.DS_Store"
# .env.example is a template with no secrets, so add it back.
zip -q "$OUT" .env.example

# Safety net: fail if anything that looks like a credential slipped in.
if unzip -p "$OUT" | grep -aEq 'npg_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|postgres(ql)?://[^[:space:]"@]+:[^[:space:]"@]+@'; then
  echo "Refusing: possible secret found inside $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
if [ -f .deploy-auth/redact-terms.txt ] && unzip -p "$OUT" | grep -aiqFf .deploy-auth/redact-terms.txt; then
  echo "Refusing: a private redaction term was found inside $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
echo "Created $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -1
