import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// ChecIN's logo is its own drawing: an open C with a dot in the opening. The earlier mark was a copy of
// another company's logo and must never come back. These checks keep every place the mark appears in step.
const C_PATH = "M47 18A19 19 0 1 0 47 46";
const OLD_MARK_PATH_STARTS = ["M23.8801 23.4753", "M10.38 16.2639", "M22.296 2.76732", "M28.764 19.4181"];
const read = (p) => readFileSync(p, "utf8");

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) filesUnder(p, out);
    else out.push(p);
  }
  return out;
}

test("the other company's logo artwork is nowhere in the app or the public files", () => {
  const files = [...filesUnder("src"), ...filesUnder("public")].filter((p) => /\.(tsx?|svg|json|webmanifest|html|css)$/i.test(p));
  for (const file of files) {
    const text = read(file);
    for (const start of OLD_MARK_PATH_STARTS) assert.ok(!text.includes(start), `${file} still has the old mark`);
  }
});

test("the logo component, favicon and logo file all draw the same C and dot", () => {
  for (const file of ["src/components/ChecInLogo.tsx", "public/favicon.svg", "public/logo.svg"]) {
    const text = read(file);
    assert.ok(text.includes(C_PATH), `${file} draws the C`);
    assert.ok(text.includes('cx="46"') && text.includes('cy="32"'), `${file} draws the scan dot`);
  }
});

test("on a dark background the dot turns white so it stays visible", () => {
  const component = read("src/components/ChecInLogo.tsx");
  assert.ok(component.includes('markColor.toUpperCase() === LIME ? "#FFFFFF" : LIME'));
});

function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.subarray(1, 4).toString(), "PNG", `${path} is a PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("every app icon exists at the size the browser or phone expects", () => {
  const expected = {
    "public/favicon-16x16.png": 16,
    "public/favicon-32x32.png": 32,
    "public/apple-touch-icon.png": 180,
    "public/apple-touch-icon-180x180.png": 180,
    "public/apple-touch-icon-precomposed.png": 180,
    "public/pwa-192x192.png": 192,
    "public/pwa-512x512.png": 512,
    "public/pwa-maskable-512x512.png": 512,
    "public/favicon.png": 512,
  };
  for (const [file, size] of Object.entries(expected)) {
    assert.ok(existsSync(file), `${file} exists`);
    assert.deepEqual(pngSize(file), [size, size], `${file} is ${size} x ${size}`);
  }
  assert.ok(statSync("public/favicon.ico").size > 100, "favicon.ico has content");
});

test("the page head asks for the new icons, not a cached old one", () => {
  const root = read("src/routes/__root.tsx");
  assert.ok(root.includes("/favicon.svg?v=3") && !/\?v=2/.test(root), "the cache-busting version moved on");
});

test("shared links show ChecIN's own picture, at a size social sites accept, and nothing from another project", () => {
  const root = read("src/routes/__root.tsx");
  assert.ok(root.includes('property: "og:image", content: SHARE_IMAGE') && root.includes('name: "twitter:image", content: SHARE_IMAGE'));
  assert.ok(/\/share-card\.jpg`/.test(root), "points at the share card");
  assert.ok(/VITE_APP_ORIGIN/.test(root), "an absolute address, from the site's own origin setting");
  assert.ok(root.includes('"og:image:width", content: "1200"') && root.includes('"og:image:height", content: "630"'));
  const b = readFileSync("public/share-card.jpg");
  assert.equal(b[0], 0xff, "a JPEG");
  assert.ok(b.length > 10_000 && b.length < 300 * 1024, "small enough to load quickly, big enough to be a real picture");
  // What git tracks, not what happens to be on one person's disk.
  const tracked = execFileSync("git", ["ls-files", "public/og-image.jpg", "public/og-preview.jpg"], { encoding: "utf8" }).trim();
  assert.equal(tracked, "", "the old KNUST preview images are not in the repo");
  const everything = [...filesUnder("src")].filter((p) => /\.(tsx?|css)$/.test(p)).map(read).join("\n");
  assert.ok(!/KNUST|Kwame Nkrumah/i.test(everything), "no trace of the earlier university project in the app");
});
