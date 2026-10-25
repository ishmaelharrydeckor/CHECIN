import { SHORTCUTS } from "../../src/lib/shortcuts.ts";

const keysText = (keys) => keys.map((k) => (k === "then" || k === "and" || k === "to" ? k : `\`${k}\``)).join(" ");

function table(rows) {
  return ["| Keys | What it does |", "|---|---|", ...rows.map((s) => `| ${keysText(s.keys)} | ${s.label} |`)].join("\n");
}

/** The text of docs/KEYBOARD-SHORTCUTS.md, built from the shortcut table the app uses. */
export function shortcutsDoc() {
  const by = (pred) => SHORTCUTS.filter(pred);
  return `# Keyboard shortcuts

This page is generated from the table the app reads (\`src/lib/shortcuts.ts\`) with \`node scripts/gen-shortcuts-doc.mjs\`, and a test fails if it is out of date. Press \`?\` anywhere in the app to see the list for your own role.

## How they behave
- They never fire while you are typing in a box, and never while a dialog is open (except a and f inside a person's day on the work diary review, which each ask you to confirm).
- \`g\` then a letter must be pressed within about a second and a half. Only pages in your own menu can be reached.
- Nothing destructive happens on one key: approving or flagging a day always asks first.
- Single-letter shortcuts can be switched off in My account. Ctrl or Cmd with K and B always work.
- No shortcut uses a combination the browser owns (Ctrl with N, T, W, R, L, S, P or F, and F5).

## Everyone
${table(by((s) => s.scope === "everyone"))}

## Managers and admins
${table(by((s) => s.scope === "manager"))}

## Employees
${table(by((s) => s.scope === "employee"))}

## Reviewing the work diary (managers and admins)
${table(by((s) => s.scope === "review"))}
`;
}
