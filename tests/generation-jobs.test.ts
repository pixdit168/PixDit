import assert from "node:assert/strict";
import test from "node:test";
import { getGenerationJobs } from "../lib/generation-jobs.js";
import { newImagePrompt } from "../lib/image-prompt.js";

test("one-image generation has a neutral slot without a creative direction", () => {
  assert.deepEqual(getGenerationJobs(1), [{ slot: 0, name: "Variasi 01" }]);
});

test("ten-image generation has ten neutral slots without predefined styles", () => {
  const jobs = getGenerationJobs(10);
  assert.equal(jobs.length, 10);
  assert.deepEqual(jobs.map((job) => job.slot), Array.from({ length: 10 }, (_, index) => index));
  assert.equal(jobs[9].name, "Variasi 10");
  assert.ok(jobs.every((job) => !Object.hasOwn(job, "creativeAgent") && !Object.hasOwn(job, "agentIndex")));
  const brief = "A bottle of iced tea on a wooden table in afternoon sunlight.";
  assert.deepEqual(jobs.map(() => newImagePrompt({ brief })), Array(10).fill(brief));
});
