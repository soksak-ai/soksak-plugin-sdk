import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseContext } from "./release-context.mjs";

const commit = "a".repeat(40);
const owner = { repository: "https://github.com/soksak-ai/soksak-plugin-sdk" };
const environment = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "soksak-ai/soksak-plugin-sdk",
  GITHUB_SHA: commit,
};

test("release context binds a manual main workflow to the exact checkout", () => {
  assert.deepEqual(validateReleaseContext({ environment, checkoutHead: commit, owner }), {
    repository: environment.GITHUB_REPOSITORY,
    commit,
  });
});

test("release context rejects tags, other repositories, and non-exact checkouts", () => {
  assert.throws(() => validateReleaseContext({
    environment: { ...environment, GITHUB_REF: "refs/tags/v0.0.1" },
    checkoutHead: commit,
    owner,
  }), /main branch/);
  assert.throws(() => validateReleaseContext({
    environment: { ...environment, GITHUB_REPOSITORY: "attacker/fork" },
    checkoutHead: commit,
    owner,
  }), /owner repository/);
  assert.throws(() => validateReleaseContext({
    environment,
    checkoutHead: "b".repeat(40),
    owner,
  }), /checkout HEAD/);
});
