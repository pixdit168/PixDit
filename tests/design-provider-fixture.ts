// Local test-only preload. Never sends requests to Replicate or Supabase.
import sharp from "sharp";
import { MemoryStore } from "../lib/supabase.js";
if (process.env.NODE_ENV !== "test")
  throw new Error("The mocked provider is only for NODE_ENV=test.");
// Seed past usage only for the isolated quota contract tests; never touch live data.
if (process.env.PIXGIN_USAGE_FIXTURE === "1") {
  const mutate = MemoryStore.prototype.mutate;
  const seeded = new Set<string>();
  MemoryStore.prototype.mutate = async function (this: MemoryStore, mutator) {
    const result = await mutate.call(this, mutator);
    for (const user of Object.values(this.data.users)) {
      if (seeded.has(user.id)) continue;
      seeded.add(user.id);
      if (["pro-quota@example.test", "pro-exhausted@example.test"].includes(user.email)) {
        user.plan = "premium";
        this.data.usageEvents.push({ userId:user.id, eventType:"generate", creditCost:240, createdAt:(user.email === "pro-quota@example.test" ? new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),0)) : new Date()).toISOString() });
      } else if (user.email === "free-quota@example.test") {
        for (const eventType of ["generate", "refine", "refine", "refine"])
          this.data.usageEvents.push({ userId:user.id, eventType, creditCost:eventType === "generate" ? 2 : 3, createdAt:new Date(Date.now()-8*24*60*60*1000).toISOString() });
      }
    }
    return result;
  };
}
const originalFetch = globalThis.fetch;
const background = await sharp({
  create: { width: 640, height: 800, channels: 3, background: "#44305d" },
})
  .png()
  .toBuffer();
const transparent = await sharp({
  create: { width: 100, height: 100, channels: 4, background: "#ca9aff00" },
})
  .composite([
    {
      input: await sharp({
        create: { width: 60, height: 60, channels: 4, background: "#ca9aff" },
      })
        .png()
        .toBuffer(),
      left: 20,
      top: 20,
    },
  ])
  .png()
  .toBuffer();
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  if (["localhost", "127.0.0.1"].includes(url.hostname))
    return originalFetch(input, init);
  if (url.hostname === "replicate.delivery")
    return new Response(
      url.pathname.includes("removed") ? transparent : background,
      { headers: { "Content-Type": "image/png" } },
    );
  if (url.hostname !== "api.replicate.com")
    throw new Error(`Unexpected external host in test: ${url.hostname}`);
  if (url.pathname.endsWith("/cancel"))
    return Response.json({ status: "canceled" });
  const body = JSON.parse(String(init?.body || "{}")),
    args = body.input || {};
  console.log(
    JSON.stringify({
      fixture: true,
      path: url.pathname,
      hasReferences: Boolean(
        args.input_images?.length ||
          args.reference_images?.length ||
          args.images?.length,
      ),
      prompt: String(args.prompt || "").slice(0, 200),
    }),
  );
  if (url.pathname.includes("meta-llama"))
    throw new Error("Generation must not create an additional planner prediction.");
  return Response.json({
    id: "mock-image",
    status: "succeeded",
    output: url.pathname.includes("remove-background")
      ? "https://replicate.delivery/removed.png"
      : "https://replicate.delivery/background.png",
  });
};
