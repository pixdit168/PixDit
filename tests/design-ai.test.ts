import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  DesignAI,
  composeDesign,
  normalizeAsset,
  rasterData,
  validateLayout,
} from "../lib/design-ai.js";

const layout = (count = 1) => ({
  backgroundPrompt: "Soft purple studio scenery with clean empty space",
  background: "#211838",
  color: "#ffffff",
  texts: [
    {
      role: "headline",
      text: "AI words",
      x: 0.08,
      y: 0.08,
      width: 0.8,
      height: 0.2,
      size: 0.05,
    },
  ],
  products: Array.from({ length: count }, (_, i) => ({
    x: 0.08 + i * 0.2,
    y: 0.35,
    width: 0.2,
    height: 0.4,
  })),
  logo: { x: 0.8, y: 0.05, width: 0.15, height: 0.1 },
  decorations: [],
});
test("layout uses exact custom wording, keeps blanks empty and produces independent uploaded layers", () => {
  const plan = validateLayout(JSON.stringify(layout(2)), 2, {
    headline: "Kopi Asli — Rp 12.000!",
    brand: "",
    cta: "",
  });
  const asset = () => {
    const id = randomUUID();
    return { id, url: `/api/design-assets/${id}`, width: 640, height: 800 };
  };
  const background = asset(),
    products = [asset(), asset()],
    logo = asset();
  const document = composeDesign(plan, 640, 800, background, products, logo);
  assert.deepEqual(
    document.objects
      .filter((value) => value.type === "text")
      .map((value) => value.text),
    ["Kopi Asli — Rp 12.000!"],
  );
  assert.equal(
    document.objects.filter((value) => value.assetId === logo.id).length,
    1,
  );
  assert.equal(
    document.objects.filter((value) => value.type === "image").length,
    4,
  );
  assert.equal(document.objects[0].locked, true);
  assert.ok(document.objects.slice(1).every((value) => !value.locked));
});
test("invalid planner layouts are rejected before background generation", () => {
  assert.throws(() => validateLayout("not JSON", 0));
  assert.throws(() => validateLayout(JSON.stringify(layout(1)), 2));
  const outside = layout();
  outside.products[0].x = 1;
  assert.throws(() => validateLayout(JSON.stringify(outside), 1), /kanvas/);
  const duplicate = layout();
  duplicate.texts.push(duplicate.texts[0]);
  assert.throws(() => validateLayout(JSON.stringify(duplicate), 1));
});
test("planner waits for terminal status instead of treating partial token output as a complete result", async () => {
  let polls = 0;
  const provider = new DesignAI({
    token: "test",
    model: "meta/meta-llama-3-70b-instruct",
    pollIntervalMs: 1,
    fetchImpl: async (url, options) => {
      assert.match(String(url), /^https:\/\/api\.replicate\.com/);
      if (options?.method === "POST")
        return Response.json({
          id: "plan",
          status: "processing",
          output: ["{incomplete"],
        });
      polls++;
      return Response.json({
        id: "plan",
        status: "succeeded",
        output: [JSON.stringify(layout(0))],
      });
    },
  });
  assert.equal(
    (
      await provider.plan(
        "Generate a coffee advertisement",
        0,
        false,
        undefined,
      )
    ).texts[0].text,
    "AI words",
  );
  assert.equal(polls, 1);
  await assert.rejects(
    () =>
      provider.plan(
        'Use headline "Exact title" for coffee',
        0,
        false,
        undefined,
      ),
    /tanda kutip/,
  );
});
test("planner cancellation requests prediction cancellation without accepting partial output", async () => {
  const controller = new AbortController();
  let canceled = false;
  const provider = new DesignAI({
    token: "test",
    pollIntervalMs: 1,
    fetchImpl: async (url) => {
      if (String(url).endsWith("/cancel")) {
        canceled = true;
        return Response.json({});
      }
      controller.abort();
      return Response.json({
        id: "pending",
        status: "processing",
        output: ["partial"],
      });
    },
  });
  await assert.rejects(() =>
    provider.predict({ prompt: "test" }, controller.signal),
  );
  assert.equal(canceled, true);
});
test("uploads preserve original alpha bytes and reject SVG, oversized or malformed data", async () => {
  const buffer = await sharp({
    create: { width: 40, height: 50, channels: 4, background: "#ffffff00" },
  })
    .png()
    .toBuffer();
  const normalized = await normalizeAsset(
    rasterData(`data:image/png;base64,${buffer.toString("base64")}`),
  );
  assert.deepEqual(normalized.buffer, buffer);
  assert.equal(normalized.width, 40);
  assert.equal((await sharp(normalized.buffer).stats()).isOpaque, false);
  assert.throws(() => rasterData("data:image/svg+xml;base64,PHN2Zz4="));
  assert.throws(() => rasterData("data:image/png;base64,AA=="));
});
test("provider output download rejects untrusted hosts and unsafe redirects", async () => {
  let calls = 0;
  const provider = new DesignAI({
    token: "test",
    fetchImpl: async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
      });
    },
  });
  await assert.rejects(
    () => provider.downloadRaster("https://evil.test/file.png"),
    /diizinkan/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () => provider.downloadRaster("https://replicate.delivery/file.png"),
    /diizinkan/,
  );
  assert.equal(calls, 1);
});
