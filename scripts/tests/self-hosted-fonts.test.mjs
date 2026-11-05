import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ChecIN draws its own text from files it serves itself, so no page contacts another company to show a word.
// That keeps visitors' internet addresses to ourselves and lets the cookie policy say nothing is loaded elsewhere.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const css = read("src/styles.css");
const root = read("src/routes/__root.tsx");
const FILES = ["inter-latin.woff2", "inter-latin-ext.woff2", "geist-latin.woff2", "geist-latin-ext.woff2"];

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? filesUnder(p, out) : out.push(p);
  }
  return out;
}

test("no page, style or script loads a font from another company", () => {
  const files = [...filesUnder("src"), "index.html"].filter((p) => /\.(tsx?|css|html)$/.test(p));
  for (const f of files) {
    let text;
    try {
      text = read(f);
    } catch {
      continue;
    }
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny|cdnjs[^"']*font/i.test(text), `${f} loads a font from another company`);
  }
});

test("the four font files are real, small woff2 files in public/fonts", () => {
  let total = 0;
  for (const name of FILES) {
    const b = readFileSync(join("public/fonts", name));
    assert.equal(b.subarray(0, 4).toString("ascii"), "wOF2", `${name} is a woff2 file`);
    assert.ok(b.length > 5_000 && b.length <= 120 * 1024, `${name} is ${b.length} bytes`);
    total += b.length;
  }
  assert.ok(total <= 300 * 1024, "all four together stay small enough for a phone");
});

test("every file has its own @font-face rule, with swap so text shows while it loads", () => {
  for (const name of FILES) {
    const at = css.indexOf(`url("/fonts/${name}")`);
    assert.ok(at > 0, `${name} has a rule`);
    const rule = css.slice(css.lastIndexOf("@font-face", at), css.indexOf("}", at));
    assert.ok(rule.includes("font-display: swap"), `${name} uses swap`);
    assert.ok(rule.includes("unicode-range:"), `${name} says which letters it holds`);
    assert.ok(rule.includes('format("woff2")'));
  }
  assert.equal((css.match(/@font-face/g) ?? []).length, 4, "exactly the four");
});

test("the families the app asks for are the ones we provide, with the weights it uses", () => {
  assert.ok(css.includes('font-family: "Inter"') && css.includes('font-weight: 300 800'));
  assert.ok(css.includes('font-family: "Geist"') && css.includes('font-weight: 400 600'));
  assert.ok(css.includes('--font-sans: "Inter"') && css.includes('.font-geist'));
});

test("the main font is preloaded from our own address, and there is no connection to another company", () => {
  assert.ok(root.includes('href: "/fonts/inter-latin.woff2"') && root.includes('as: "font"') && root.includes('crossOrigin: "anonymous"'));
  assert.ok(!/preconnect/.test(root), "nothing to connect to in advance");
});

test("the latin-ext file covers the letters in Ghanaian names (the open e and the open o)", () => {
  const rule = css.slice(css.indexOf('url("/fonts/inter-latin-ext.woff2")'));
  const range = rule.slice(rule.indexOf("unicode-range:"), rule.indexOf(";", rule.indexOf("unicode-range:")));
  // U+025B (open e) and U+0254 (open o) fall inside U+0100-02BA.
  assert.ok(range.includes("U+0100-02BA"));
});

test("the fonts have a licence record, and say where they came from", () => {
  const doc = read("docs/FONT-LICENCES.md");
  assert.ok(doc.includes("SIL Open Font License") && doc.includes("Inter") && doc.includes("Geist"));
  for (const name of FILES) assert.ok(doc.includes(name), `${name} is listed`);
});
