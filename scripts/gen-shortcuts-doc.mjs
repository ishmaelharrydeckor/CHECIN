// Writes docs/KEYBOARD-SHORTCUTS.md from the same table the app reads (src/lib/shortcuts.ts), so the two cannot drift.
// Run: node scripts/gen-shortcuts-doc.mjs   (a test fails if the file is out of date)
import { writeFileSync } from "node:fs";
import { shortcutsDoc } from "./lib/shortcuts-doc.mjs";

writeFileSync("docs/KEYBOARD-SHORTCUTS.md", shortcutsDoc());
console.log("wrote docs/KEYBOARD-SHORTCUTS.md");
