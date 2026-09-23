import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ReplicateImageProvider } from "../lib/replicate.js";

test("reference image is resized before it is sent to Replicate", async (context) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "layera-resize-"));
  context.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const sourcePath = path.join(temporaryRoot, "large-source.jpg");
  await sharp({
    create: {
      width: 3200,
      height: 2400,
      channels: 3,
      background: { r: 238, g: 225, b: 210 },
    },
  }).jpeg({ quality: 96 }).toFile(sourcePath);

  const provider = new ReplicateImageProvider({ token: "test-token" });
  const dataUri = await provider.prepareReferenceImage(sourcePath);
  const payload = Buffer.from(dataUri.split(",")[1], "base64");
  const metadata = await sharp(payload).metadata();

  assert.match(dataUri, /^data:image\/jpeg;base64,/);
  assert.ok(payload.length < 1_000_000, `payload was ${payload.length} bytes`);
  assert.ok(metadata.width * metadata.height <= 1_020_000, `image was ${metadata.width}x${metadata.height}`);
  assert.ok(metadata.width < 3200 && metadata.height < 2400);
});

test("Flux 2 Pro prediction is created, polled, and downloaded", async () => {
  const outputImage = await sharp({
    create: { width: 64, height: 80, channels: 3, background: { r: 25, g: 45, b: 70 } },
  }).jpeg().toBuffer();
  const requests = [];
  const fakeFetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/models/black-forest-labs/flux-2-pro/predictions")) {
      return new Response(JSON.stringify({
        id: "prediction-test",
        status: "processing",
        urls: { get: "https://api.replicate.com/v1/predictions/prediction-test" },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("/v1/predictions/prediction-test")) {
      return new Response(JSON.stringify({ status: "succeeded", output: "https://replicate.delivery/test/output.jpg" }), { status: 200 });
    }
    if (String(url) === "https://replicate.delivery/test/output.jpg") {
      return new Response(outputImage, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(outputImage.length) } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new ReplicateImageProvider({ token: "test-token", fetchImpl: fakeFetch, pollIntervalMs: 1 });
  const result = await provider.run({ prompt: "A premium product key visual", format: "Instagram Post · 4:5", quality: "2mp" });

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(result.buffer.length > 0);
  assert.equal(requests.length, 3);
  const createRequest = requests[0];
  assert.equal(createRequest.options.headers.Authorization, "Bearer test-token");
  assert.equal(createRequest.options.headers.Prefer, "wait=60");
  const body = JSON.parse(createRequest.options.body);
  assert.equal(body.input.resolution, "2 MP");
  assert.equal(body.input.aspect_ratio, "4:5");
  assert.deepEqual(body.input.input_images, []);
});

test("Riverflow 2.0 Pro receives its native instruction and init_images fields", async () => {
  const outputImage = await sharp({
    create: { width: 80, height: 64, channels: 3, background: { r: 90, g: 120, b: 55 } },
  }).webp().toBuffer();
  const referenceImage = await sharp({
    create: { width: 900, height: 900, channels: 3, background: { r: 220, g: 210, b: 190 } },
  }).jpeg().toBuffer();
  const referenceDataUrl = `data:image/jpeg;base64,${referenceImage.toString("base64")}`;
  const requests = [];
  const fakeFetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/models/sourceful/riverflow-2.0-pro/predictions")) {
      return new Response(JSON.stringify({
        id: "riverflow-test",
        status: "succeeded",
        output: ["https://replicate.delivery/test/riverflow.webp"],
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (String(url) === "https://replicate.delivery/test/riverflow.webp") {
      return new Response(outputImage, { status: 200, headers: { "content-type": "image/webp", "content-length": String(outputImage.length) } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new ReplicateImageProvider({
    token: "test-token",
    model: "sourceful/riverflow-2.0-pro",
    fetchImpl: fakeFetch,
  });
  const preparedReferenceImage = await provider.prepareReferenceImage(referenceDataUrl);
  const result = await provider.run({
    prompt: "Develop this product into a premium campaign visual",
    format: "Persegi · 1:1",
    quality: "4mp",
    preparedReferenceImage,
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(requests.length, 2);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.input.instruction, "Develop this product into a premium campaign visual");
  assert.equal(body.input.resolution, "4K");
  assert.equal(body.input.aspect_ratio, "1:1");
  assert.deepEqual(body.input.init_images, [preparedReferenceImage]);
  assert.equal(body.input.enhance_prompt, true);
  assert.equal(body.input.max_iterations, 3);
  assert.equal(body.input.prompt, undefined);
  assert.equal(body.input.input_images, undefined);
});
