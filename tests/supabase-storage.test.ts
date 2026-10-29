import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseStore, normalizeStore } from "../lib/supabase.js";

function sharedStateDatabase() {
  let row = { payload: normalizeStore({users:{owner:{id:"owner",state:{projects:[],library:[],initialized:true}}}}), updated_at:"2026-01-01T00:00:00.000Z" };
  const database = {
    failWrite: false,
    conflicts: 0,
    client: {
      from(name:string) {
        assert.equal(name,"layera_app_store");
        let operation="read", value:any;
        const filters=new Map<string,any>();
        const query={
          select(_columns:string) { return query; },
          eq(key:string,expected:any) { filters.set(key,expected);return query; },
          update(input:any) { operation="update";value=input;return query; },
          insert(input:any) { operation="insert";value=input;return query; },
          async maybeSingle() {
            if(operation==="read")return {data:structuredClone(row),error:null};
            if(database.failWrite)return {data:null,error:{message:"Database unavailable"}};
            if(operation==="insert")return {data:null,error:{code:"23505"}};
            if(filters.get("updated_at")!==row.updated_at) { database.conflicts++;return {data:null,error:null}; }
            row=structuredClone(value);
            return {data:{updated_at:row.updated_at},error:null};
          },
        };
        return query;
      },
    },
    state:()=>structuredClone(row.payload),
  };
  const instance=()=>new SupabaseStore(database.client,normalizeStore(structuredClone(database.state())));
  return {...database,instance,failNextWrites:()=>{database.failWrite=true;},conflictCount:()=>database.conflicts};
}

test("a stale instance cannot erase saved Koleksi when it writes a session or usage event",async()=>{
  const database=sharedStateDatabase(),first=database.instance(),stale=database.instance();
  const library=[{id:"saved-poster",versions:[{id:"original",url:"/generated/job/variation-01.png"}]}];
  await first.mutate(data=>{data.users.owner.state.library=library;});
  await stale.mutate(data=>{data.sessions.token={userId:"owner"};data.usageEvents.push({id:"usage"});});
  assert.deepEqual(database.state().users.owner.state.library,library);
  const afterRestart=database.instance();
  await afterRestart.refresh();
  assert.deepEqual(afterRestart.data.users.owner.state.library,library);
  assert.equal(afterRestart.data.usageEvents.length,1);
});

test("competing instances reapply only their own mutations after a conditional-write conflict",async()=>{
  const database=sharedStateDatabase(),first=database.instance(),second=database.instance();
  await Promise.all([
    first.mutate(data=>{data.users.owner.state.library.push({id:"poster"});}),
    second.mutate(data=>{data.sessions.newSession={userId:"owner"};}),
  ]);
  assert.equal(database.state().users.owner.state.library.length,1);
  assert.equal(database.state().sessions.newSession.userId,"owner");
  assert.ok(database.conflictCount()>=1);
});

test("refresh sees a session created or revoked by another instance before private image authorization",async()=>{
  const database=sharedStateDatabase(),first=database.instance(),second=database.instance();
  await first.mutate(data=>{data.sessions.token={userId:"owner"};});
  await second.refresh();
  assert.equal(second.data.sessions.token.userId,"owner");
  await first.mutate(data=>{delete data.sessions.token;});
  await second.refresh();
  assert.equal(second.data.sessions.token,undefined);
});

test("failed account writes preserve the last acknowledged snapshot and never claim local edits were saved",async()=>{
  const database=sharedStateDatabase(),store=database.instance();
  database.failNextWrites();
  await assert.rejects(store.mutate(data=>{data.users.owner.state.library.push({id:"unsaved"});}),/Database unavailable/);
  assert.equal(store.data.users.owner.state.library.length,0);
  assert.equal(database.state().users.owner.state.library.length,0);
});

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
