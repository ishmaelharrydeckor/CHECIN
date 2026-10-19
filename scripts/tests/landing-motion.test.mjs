import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Landing page motion: sections fade up on scroll, the hero rises on load, the big number counts up
// and the capability tabs move on by themselves. These checks keep it safe: never hidden without
// JavaScript, never moving for people who ask for less motion, and never taking control from the person.
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const css = read("src/styles.css");
const motion = read("src/components/landing/Motion.tsx");
const page = read("src/routes/index.tsx");

test("content is only hidden once the page's script has run, so it is visible without JavaScript", () => {
  const hiddenRule = css.match(/\.reveal-ready \[data-reveal\]\s*\{[^}]*opacity:\s*0/);
  assert.ok(hiddenRule, "the hidden start state is scoped under .reveal-ready");
  assert.ok(!/(^|\n)\[data-reveal\]\s*\{[^}]*opacity:\s*0/.test(css), "no unscoped hidden state");
  assert.ok(motion.includes('classList.add("reveal-ready")') && motion.includes('classList.remove("reveal-ready")'));
});

test("people who ask for less motion get none", () => {
  const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf("Landing page motion")));
  assert.ok(/\.reveal-ready \[data-reveal\]\s*\{[^}]*opacity:\s*1[^}]*transform:\s*none[^}]*transition:\s*none/.test(block), "reveals show at once");
  assert.ok(/\.landing-rise\s*\{[^}]*animation:\s*none/.test(block), "the hero does not rise");
  assert.ok(/\.landing-progress\s*\{[^}]*animation:\s*none/.test(block), "the tab bar does not run, so the tabs do not advance");
  assert.ok(motion.includes("prefers-reduced-motion"), "the count-up checks it too");
});

test("each element is revealed once, with an observer that is cleaned up", () => {
  assert.ok(motion.includes("new IntersectionObserver") && motion.includes("io.unobserve(entry.target)") && motion.includes("io.disconnect()"));
  assert.ok(motion.includes('typeof IntersectionObserver === "undefined"'), "browsers without it just show everything");
});

test("the count-up shows the final number on the server and for reduced motion", () => {
  assert.ok(motion.includes("useState(to)"), "starts at the final value");
  assert.ok(/cancelAnimationFrame/.test(motion));
  assert.ok(page.includes("<CountUp to={15} />"), "only a true figure counts up: the 15 second code");
});

test("the capability tabs advance by themselves, pause while looked at, and stop once the person chooses", () => {
  assert.ok(page.includes("const [autoCap, setAutoCap] = useState(true);"));
  assert.ok(page.includes("onAnimationEnd={advanceCap}"), "the progress bar finishing opens the next tab");
  assert.ok(/onClick=\{\(\) => \{\s*setActiveCap\(key\);\s*setAutoCap\(false\);/.test(page), "a manual choice turns it off for good");
  assert.ok(page.includes("data-paused={capPaused}") && page.includes("onMouseEnter") && page.includes("onFocus"), "hovering or focusing pauses it");
  assert.ok(css.includes('[data-paused="true"] .landing-progress') && css.includes("animation-play-state: paused"));
  assert.ok(page.includes('aria-hidden') && page.includes('className="landing-progress'));
});

test("the page uses the motion: hero, headings, cards", () => {
  assert.ok(page.includes("useScrollReveal();"));
  assert.equal((page.match(/landing-rise landing-rise-\d/g) ?? []).length, 5, "pill, headline, text, buttons and picture rise in order");
  assert.ok((page.match(/data-reveal/g) ?? []).length >= 11, "headings and card rows fade up");
  for (const n of ["1", "2", "3"]) assert.ok(page.includes(`data-reveal="${n}"`), `stagger step ${n}`);
});

test("only transform and opacity are animated, and nothing is copied from another site", () => {
  const motionCss = css.slice(css.indexOf("Landing page motion"));
  assert.ok(!/(^|\s)(left|top|margin|height)\s*:\s*[^;]*;\s*\n\s*transition/.test(motionCss));
  assert.ok(!/Exact 1:1|prezence|framer/i.test(page + motion), "no leftover clone comments or names");
});
