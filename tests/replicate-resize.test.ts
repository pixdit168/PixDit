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

test("logo reference keeps its transparent background for AI composition", async () => {
  const transparentLogo = await sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 20, g: 100, b: 210, alpha: 1 } } }).png().toBuffer(), left: 12, top: 12 }]).png().toBuffer();
  const provider = new ReplicateImageProvider({ token: "test-token" });
  const dataUri = await provider.prepareLogoReferenceImage(`data:image/png;base64,${transparentLogo.toString("base64")}`);
  const pixels = await sharp(Buffer.from(dataUri.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
  assert.match(dataUri, /^data:image\/png;base64,/);
  assert.equal(pixels.info.channels, 4);
  assert.equal(pixels.data[3], 0);
  assert.equal(pixels.data[(20 * 40 + 20) * 4 + 3], 255);
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
  const provider = new ReplicateImageProvider({ token: "test-token", model: "black-forest-labs/flux-2-pro", fetchImpl: fakeFetch, pollIntervalMs: 1 });
  const result = await provider.run({ prompt: "A premium product key visual", format: "Instagram Post · 4:5", quality: "2mp" });

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(result.buffer.length > 0);
  assert.equal(requests.length, 3);
  const createRequest = requests[0];
  assert.equal(createRequest.options.headers.Authorization, "Bearer test-token");
  assert.equal(createRequest.options.headers.Prefer, undefined);
  const body = JSON.parse(createRequest.options.body);
  assert.equal(body.input.resolution, "2 MP");
  assert.equal(body.input.aspect_ratio, "4:5");
  assert.deepEqual(body.input.input_images, []);
  assert.ok(Number.isInteger(body.input.seed));
});

test("an aborted generation asks Replicate to cancel the prediction", async () => {
  const requests = [];
  const fakeFetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/models/black-forest-labs/flux-2-pro/predictions")) {
      return new Response(JSON.stringify({
        id: "prediction-cancel",
        status: "processing",
        urls: {
          get: "https://api.replicate.com/v1/predictions/prediction-cancel",
          cancel: "https://api.replicate.com/v1/predictions/prediction-cancel/cancel",
        },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/prediction-cancel/cancel")) {
      return new Response(JSON.stringify({ id: "prediction-cancel", status: "canceled" }), { status: 200 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new ReplicateImageProvider({ token: "test-token", model: "black-forest-labs/flux-2-pro", fetchImpl: fakeFetch, pollIntervalMs: 100 });
  const controller = new AbortController();
  const run = provider.run({ prompt: "A product visual", format: "Persegi · 1:1", quality: "1mp", signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(run, (error: any) => error?.name === "AbortError");
  assert.ok(requests.some((request) => request.url.endsWith("/prediction-cancel/cancel") && request.options.method === "POST"));
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
  const preparedLogo = await provider.prepareLogoReferenceImage(`data:image/png;base64,${(await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 30, g: 80, b: 160, alpha: 0.5 } } }).png().toBuffer()).toString("base64")}`);
  const result = await provider.run({
    prompt: "Develop this product into a premium campaign visual",
    format: "Persegi · 1:1",
    quality: "4mp",
    preparedReferenceImages: [preparedReferenceImage, preparedReferenceImage, preparedLogo],
  });

  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(requests.length, 2);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.input.instruction, "Develop this product into a premium campaign visual");
  assert.equal(body.input.resolution, "4K");
  assert.equal(body.input.aspect_ratio, "1:1");
  assert.deepEqual(body.input.init_images, [preparedReferenceImage, preparedReferenceImage, preparedLogo]);
  assert.equal(body.input.enhance_prompt, false);
  assert.equal(body.input.max_iterations, 3);
  assert.equal(body.input.prompt, undefined);
  assert.equal(body.input.input_images, undefined);
});

test("text-only Z-Image Turbo rejects product references instead of ignoring them", async () => {
  const provider = new ReplicateImageProvider({ token: "test-token", model: "prunaai/z-image-turbo" });
  await assert.rejects(
    provider.run({ prompt: "Product poster", format: "Persegi · 1:1", quality: "1mp", preparedReferenceImages: ["data:image/jpeg;base64,AA=="] }),
    /tidak menerima gambar referensi/,
  );
});

test("GPT Image 2 uses native inputs and fits the complete 3:4 output into a 4:5 frame", async () => {
  const baseImage = await sharp({
    create: { width: 300, height: 400, channels: 3, background: { r: 50, g: 90, b: 140 } },
  }).png().toBuffer();
  const bottomBand = await sharp({
    create: { width: 300, height: 50, channels: 3, background: { r: 225, g: 35, b: 45 } },
  }).png().toBuffer();
  const outputImage = await sharp(baseImage).composite([{ input: bottomBand, left: 0, top: 350 }]).jpeg().toBuffer();
  const referenceImage = `data:image/jpeg;base64,${outputImage.toString("base64")}`;
  const requests = [];
  const fakeFetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/models/openai/gpt-image-2/predictions")) {
      return new Response(JSON.stringify({
        id: "gpt-image-test",
        status: "processing",
        urls: { get: "https://api.replicate.com/v1/predictions/gpt-image-test" },
      }), { status: 201 });
    }
    if (String(url).endsWith("/predictions/gpt-image-test")) {
      return new Response(JSON.stringify({ status: "succeeded", output: ["https://replicate.delivery/test/gpt-image-2.jpeg"] }), { status: 200 });
    }
    if (String(url) === "https://replicate.delivery/test/gpt-image-2.jpeg") {
      return new Response(outputImage, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const provider = new ReplicateImageProvider({ token: "test-token", model: "openai/gpt-image-2", fetchImpl: fakeFetch, pollIntervalMs: 1 });
  const result = await provider.run({
    prompt: "A premium product photograph",
    format: "Instagram Post · 4:5",
    quality: "4mp",
    preparedReferenceImage: referenceImage,
  });

  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.input.prompt, "A premium product photograph");
  assert.equal(body.input.quality, "high");
  assert.equal(body.input.aspect_ratio, "3:4");
  assert.deepEqual(body.input.input_images, [referenceImage]);
  assert.equal(body.input.number_of_images, 1);
  assert.equal(body.input.output_format, "jpeg");
  assert.equal(body.input.output_compression, 90);
  assert.equal(body.input.resolution, undefined);
  assert.equal(body.input.seed, undefined);
  assert.equal(result.mimeType, "image/jpeg");
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 400);
  const bottomPixel = await sharp(result.buffer).extract({ left: 160, top: 390, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(bottomPixel[0] > 170 && bottomPixel[1] < 90, "The source image's bottom edge must remain visible");
});
