import assert from "node:assert/strict";
import test from "node:test";

import { creativeAgents } from "../lib/creative-agents.js";
import { convertToVisualBrief, newImagePrompt } from "../lib/image-prompt.js";

test("visual brief removes prices without losing property details", () => {
  const brief = convertToVisualBrief("Rumah cluster dekat BSD dan mall, harga start from 1.3M, 3 kamar tidur, luas 120 m2.");
  assert.match(brief, /rumah cluster dekat BSD/i);
  assert.match(brief, /3 kamar tidur, luas 120 m2/i);
  assert.doesNotMatch(brief, /harga|start from|1\.3M/i);
  assert.doesNotMatch(brief, /,\s*,/);
  assert.doesNotMatch(convertToVisualBrief("Apartemen dekat stasiun mulai dari Rp1,3 miliar"), /Rp|1,3|miliar/i);
  assert.equal(convertToVisualBrief("Rumah dekat stasiun, harga 1300000000, 2 kamar"), "Rumah dekat stasiun, 2 kamar");
});

test("generation prompt is concise and contains no instruction headings, prices, or copy labels", () => {
  const prompt = newImagePrompt({
    brief: "Promosi rumah cluster dekat BSD, harga mulai dari Rp1,3 miliar, 3 kamar tidur",
    category: "Properti",
    creativeAgent: creativeAgents[9],
    format: "Instagram Post 4:5",
    style: "Eksploratif",
    primaryColor: "#5a3529",
  });
  assert.match(prompt, /rumah cluster dekat BSD/i);
  assert.match(prompt, /3 kamar tidur/i);
  assert.match(prompt, /unmarked negative space/i);
  assert.doesNotMatch(prompt, /IMPORTANT OUTPUT RULE|Primary visual brief|copy zone|harga|\bRp\s*\d|1,3 miliar/i);
  assert.ok(prompt.length < 1_300, `prompt was ${prompt.length} characters`);
});
