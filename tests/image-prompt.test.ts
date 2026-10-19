import assert from "node:assert/strict";
import test from "node:test";
import { newImagePrompt } from "../lib/image-prompt.js";

test("direct generation preserves the user's complete prompt", () => {
  const brief = "Create a luxury advertisement for an iced coffee in a transparent glass, on a black marble table, with dramatic lighting and a dark background. Include the text 'Kopi Pilihan'.";
  assert.equal(newImagePrompt({ brief }), brief);
  assert.equal(newImagePrompt({ brief, style: "Eksploratif", primaryColor: "#5a3529" }), brief);
});

test("only explicitly selected options add lower-priority style and palette cues", () => {
  const brief = "A red sports shoe against a white wall.";
  const prompt = newImagePrompt({ brief, style: "Minimal", styleExplicit: true, primaryColor: "#0000ff", primaryColorExplicit: true });
  assert.ok(prompt.startsWith(brief));
  assert.match(prompt, /minimal and uncluttered/);
  assert.match(prompt, /If compatible with the user's prompt, use rich blue/);
  assert.doesNotMatch(prompt, /creative agent|behavioral agent|camera angle|no text|no lettering/i);
});

test("product reference is acknowledged without replacing the prompt", () => {
  const brief = "Photograph my bottled tea in a sunny kitchen.";
  const prompt = newImagePrompt({ brief, hasProductReference: true });
  assert.ok(prompt.startsWith(brief));
  assert.match(prompt, /supplied product image/);
});

test("refinement uses the existing image and only the requested edit", () => {
  const prompt = newImagePrompt({ brief: "Old campaign about coffee", refinement: "Change the glass to blue and keep the lettering." });
  assert.match(prompt, /Edit the supplied image/);
  assert.match(prompt, /Change the glass to blue and keep the lettering/);
  assert.doesNotMatch(prompt, /Old campaign|creative agent|no text/i);
});
