import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { NineRouterImageProvider } from "../lib/nine-router.js";

test("9Router provider stays disabled until a model is configured", () => {
  const provider = new NineRouterImageProvider({ token: "test-token", model: "", apiBase: "https://api.9router.com" });
  assert.equal(provider.configured, false);
  assert.deepEqual(provider.missingConfiguration, ["NINEROUTER_IMAGE_MODEL"]);
});

test("9Router provider sends an image request and normalizes binary output", async () => {
  const source = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#88aa33" } }).png().toBuffer();
  let capturedUrl = "";
  let capturedBody = null;
  const provider = new NineRouterImageProvider({
    token: "test-token",
    model: "provider/test-image-model",
    apiBase: "https://api.9router.com/v1",
    fetchImpl: async (url, options) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(options.body);
      return new Response(source, { status: 200, headers: { "content-type": "image/png" } });
    },
  });

  const result = await provider.run({ prompt: "A clean commercial key visual", format: "Instagram Post · 4:5" });
  assert.equal(capturedUrl, "https://api.9router.com/v1/images/generations?response_format=binary");
  assert.equal(capturedBody.model, "provider/test-image-model");
  assert.equal(capturedBody.size, "1024x1280");
  assert.equal(capturedBody.n, 1);
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.extension, "jpg");
  assert.ok(result.buffer.length > 0);
});
