import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// Every photo shipped with the site needs a licence record (docs/IMAGE-LICENCES.md) and must be small
// and self-hosted. This stops a picture from another site, or one nobody can account for, from creeping back in.
const IMAGE_DIR = "public/images";
const PHOTO_EXT = new Set([".webp", ".jpg", ".jpeg", ".png", ".avif", ".gif"]);
const licences = readFileSync("docs/IMAGE-LICENCES.md", "utf8");

function photosIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? photosIn(p) : PHOTO_EXT.has(extname(e.name).toLowerCase()) ? [p] : [];
  });
}
const photos = photosIn(IMAGE_DIR).map((p) => p.replace(/\\/g, "/"));

test("every photo under public/images has a row in docs/IMAGE-LICENCES.md", () => {
  assert.ok(photos.length > 0, "the stock photos are present");
  for (const p of photos) {
    const rel = p.replace(/^public\/images\//, "");
    assert.ok(licences.includes(rel.split("/").pop()), `${rel} has no licence entry`);
  }
});

test("each licence row names a source, a photographer and a description", () => {
  const rows = licences.split("\n").filter((l) => l.startsWith("| `") && l.includes("pexels.com/photo/"));
  assert.ok(rows.length >= 5);
  for (const r of rows) {
    const cells = r.split("|").map((c) => c.trim()).filter(Boolean);
    assert.ok(cells.length >= 5, `incomplete row: ${r.slice(0, 60)}`);
    assert.ok(cells[2].length > 2, "photographer is named");
    assert.ok(cells[3].length > 15, "has a description for alt text");
  }
});

test("photos are small (a landing page must load fast on a phone)", () => {
  for (const p of photos) assert.ok(statSync(p).size <= 200 * 1024, `${p} is over 200 KB`);
});

test("nothing in the licence record points at the template's host", () => {
  assert.ok(!/framerusercontent|framer\.website/i.test(licences.replace(/Pictures that were on the landing page[^\n]*\n?/, "")));
});
