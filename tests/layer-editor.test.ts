import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import sharp from "sharp";
import { handleLayerEditor, normalizeCanvasDocument, ReplicateLayerProvider } from "../lib/layer-editor.js";
import { MemoryStore } from "../lib/supabase.js";

const textLayer = () => ({ id: "text-1", kind: "text", name: "Headline", x: 10, y: 10, width: 100, height: 40, rotation: 0, opacity: 1, visible: true, locked: false, text: "Promo", fontSize: 24, fontFamily: "Arial", color: "#ffffff", bold: true, align: "left" });
const canvasDoc = (layers: any[] = [textLayer()]) => ({ version: 1, width: 128, height: 160, layers });
const fixture = async () => sharp({ create: { width: 128, height: 160, channels: 4, background: "#403070" } }).png().toBuffer();

test("canvas documents reject cross-account images, executable URLs, invalid geometry and duplicate IDs", () => {
  assert.equal(normalizeCanvasDocument(canvasDoc(), () => false).layers[0].text, "Promo");
  for (const url of ["javascript:alert(1)", "https://evil.test/image.png", "/generated/other/secret.png", "data:image/svg+xml;base64,AA=="]) assert.throws(() => normalizeCanvasDocument(canvasDoc([{ ...textLayer(), kind: "image", url }]), () => false));
  for (const patch of [{ x: NaN }, { rotation: Infinity }, { width: -1 }, { opacity: 4 }, { fontSize: 0 }, { color: "red;position:fixed" }]) assert.throws(() => normalizeCanvasDocument(canvasDoc([{ ...textLayer(), ...patch }]), () => false));
  assert.throws(() => normalizeCanvasDocument(canvasDoc([textLayer(), textLayer()]), () => true));
  assert.throws(() => normalizeCanvasDocument({ ...canvasDoc(), width: 100000 }, () => true));
  assert.throws(() => normalizeCanvasDocument(canvasDoc(Array(33).fill(textLayer())), () => true));
  assert.throws(() => normalizeCanvasDocument(canvasDoc([{ ...textLayer(), kind: "image", url: `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}` }]), () => true));
  assert.throws(() => normalizeCanvasDocument({ ...canvasDoc(), grading: [{ brightness: Infinity }] }, () => true));
  assert.equal(normalizeCanvasDocument({ ...canvasDoc(), grading: [{ brightness: 110, contrast: 100, saturation: 100, warmth: 0 }] }, () => true).grading[0].brightness, 110);
});

test("layer adapter waits for full output, preserves alpha, and crops real element bounds", async () => {
  const background = await fixture();
  const object = await sharp({ create: { width: 128, height: 160, channels: 4, background: "#00000000" } }).composite([{ input: await sharp({ create: { width: 20, height: 30, channels: 4, background: "#ff0000" } }).png().toBuffer(), left: 32, top: 40 }]).png().toBuffer();
  const urls = ["https://replicate.delivery/bg.png", "https://replicate.delivery/object.png"];
  let polls = 0;
  const provider = new ReplicateLayerProvider({ model: "qwen/qwen-image-layered", token: "test-only", pollIntervalMs: 1, fetchImpl: (async (url, options) => {
    if (options?.method === "POST") {
      const input = JSON.parse(String(options.body)).input;
      assert.equal(input.output_format, "png"); assert.equal(input.num_layers, 6); assert.equal(input.disable_safety_checker, false);
      assert.match(input.image, /^data:image\/jpeg;base64,/);
      return Response.json({ id: "layers", status: "processing", output: [urls[0]] });
    }
    if (String(url).includes("/predictions/")) { polls++; return Response.json({ id: "layers", status: "succeeded", output: urls }); }
    return new Response(String(url).endsWith("bg.png") ? background : object);
  }) as typeof fetch });
  const result = await provider.decompose(background, 6, new AbortController().signal);
  assert.equal(polls, 1); assert.equal(result.layers.length, 2);
  assert.deepEqual([result.layers[1].x, result.layers[1].y, result.layers[1].width, result.layers[1].height], [32, 40, 20, 30]);
  assert.equal((await sharp(result.layers[1].buffer).metadata()).hasAlpha, true);
  assert.equal(result.layers[1].transparent, true);
});

test("layer adapter rejects opaque duplicate posters and untrusted download hosts", async () => {
  const source = await fixture();
  for (const output of [["https://evil.test/secret.png", "https://replicate.delivery/b.png"], ["https://replicate.delivery/a.png", "https://replicate.delivery/b.png"]]) {
    const provider = new ReplicateLayerProvider({ token: "test-only", model: "qwen/qwen-image-layered", fetchImpl: (async (url, options) => options?.method === "POST" ? Response.json({ id: "done", status: "succeeded", output }) : new Response(source)) as typeof fetch });
    await assert.rejects(provider.decompose(source, 4, new AbortController().signal));
  }
});

test("aborted layer extraction sends prediction cancellation", async () => {
  const source = await fixture(), controller = new AbortController();
  let cancelled = false;
  const provider = new ReplicateLayerProvider({ token: "test-only", model: "qwen/qwen-image-layered", pollIntervalMs: 1, fetchImpl: (async (url, options) => {
    if (String(url).endsWith("/cancel")) { cancelled = true; return Response.json({}); }
    if (options?.method === "POST") { queueMicrotask(() => controller.abort(new Error("cancelled"))); return Response.json({ id: "to-cancel", status: "processing" }); }
    throw new Error("Should not poll after abort");
  }) as typeof fetch });
  await assert.rejects(provider.decompose(source, 4, controller.signal));
  assert.equal(cancelled, true);
});

async function routeFixture() {
  const store = new MemoryStore(), source = await fixture();
  const original = { id: "v1", url: "/generated/original/concept-01.png", immutable: true };
  const item = { id: "item-1", currentVersionId: "v1", versions: [original] };
  store.data.users["user-1"] = { id: "user-1", state: { library: [item] } };
  store.data.generatedFiles[original.url] = { userId: "user-1" };
  await store.saveImage("original/concept-01.png", "user-1", source, "image/png");
  let cost = 0, predictions = 0;
  const provider = { configured: true, async decompose() { predictions++; return { width: 128, height: 160, layers: [{ buffer: source, x: 0, y: 0, width: 128, height: 160 }, { buffer: source, x: 20, y: 30, width: 40, height: 50 }] }; } };
  const activeUserJobs = new Set<string>();
  const context = { store, auth: { user: { id: "user-1" } }, provider, activeUserJobs, sendJson: (response: any, status: number, payload: any) => { response.result = { status, payload }; }, creditAllowed: () => ({ allowed: true }), quotaExceeded: (response: any) => { response.result = { status: 402 }; }, addUsageEvent: async (_id: string, _type: string, credits: number) => { cost += credits; }, getUsageStatus: () => ({ credits: { remaining: 11 - cost } }) };
  const run = async (route: string, input: any = {}) => { const response: any = new EventEmitter(); await handleLayerEditor(route, {}, response, { itemId: item.id, baseVersionId: "v1", ...input }, context); return response.result; };
  return { context, store, item, original, source, provider, activeUserJobs, run, get cost() { return cost; }, get predictions() { return predictions; } };
}

test("decomposition is private, charged once after success, and cached on the source version", async () => {
  const f = await routeFixture();
  const result = await f.run("/api/layers/decompose", { count: 6 });
  assert.equal(result.status, 200); assert.equal(f.cost, 3); assert.equal(f.predictions, 1);
  assert.equal(f.original.url, "/generated/original/concept-01.png"); assert.equal(f.original.immutable, true);
  const url = result.payload.document.layers[1].url;
  assert.ok(await f.store.getImage(url.slice(11), "user-1"));
  assert.equal(await f.store.getImage(url.slice(11), "other-user"), null);
  assert.equal(f.store.data.generatedFiles[url].userId, "user-1");
  assert.equal((await f.run("/api/layers/decompose")).status, 200);
  assert.equal(f.cost, 3); assert.equal(f.predictions, 1); assert.equal(f.activeUserJobs.size, 0);
});

test("manual edits save a new immutable-source-safe version and rehost uploaded assets privately", async () => {
  const f = await routeFixture();
  const document = canvasDoc([{ ...textLayer(), kind: "image", url: `data:image/png;base64,${f.source.toString("base64")}` }, { ...textLayer(), id: "text-2" }]);
  const result = await f.run("/api/layers/save", { document, preview: `data:image/png;base64,${f.source.toString("base64")}` });
  assert.equal(result.status, 200); assert.equal(f.item.versions.length, 2); assert.equal(f.cost, 0);
  const edited = result.payload.version;
  assert.notEqual(edited.id, "v1"); assert.equal(f.item.currentVersionId, edited.id);
  assert.equal(f.original.url, "/generated/original/concept-01.png");
  assert.match(edited.canvasDocument.layers[0].url, /^\/generated\/canvas-/);
  assert.equal(edited.canvasDocument.layers[1].text, "Promo");
  assert.equal(JSON.stringify(edited.canvasDocument).includes("base64"), false);
  assert.ok(await f.store.getImage(edited.url.slice(11), "user-1"));
  assert.equal((await sharp((await f.store.getImage(edited.url.slice(11), "user-1"))!.buffer).metadata()).hasAlpha, true);
});

test("legacy composed sources retain their frame and cached documents cannot borrow foreign assets", async () => {
  const f = await routeFixture();
  const otherSize = await sharp(f.source).resize(64, 64).png().toBuffer();
  assert.equal((await f.run("/api/layers/decompose", { composedSource: `data:image/png;base64,${otherSize.toString("base64")}` })).status, 502);
  assert.equal(f.cost, 0); assert.equal(f.predictions, 0);
  assert.equal((await f.run("/api/layers/decompose", { composedSource: `data:image/png;base64,${f.source.toString("base64")}` })).status, 200);
  (f.original as any).layerDocument.layers[1].url = "/generated/foreign/private.png";
  assert.equal((await f.run("/api/layers/decompose")).status, 400);
});

test("closing a decomposition request cancels work and never consumes application credits", async () => {
  const f = await routeFixture();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  f.provider.decompose = async (_source?: any, _count?: any, signal?: any) => { started(); await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })); return null; };
  const response: any = new EventEmitter();
  const task = handleLayerEditor("/api/layers/decompose", {}, response, { itemId: f.item.id, baseVersionId: "v1" }, f.context);
  await ready; response.destroyed = true; response.emit("close"); await task;
  assert.equal(f.cost, 0); assert.equal(f.activeUserJobs.size, 0); assert.equal((f.original as any).layerDocument, undefined);
});

test("source ownership, quotas, busy jobs, malformed layers and storage failures fail closed", async () => {
  const f = await routeFixture();
  assert.equal((await f.run("/api/layers/decompose", { baseVersionId: "another-user" })).status, 404);
  f.store.data.generatedFiles[f.original.url].userId = "other-user";
  assert.equal((await f.run("/api/layers/decompose")).status, 404);
  f.store.data.generatedFiles[f.original.url].userId = "user-1";
  f.context.creditAllowed = () => ({ allowed: false });
  assert.equal((await f.run("/api/layers/decompose")).status, 402);
  f.context.creditAllowed = () => ({ allowed: true });
  f.activeUserJobs.add("user-1"); assert.equal((await f.run("/api/layers/save")).status, 409); f.activeUserJobs.clear();
  assert.equal((await f.run("/api/layers/decompose", { count: 99 })).status, 400);
  assert.equal((await f.run("/api/layers/save", { document: canvasDoc([{ ...textLayer(), kind: "image", url: "/generated/other/private.png" }]) })).status, 400);
  f.store.saveImage = async () => { throw new Error("Storage failed"); };
  assert.equal((await f.run("/api/layers/decompose")).status, 502);
  assert.equal(f.cost, 0); assert.equal(f.activeUserJobs.size, 0); assert.equal((f.original as any).layerDocument, undefined);
});

test("browser canvas undo/delete and rotated pixel hit testing operate on individual elements", async () => {
  const script = await fs.readFile(path.resolve(import.meta.dirname, "../public/app.js"), "utf8");
  const context = vm.createContext({}); vm.runInContext(script, context);
  context.fixture = canvasDoc([textLayer(), { ...textLayer(), id: "locked", locked: true }, { ...textLayer(), id: "image", kind: "image", url: "/generated/test/a.png" }]);
  const result = JSON.parse(vm.runInContext(`JSON.stringify((() => {
    renderLayerEditor = () => {};
    layerEditor = { document: fixture, selected: 'text-1', busy: false, past: [], future: [] };
    deleteCanvasElement(); const deleted = layerEditor.document.layers.length; canvasUndo(); const restored = layerEditor.document.layers.length;
    editorImages.set('/generated/test/a.png', { image: { naturalWidth: 1, naturalHeight: 1 }, pixels: [255,255,255,0] });
    const hit = hitCanvasElement(layerEditor.document, 20,20)?.id;
    editorImages.set('/generated/test/a.png', { image: { naturalWidth: 1, naturalHeight: 1 }, pixels: [255,255,255,255] });
    const opaqueHit = hitCanvasElement(layerEditor.document,20,20)?.id;
    const rotated = canvasLocalPoint({ ...fixture.layers[0], rotation: 90 }, 60,30);
    return { deleted, restored, hit, opaqueHit, rotated };
  })())`, context));
  assert.equal(result.deleted, 2); assert.equal(result.restored, 3); assert.equal(result.hit, "text-1"); assert.equal(result.opaqueHit, "image");
  assert.deepEqual(result.rotated, { x: 50, y: 20 });
});
