import { test } from "node:test";
import assert from "node:assert/strict";
import { assertEnvironmentSafe } from "../../src/lib/env-guard.ts";

const PROD = "prod-project";

test("a Preview deployment pointed at the production project is refused", () => {
  assert.throws(
    () => assertEnvironmentSafe({ vercelEnv: "preview", projectId: PROD, productionProjectId: PROD }),
    /PREVIEW deployment/,
  );
});

test("a Preview deployment on the staging project is allowed", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentSafe({ vercelEnv: "preview", projectId: "staging-project", productionProjectId: PROD }),
  );
});

test("production on the production project is allowed", () => {
  assert.doesNotThrow(() =>
    assertEnvironmentSafe({ vercelEnv: "production", projectId: PROD, productionProjectId: PROD }),
  );
});

test("a local run (no VERCEL_ENV) is not blocked by this guard", () => {
  assert.doesNotThrow(() => assertEnvironmentSafe({ projectId: "staging-project", productionProjectId: PROD }));
});

test("a missing project id is refused", () => {
  assert.throws(() => assertEnvironmentSafe({ vercelEnv: "preview", projectId: "" }), /project id/);
});
