import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  baseObject,
  designReducer,
  mapObjects,
  normalizeDesign,
  type DesignDocument,
} from "../shared/design-document.js";
import { DesignRepository } from "../lib/design-store.js";
import { MemoryStore } from "../lib/supabase.js";

const empty = (): DesignDocument => ({
  schemaVersion: 1,
  width: 640,
  height: 800,
  background: "#201832",
  objects: [],
  assets: {},
});
test("native edits move one logo and change text without duplicating other elements", () => {
  const original = empty();
  original.objects = [
    {
      ...baseObject("logo", "image", "Logo", 400, 20, 100, 100),
      assetId: randomUUID(),
    },
    {
      ...baseObject("p1", "image", "Produk 1", 50, 200, 200, 400),
      assetId: randomUUID(),
    },
    {
      ...baseObject("p2", "image", "Produk 2", 300, 200, 200, 400),
      assetId: randomUUID(),
    },
    {
      ...baseObject("headline", "text", "Headline", 40, 50, 400, 100),
      text: "Kopi Asli",
      fontSize: 40,
      color: "#ffffff",
    },
  ];
  let state = { document: original, past: [], future: [] };
  state = designReducer(state, {
    type: "commit",
    document: {
      ...original,
      objects: mapObjects(original.objects, (node) =>
        node.id === "logo"
          ? { ...node, x: 300 }
          : node.id === "headline"
            ? { ...node, text: "Harga Rp 12.000 — pesan sekarang!" }
            : node,
      ),
    },
  });
  assert.equal(
    state.document.objects.filter((node) => node.id === "logo").length,
    1,
  );
  assert.equal(state.document.objects[0].x, 300);
  assert.deepEqual(
    state.document.objects.slice(1, 3),
    original.objects.slice(1, 3),
  );
  assert.equal(
    state.document.objects[3].text,
    "Harga Rp 12.000 — pesan sekarang!",
  );
  assert.equal(state.past.length, 1);
  state = designReducer(state, { type: "undo" });
  assert.deepEqual(state.document, original);
  state = designReducer(state, { type: "redo" });
  assert.equal(state.document.objects[0].x, 300);
});

test("document validation bounds resource use and strips untrusted asset URLs", () => {
  const document = empty(),
    assetId = randomUUID();
  document.objects = [
    { ...baseObject("img", "image", "Image", 0, 0, 100, 100), assetId },
  ];
  document.assets[assetId] = {
    id: assetId,
    url: "https://untrusted.test/image",
    width: 100,
    height: 100,
  };
  assert.deepEqual(normalizeDesign(document).assets, {});
  for (const invalid of [
    { ...document, schemaVersion: 2 },
    { ...document, width: 9000 },
    { ...document, objects: [...document.objects, ...document.objects] },
    { ...document, objects: [{ ...document.objects[0], x: NaN }] },
  ])
    assert.throws(() => normalizeDesign(invalid));
});

test("repository keeps originals immutable, checks ownership and rejects stale saves", async () => {
  const repo = new DesignRepository(new MemoryStore(), true);
  const owner = randomUUID(),
    stranger = randomUUID();
  const asset = await repo.saveAsset(
    owner,
    Buffer.from("test bytes"),
    640,
    800,
    "image/png",
  );
  const document = empty();
  document.objects = [
    {
      ...baseObject("logo", "image", "Logo", 0, 0, 100, 100),
      assetId: asset.id,
    },
  ];
  const created = await repo.create(owner, document, "Test");
  assert.equal(await repo.get(stranger, created.id), null);
  await assert.rejects(() => repo.create(stranger, document), /Aset/);
  const edited = structuredClone(created.document);
  edited.objects[0].x = 250;
  const saved = await repo.save(owner, created.id, 1, edited);
  assert.equal(saved.revision, 2);
  await assert.rejects(() => repo.save(owner, created.id, 1, document), {
    statusCode: 409,
  });
  const v2 = await repo.version(owner, created.id, 2, asset.id);
  const versions = await repo.listVersions(owner, created.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].document.objects[0].x, 0);
  assert.equal(v2.document.objects[0].x, 250);
  const nextAsset = await repo.saveAsset(
    owner,
    Buffer.from("different"),
    640,
    800,
    "image/png",
  );
  assert.equal(
    (await repo.version(owner, created.id, 2, nextAsset.id)).previewUrl,
    v2.previewUrl,
  );
  const reopened = await repo.get(owner, created.id);
  assert.equal(
    reopened.document.assets[asset.id].url,
    `/api/design-assets/${asset.id}`,
  );
  assert.equal(await repo.listVersions(stranger, created.id), null);
});

test("competing saves have exactly one winner and failed storage keeps the previous revision", async () => {
  const repo = new DesignRepository(new MemoryStore(), true),
    owner = randomUUID();
  const created = await repo.create(owner, empty());
  const results = await Promise.allSettled([
    repo.save(owner, created.id, 1, empty()),
    repo.save(owner, created.id, 1, empty()),
  ]);
  assert.equal(
    results.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (
      results.find(
        (value) => value.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.statusCode,
    409,
  );
  repo.appStore.saveImage = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    () => repo.saveAsset(owner, Buffer.from("test"), 2, 2, "image/png"),
    /offline/,
  );
  assert.equal((await repo.get(owner, created.id)).revision, 2);
  assert.equal(repo.assets.size, 0);
});

test("missing design schema or network failure does not break the rest of the website", async () => {
  for (const rpc of [
    async () => ({ data: null, error: { code: "PGRST202" } }),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const repo = new DesignRepository({ client: { rpc } });
    assert.equal(await repo.ready(), false);
    await assert.rejects(() => repo.requireReady(), { statusCode: 503 });
  }
});
