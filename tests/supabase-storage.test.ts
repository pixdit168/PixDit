import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseStore, normalizeStore } from "../lib/supabase.js";

test("SupabaseStore creates a private bucket and stores images per user", async () => {
  const objects = new Map();
  let bucketExists = false;
  let createdOptions = null;
  const client = {
    storage: {
      async getBucket(name) {
        return bucketExists
          ? { data: { id: name }, error: null }
          : { data: null, error: { status: 404, message: "not found" } };
      },
      async createBucket(_name, options) {
        bucketExists = true;
        createdOptions = options;
        return { data: {}, error: null };
      },
      from(bucket) {
        assert.equal(bucket, "test-images");
        return {
          async upload(objectPath, buffer, options) {
            objects.set(objectPath, { buffer: Buffer.from(buffer), type: options.contentType });
            return { data: { path: objectPath }, error: null };
          },
          async download(objectPath) {
            const object = objects.get(objectPath);
            if (!object) return { data: null, error: { status: 404 } };
            return { data: new Blob([object.buffer], { type: object.type }), error: null };
          },
        };
      },
    },
  };
  const store = new SupabaseStore(client, normalizeStore({}), "test-images");
  await store.ensureImageBucket();
  assert.equal(createdOptions.public, false);

  const input = Buffer.from("image-bytes");
  await store.saveImage("job/concept-01.jpg", "user-1", input, "image/jpeg");
  assert.ok(objects.has("user-1/job/concept-01.jpg"));
  const image = await store.getImage("job/concept-01.jpg", "user-1");
  assert.deepEqual(image.buffer, input);
  assert.equal(image.mimeType, "image/jpeg");
  assert.equal(image.userId, "user-1");
  assert.equal(await store.getImage("job/concept-01.jpg", "user-2"), null);
});
