// Optional local UI harness: node --import ./tests/editor-browser-fixture.js app-backend.js
// Never used by production or npm start. Blocks all unexpected external requests.
import sharp from "sharp";
if (process.env.NODE_ENV !== "test") throw new Error("The browser fixture requires NODE_ENV=test");
const realFetch = globalThis.fetch;
const width = 800, height = 1000;
const background = await sharp({ create: { width, height, channels: 4, background: "#222c49" } }).png().toBuffer();
const product = await sharp(Buffer.from(`<svg width="800" height="1000"><rect x="235" y="350" width="330" height="440" rx="50" fill="#d99c47"/><rect x="255" y="330" width="290" height="40" rx="12" fill="#f2ddaf"/><circle cx="400" cy="520" r="80" fill="#60342b"/></svg>`)).png().toBuffer();
const headline = await sharp(Buffer.from(`<svg width="800" height="1000"><text x="80" y="155" font-family="Arial" font-size="58" font-weight="bold" fill="white">PROMO KOPI</text><text x="80" y="220" font-family="Arial" font-size="30" fill="#d2d6eb">Satu ide, banyak cerita.</text></svg>`)).png().toBuffer();
const source = await sharp(background).composite([{ input: product }, { input: headline }]).jpeg().toBuffer();
const outputs = new Map([["source.jpg", source], ["background.png", background], ["product.png", product], ["headline.png", headline]]);
let next = 0;
const jobs = new Map<string, string[]>();
globalThis.fetch = (async (url, options) => {
  const parsed = new URL(String(url));
  if (parsed.hostname === "api.replicate.com") {
    if (parsed.pathname.endsWith("/cancel")) return Response.json({ status: "canceled" });
    if (options?.method === "POST") {
      const layers = parsed.pathname.includes("qwen-image-layered");
      const id = `fixture-${++next}`;
      jobs.set(id, (layers ? ["background.png", "product.png", "headline.png"] : ["source.jpg"]).map(file => `https://replicate.delivery/pixgin-fixture/${file}`));
      return Response.json({ id, status: "processing" });
    }
    return Response.json({ id: parsed.pathname.split("/").pop(), status: "succeeded", output: jobs.get(parsed.pathname.split("/").pop()) });
  }
  if (parsed.hostname === "replicate.delivery") {
    const bytes = outputs.get(parsed.pathname.split("/").pop());
    if (!bytes) throw new Error("Unknown fixture asset");
    return new Response(bytes, { headers: { "Content-Type": parsed.pathname.endsWith(".jpg") ? "image/jpeg" : "image/png" } });
  }
  if (["127.0.0.1", "localhost"].includes(parsed.hostname)) return realFetch(url, options);
  throw new Error(`External request blocked by isolated browser fixture: ${parsed.hostname}`);
}) as typeof fetch;
