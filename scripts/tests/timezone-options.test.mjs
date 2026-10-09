import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isValidZone,
  cityOf,
  offsetMinutes,
  offsetLabel,
  labelFor,
  buildTimezoneOptions,
  searchTimezones,
  withZone,
  clockIn,
  sameAsUtcAllYear,
  suggestedInstead,
} from "../../src/lib/timezone-options.ts";

const JAN = new Date("2026-01-15T12:00:00.000Z");
const JUL = new Date("2026-07-15T12:00:00.000Z");
const options = buildTimezoneOptions(Intl.supportedValuesOf("timeZone"), JAN);
const ids = (list) => list.map((o) => o.id);

test("a real zone is valid; junk and empty values are not", () => {
  assert.equal(isValidZone("Africa/Accra"), true);
  assert.equal(isValidZone("UTC"), true);
  assert.equal(isValidZone("Africa/Accraa"), false);
  assert.equal(isValidZone(""), false);
  assert.equal(isValidZone(undefined), false);
  assert.equal(isValidZone(42), false);
});

test("offsets are right, including half and quarter hours and daylight saving", () => {
  assert.equal(offsetMinutes("Africa/Accra", JAN), 0);
  assert.equal(offsetMinutes("Africa/Lagos", JAN), 60);
  assert.equal(offsetMinutes("Africa/Nairobi", JAN), 180);
  assert.equal(offsetMinutes("Asia/Kolkata", JAN), 330);
  assert.equal(offsetMinutes("Asia/Kathmandu", JAN), 345);
  assert.equal(offsetMinutes("America/New_York", JAN), -300);
  assert.equal(offsetMinutes("America/New_York", JUL), -240);
  assert.equal(offsetMinutes("Europe/London", JAN), 0);
  assert.equal(offsetMinutes("Europe/London", JUL), 60);
});

test("offset labels read naturally", () => {
  assert.equal(offsetLabel(0), "GMT+0");
  assert.equal(offsetLabel(60), "GMT+1");
  assert.equal(offsetLabel(330), "GMT+5:30");
  assert.equal(offsetLabel(-300), "GMT-5");
  assert.equal(offsetLabel(-570), "GMT-9:30");
});

test("labels are friendly: city and country when known, city and area otherwise", () => {
  assert.equal(labelFor("Africa/Lagos"), "Lagos, Nigeria");
  assert.equal(labelFor("Africa/Accra"), "Accra, Ghana");
  assert.equal(labelFor("America/Argentina/Buenos_Aires"), "Buenos Aires, Argentina");
  assert.equal(labelFor("America/Buenos_Aires"), "Buenos Aires, Argentina");
  assert.equal(labelFor("Asia/Kolkata"), "Kolkata, India");
  assert.equal(labelFor("Asia/Calcutta"), "Kolkata, India"); // older spelling some browsers list
  assert.equal(labelFor("America/Argentina/Cordoba"), "Cordoba (America)");
  assert.equal(labelFor("UTC"), "UTC (no local time)");
  assert.equal(cityOf("America/Argentina/Buenos_Aires"), "Buenos Aires");
});

test("UTC is always offered, even though the browser's own list leaves it out", () => {
  assert.equal(Intl.supportedValuesOf("timeZone").includes("UTC"), false);
  assert.ok(ids(options).includes("UTC"));
});

test("the list runs from the earliest offset to the latest", () => {
  const minutes = options.map((o) => o.offsetMinutes);
  assert.deepEqual(minutes, [...minutes].sort((a, b) => a - b));
});

test("searching by city finds it first", () => {
  assert.equal(searchTimezones(options, "lagos")[0].id, "Africa/Lagos");
  assert.equal(searchTimezones(options, "Accra")[0].id, "Africa/Accra");
});

test("searching by country finds the zone", () => {
  assert.ok(ids(searchTimezones(options, "nigeria")).includes("Africa/Lagos"));
  assert.ok(ids(searchTimezones(options, "ghana")).includes("Africa/Accra"));
  assert.ok(ids(searchTimezones(options, "kenya")).includes("Africa/Nairobi"));
});

test("searching by technical name or by offset works too", () => {
  assert.ok(ids(searchTimezones(options, "africa/lagos")).includes("Africa/Lagos"));
  assert.ok(ids(searchTimezones(options, "gmt+1", 500)).includes("Africa/Lagos"));
  // India is listed as Kolkata or Calcutta depending on the browser; people search for Kolkata either way.
  const india = searchTimezones(options, "gmt+5:30", 500);
  assert.ok(india.some((o) => o.label === "Kolkata, India"));
  assert.ok(searchTimezones(options, "kolkata").some((o) => o.label === "Kolkata, India"));
});

test("several words must all match, and nonsense finds nothing", () => {
  assert.ok(searchTimezones(options, "buenos aires").some((o) => o.label === "Buenos Aires, Argentina"));
  assert.deepEqual(searchTimezones(options, "zzzzqqq"), []);
});

test("an empty search shows the start of the list, capped", () => {
  assert.equal(searchTimezones(options, "", 10).length, 10);
  assert.ok(searchTimezones(options, "", 60).length <= 60);
});

test("the live preview shows the time in that zone", () => {
  const at = new Date("2026-03-10T08:52:07.000Z");
  assert.equal(clockIn("UTC", at), "08:52");
  assert.equal(clockIn("Africa/Lagos", at), "09:52");
  assert.equal(clockIn("Asia/Kolkata", at), "14:22");
  assert.equal(clockIn("Not/AZone", at), "");
});

test("zones that are the same as UTC all year are recognised (Accra yes, London no)", () => {
  assert.equal(sameAsUtcAllYear("Africa/Accra", JAN), true);
  assert.equal(sameAsUtcAllYear("Africa/Abidjan", JAN), true);
  assert.equal(sameAsUtcAllYear("Europe/London", JAN), false);
  assert.equal(sameAsUtcAllYear("Africa/Lagos", JAN), false);
});

test("the warning appears only when the organization is on UTC and the device is somewhere that differs", () => {
  assert.equal(suggestedInstead("UTC", "Africa/Lagos", JAN), "Africa/Lagos");
  assert.equal(suggestedInstead("UTC", "Europe/London", JAN), "Europe/London"); // wrong in summer
  assert.equal(suggestedInstead("UTC", "Africa/Accra", JAN), null); // same as UTC all year: nothing to warn about
  assert.equal(suggestedInstead("UTC", "UTC", JAN), null);
  assert.equal(suggestedInstead("UTC", null, JAN), null);
  assert.equal(suggestedInstead("UTC", "Not/AZone", JAN), null);
  assert.equal(suggestedInstead("Africa/Lagos", "Asia/Kolkata", JAN), null); // a deliberate choice is respected
});

test("sign-up refuses an unrecognised timezone instead of quietly using UTC", () => {
  const src = readFileSync("src/routes/api/auth/register-org.ts", "utf8");
  assert.match(src, /isValidZone\(timezone\)/);
  assert.match(src, /Please choose your timezone from the list/);
  assert.doesNotMatch(src, /unknown zone names fall back to UTC/);
});

test("a stored zone this browser does not list is still shown, not called 'not recognised'", () => {
  const without = options.filter((o) => o.id !== "Africa/Accra");
  const added = withZone(without, "Africa/Accra", JAN);
  assert.ok(added.some((o) => o.id === "Africa/Accra" && o.label === "Accra, Ghana"));
  assert.equal(withZone(options, "Africa/Accra", JAN), options); // already there: unchanged
  assert.equal(withZone(options, "Not/AZone", JAN), options); // invalid: not added
});
