// Local test-only preload. Never sends requests to Replicate or Supabase.
import sharp from "sharp";
if (process.env.NODE_ENV !== "test")
  throw new Error("The mocked provider is only for NODE_ENV=test.");
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
  if (url.pathname.includes("meta-llama")) {
    const count = Number(
      String(args.prompt).match(/Supply exactly (\d+) product/)?.[1] || 0,
    );
    const plan = {
      backgroundPrompt:
        "Purple studio with negative space for product and copy",
      background: "#211838",
      color: "#ffffff",
      texts: [
        {
          role: "headline",
          text: "Rasa kopi pilihan",
          x: 0.08,
          y: 0.08,
          width: 0.7,
          height: 0.18,
          size: 0.055,
        },
      ],
      products: Array.from({ length: count }, (_, i) => ({
        x: 0.08 + (i % 3) * 0.28,
        y: 0.3 + Math.floor(i / 3) * 0.28,
        width: 0.26,
        height: 0.26,
      })),
      logo: { x: 0.8, y: 0.05, width: 0.15, height: 0.12 },
      decorations: [
        {
          shape: "rect",
          x: 0.05,
          y: 0.9,
          width: 0.9,
          height: 0.05,
          fill: "#8060aa",
        },
      ],
    };
    return Response.json({
      id: "mock-plan",
      status: "succeeded",
      output: [JSON.stringify(plan)],
    });
  }
  return Response.json({
    id: "mock-image",
    status: "succeeded",
    output: url.pathname.includes("remove-background")
      ? "https://replicate.delivery/removed.png"
      : "https://replicate.delivery/background.png",
  });
};
