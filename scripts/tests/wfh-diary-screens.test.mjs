import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source checks for the work-session page (task 2.3b, phase 3). The counting, signing and wording
// are tested in wfh-diary-recorder.test.mjs; these keep the page honest and private.
const page = readFileSync("src/routes/_authenticated/wfh-diary.tsx", "utf8");
const hook = readFileSync("src/components/wfh/diary/useDiaryRecorder.ts", "utf8");
const api = readFileSync("src/components/wfh/diary/diaryApi.ts", "utf8");
const consent = readFileSync("src/components/wfh/diary/DiaryConsentCard.tsx", "utf8");
const dialog = readFileSync("src/components/wfh/diary/StillHereDialog.tsx", "utf8");

test("only real input is counted, by kind; nothing about what was typed or shown is read", () => {
  assert.ok(hook.includes("trusted: e.isTrusted"));
  // The recorder never touches a key or code at all; the page never reads one from an input event.
  for (const forbidden of [/\.key\b/, /\.code\b/, /keyCode/, /innerText/, /textContent/, /clipboard/i, /getDisplayMedia|screenshot/i, /geolocation/]) {
    assert.ok(!forbidden.test(hook), `recorder: ${forbidden}`);
  }
  for (const forbidden of [/\b(e|ev|event)\.(key|code|keyCode)\b/, /innerText/, /clipboard/i, /getDisplayMedia|screenshot/i, /geolocation/]) {
    assert.ok(!forbidden.test(page), `page: ${forbidden}`);
  }
});

test("the session key stays in this tab: session storage, never local storage, never sent anywhere but in the signature", () => {
  assert.ok(api.includes("window.sessionStorage.getItem(`wfhDiaryKey:"));
  assert.ok(!/localStorage/.test(api + page + hook));
  assert.ok(hook.includes("signReport(sessionKey, sessionId, report)"));
  assert.ok(!/JSON\.stringify\([^)]*sessionKey/.test(page + hook), "the key is never put in a request body");
});

test("the page writes once per finished block and never polls the server for state", () => {
  assert.ok(hook.includes("blocksToSend("), "only blocks that just finished");
  const fetches = (page.match(/authedFetch</g) ?? []).length;
  assert.equal(fetches, 2, "one load and one POST helper");
  assert.ok(!/setInterval\([^)]*load\(/.test(page));
});

test("consent comes first, with a box to tick; the agreement sends only the version", () => {
  assert.ok(consent.includes('disabled={!checked || busy}'));
  assert.ok(page.includes('post({ action: "consent", version: me.consent.version })'));
  const order = ["!me.enabled", "!me.wfhToday", "!me.consent.agreed", "!session ?"];
  let at = -1;
  for (const step of order) {
    const i = page.indexOf(step);
    assert.ok(i > at, `${step} is checked in order`);
    at = i;
  }
});

test("stopping is confirmed and says it cannot be undone today; the phone warning is shown while running", () => {
  assert.ok(page.includes("it cannot be started again today"));
  assert.ok(page.includes("Phones and some browsers put background tabs to sleep"));
  assert.ok(page.includes("This tab did not start the session"));
});

test("the still-here prompt answers with the check's own index and code, and counts down from now", () => {
  assert.ok(page.includes('post({ action: "answer", check: check.index, code: check.code })'));
  assert.ok(dialog.includes("setNow(Date.now() + offsetMs);"));
  assert.ok(dialog.includes("disabled={busy || left === 0}"));
});

test("loading, error and every empty state exist; buttons are tall enough to tap", () => {
  for (const text of ["<Skeleton", "Try again", "The work diary is not switched on", "Today is not a work-from-home day"]) {
    assert.ok(page.includes(text), text);
  }
  assert.ok((page.match(/className="h-10/g) ?? []).length >= 4);
});

// Added by the integrator on top of #154.
test("the diary page can be found: a menu entry for employees and a link from My page", () => {
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  assert.ok(shell.includes('{ to: "/wfh-diary", label: "Work diary", icon: Laptop }'));
  const section = readFileSync("src/components/wfh/MyWfhSection.tsx", "utf8");
  assert.ok(section.includes('to="/wfh-diary"'));
});

test("stopping first reports the block that just finished, so its minutes are not lost", () => {
  assert.ok(page.includes('if (action === "stop") await flush();'));
  assert.ok(page.indexOf('await flush();') < page.indexOf("const result = await post({ action });"));
  assert.ok(hook.includes("flush: async"));
});

test("scrolling by finger counts; figures for blocks that can no longer be reported are dropped", () => {
  assert.ok(hook.includes('addEventListener("touchmove", onScroll'));
  assert.ok(hook.includes("finished.current.delete(index)"));
});

test("a small change in the clock difference does not rebuild the listeners and the timer", () => {
  assert.ok(hook.includes("offsetRef.current = offsetMs;"));
  assert.ok(hook.includes("}, [running, startedAtMs, sessionId, sessionKey]);"));
});
