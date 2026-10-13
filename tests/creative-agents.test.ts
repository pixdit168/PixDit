import assert from "node:assert/strict";
import test from "node:test";

import { creativeAgents, getBehavioralPrompt } from "../lib/creative-agents.js";

test("ten behavioral agents have exclusive visual identities", () => {
  assert.equal(creativeAgents.length, 10);
  for (const field of ["name", "agent", "signature", "composition", "medium", "avoid"]) {
    assert.equal(new Set(creativeAgents.map((agent) => agent[field])).size, 10, `${field} must be unique`);
  }

  const expectedSignatures = [
    /documentary-style human story/i,
    /high-energy instant/i,
    /three-to-five-stage visual explanation/i,
    /matrix showing four-to-six/i,
    /extreme close detail/i,
    /two-part visual argument/i,
    /journey through space/i,
    /mixed-media collision/i,
    /sculptural centerpiece/i,
    /exaggerated scale relationship/i,
  ];
  creativeAgents.forEach((agent, index) => assert.match(agent.signature, expectedSignatures[index]));
});

test("behavioral prompt enforces composition and separation contracts", () => {
  const prompts = creativeAgents.map(getBehavioralPrompt);
  assert.equal(new Set(prompts).size, 10);
  prompts.forEach((prompt, index) => {
    assert.ok(prompt.includes(creativeAgents[index].signature));
    assert.ok(prompt.includes(creativeAgents[index].composition));
    assert.ok(prompt.includes(creativeAgents[index].medium));
    assert.ok(prompt.includes(creativeAgents[index].avoid));
    assert.match(prompt, /Do not fall back to a universal corporate-poster template/);
    assert.doesNotMatch(prompt, /behavioral agent|agent (?:aruna|bima|citra|dara|elang|fajar|gita|harsa|intan|jaya)|exclusive visual signature|composition contract|rendering language|separation rule/i);
    assert.ok(!prompt.includes(creativeAgents[index].name));
  });
});

test("unknown behavioral agents are rejected", () => {
  assert.throws(() => getBehavioralPrompt({ name: "Unknown" }), /tidak valid/i);
});
