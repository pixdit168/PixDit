import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { ReplicateImageProvider } from "./replicate.js";

export const LAYER_CREDIT_COST = 3;
const MAX_PIXELS = 8_000_000;
const fail = (message: string) => { throw new Error(message); };
const finite = (value: any, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const rasterBytes = (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
const imageData = (value: string) => {
  const match = String(value).match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || value.length > 3_000_000) fail("Gunakan gambar PNG, JPG, atau WebP berukuran aman.");
  const bytes = Buffer.from(match[2], "base64");
  if (!rasterBytes(bytes)) fail("File harus benar-benar berupa PNG, JPG, atau WebP, bukan SVG atau dokumen.");
  return bytes;
};

// Keep only known fields. URLs are checked against the account's private files.
export function normalizeCanvasDocument(input: any, ownsUrl: (url: string) => boolean) {
  if (!input || input.version !== 1 || !Number.isInteger(input.width) || !Number.isInteger(input.height) || !finite(input.width, 64, 4096) || !finite(input.height, 64, 4096) || input.width * input.height > MAX_PIXELS) fail("Ukuran kanvas tidak valid.");
  if (!Array.isArray(input.layers) || input.layers.length > 32) fail("Maksimal 32 elemen per kanvas.");
  const ids = new Set();
  const layers = input.layers.map((layer: any) => {
    if (!layer || typeof layer.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id) || ids.has(layer.id)) fail("ID elemen tidak valid atau duplikat.");
    ids.add(layer.id);
    if (!["image", "text"].includes(layer.kind) || !finite(layer.x, -input.width, input.width * 2) || !finite(layer.y, -input.height, input.height * 2) || !finite(layer.width, 1, input.width * 3) || !finite(layer.height, 1, input.height * 3) || !finite(layer.rotation ?? 0, -360, 360) || !finite(layer.opacity ?? 1, 0, 1)) fail("Posisi atau ukuran elemen tidak valid.");
    const common = { id: layer.id, kind: layer.kind, name: String(layer.name || "Elemen").slice(0, 80), x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: layer.rotation ?? 0, opacity: layer.opacity ?? 1, visible: layer.visible !== false, locked: layer.locked === true };
    if (layer.kind === "text") {
      if (!finite(layer.fontSize, 8, 600) || !/^#[a-fA-F0-9]{6}$/.test(layer.color || "")) fail("Format teks tidak valid.");
      return { ...common, text: String(layer.text || "").slice(0, 2000), fontSize: layer.fontSize, color: layer.color, fontFamily: ["Arial", "Georgia", "Verdana"].includes(layer.fontFamily) ? layer.fontFamily : "Arial", bold: layer.bold === true, align: ["left", "center", "right"].includes(layer.align) ? layer.align : "left" };
    }
    const url = String(layer.url || "");
    if (url.startsWith("data:")) imageData(url);
    else if (!ownsUrl(url)) fail("Gambar elemen tidak ditemukan untuk akun ini.");
    return { ...common, url };
  });
  const grading = input.grading ?? [];
  if (!Array.isArray(grading) || grading.length > 12 || grading.some(grade => !finite(grade?.brightness, 50, 150) || !finite(grade?.contrast, 50, 150) || !finite(grade?.saturation, 0, 200) || !finite(grade?.warmth, -100, 100))) fail("Pengaturan warna kanvas tidak valid.");
  return { version: 1, width: input.width, height: input.height, layers, grading: grading.map(grade => ({ brightness: grade.brightness, contrast: grade.contrast, saturation: grade.saturation, warmth: grade.warmth })) };
}

async function boundedDownload(provider: ReplicateImageProvider, url: string, signal: AbortSignal) {
  let target = url, response: Response;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || !(parsed.hostname === "replicate.delivery" || parsed.hostname.endsWith(".replicate.delivery"))) fail("Domain output layer tidak dikenali.");
    response = await provider.fetch(target, { signal, redirect: "manual", headers: { Authorization: `Bearer ${provider.token}` } });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirects === 3) fail("Redirect layer tidak valid.");
    target = new URL(location, target).href;
  }
  if (!response.ok || Number(response.headers.get("content-length")) > 25_000_000) fail("Layer tidak dapat diunduh atau terlalu besar.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body!.getReader();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 25_000_000) fail("Layer melebihi batas ukuran.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks);
  if (!rasterBytes(bytes)) fail("Output layer bukan format gambar raster yang didukung.");
  return bytes;
}

export class ReplicateLayerProvider extends ReplicateImageProvider {
  async decompose(source: Buffer, count: number, signal: AbortSignal) {
    if (!this.configured) fail("REPLICATE_API_TOKEN belum diatur.");
    const metadata = await sharp(source, { limitInputPixels: MAX_PIXELS }).metadata();
    const width = metadata.width!, height = metadata.height!;
    if (!width || !height || width * height > MAX_PIXELS) fail("Gambar sumber terlalu besar.");
    const image = await this.prepareReferenceImage(`data:image/png;base64,${source.toString("base64")}`);
    let prediction: any;
    try {
      prediction = await this.requestJson(this.endpoint, { method: "POST", signal, headers: { "Content-Type": "application/json", "Cancel-After": "10m" }, body: JSON.stringify({ input: { image, num_layers: count, description: "auto", go_fast: true, output_format: "png", disable_safety_checker: false } }) });
      const deadline = Date.now() + this.timeoutMs;
      // Unlike one-image generation, partial output is not a completed layer set.
      while (!["succeeded", "failed", "canceled", "cancelled"].includes(prediction.status)) {
        if (Date.now() >= deadline) fail("Pemisahan layer melewati batas waktu.");
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason);
          const done = () => { signal.removeEventListener("abort", abort); resolve(); };
          const timer = setTimeout(done, this.pollIntervalMs);
          const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
          signal.addEventListener("abort", abort, { once: true });
        });
        prediction = await this.requestJson(`${this.apiBase}/predictions/${encodeURIComponent(prediction.id)}`, { signal });
      }
      if (prediction.status !== "succeeded" || !Array.isArray(prediction.output) || prediction.output.length < 2 || prediction.output.length > 8) fail("AI belum menghasilkan layer yang valid.");
      const layers: any[] = [];
      for (const url of prediction.output) {
        const bytes = await boundedDownload(this, url, signal);
        const normalized = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
        let left = width, top = height, right = -1, bottom = -1, transparent = false;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const alpha = normalized[(y * width + x) * 4 + 3];
          if (alpha < 250) transparent = true;
          if (alpha > 8) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
        }
        if (right < left) continue;
        const layerWidth = right - left + 1, layerHeight = bottom - top + 1;
        const buffer = await sharp(normalized, { raw: { width, height, channels: 4 } }).extract({ left, top, width: layerWidth, height: layerHeight }).png().toBuffer();
        layers.push({ buffer, x: left, y: top, width: layerWidth, height: layerHeight, transparent });
      }
      if (layers.length < 2 || !layers.some(layer => layer.transparent)) fail("AI tidak menghasilkan elemen transparan yang terpisah. Original tetap aman; coba lagi atau gunakan Edit salinan.");
      return { width, height, layers };
    } catch (error) {
      if (prediction?.id) await this.cancelPrediction(prediction).catch(() => {});
      throw error;
    }
  }
}

export async function handleLayerEditor(pathname: string, request: any, response: any, input: any, ctx: any) {
  const { store, auth, provider, activeUserJobs, sendJson, creditAllowed, quotaExceeded, addUsageEvent, getUsageStatus } = ctx;
  const userId = auth.user.id;
  const ownsUrl = (url: string) => /^\/generated\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$/.test(url) && store.data.generatedFiles[url]?.userId === userId;
  const findVersion = () => {
    const item = store.data.users[userId]?.state?.library?.find((entry: any) => entry.id === input.itemId);
    const version = item?.versions?.find((entry: any) => entry.id === input.baseVersionId);
    return { item, version };
  };
  const { item, version } = findVersion();
  if (!item || !version || !ownsUrl(version.url)) return sendJson(response, 404, { error: "source_not_found", message: "Versi sumber tidak ditemukan untuk akun ini." });
  if (activeUserJobs.has(userId)) return sendJson(response, 409, { error: "generation_in_progress", message: "Tunggu proses gambar sebelumnya selesai." });
  if (pathname.endsWith("decompose") && (version.canvasDocument || version.layerDocument)) {
    try { return sendJson(response, 200, { document: normalizeCanvasDocument(version.canvasDocument || version.layerDocument, ownsUrl), usage: getUsageStatus(userId) }); }
    catch { return sendJson(response, 400, { error: "invalid_canvas", message: "Layer tersimpan tidak valid untuk akun ini." }); }
  }
  if (pathname.endsWith("decompose") && !provider.configured) return sendJson(response, 503, { error: "provider_not_configured", message: "Atur REPLICATE_API_TOKEN untuk pemisahan elemen AI." });
  if (pathname.endsWith("decompose") && !creditAllowed(userId, "refine", LAYER_CREDIT_COST).allowed) return quotaExceeded(response, userId, "refine", LAYER_CREDIT_COST);
  const controller = new AbortController();
  const abort = () => { if (!response.writableEnded) controller.abort(new Error("Pemisahan dibatalkan.")); };
  response.on("close", abort);
  activeUserJobs.add(userId);
  const job = `canvas-${randomUUID().replace(/-/g, "")}`;
  const saveImage = async (buffer: Buffer, filename: string, mime = "image/png") => {
    const id = `${job}/${filename}`, url = `/generated/${id}`;
    await store.saveImage(id, userId, buffer, mime);
    await store.mutate((data: any) => { data.generatedFiles[url] = { userId, createdAt: new Date().toISOString() }; });
    return url;
  };
  try {
    if (pathname.endsWith("decompose")) {
      const count = input.count ?? 6;
      if (!Number.isInteger(count) || count < 2 || count > 8) return sendJson(response, 400, { error: "invalid_layer_count", message: "Pilih 2-8 layer." });
      const source = await store.getImage(version.url.slice("/generated/".length), userId);
      if (!source) fail("File sumber tidak ditemukan di Supabase.");
      let sourceBuffer = source.buffer;
      if (input.composedSource) {
        const composed = imageData(String(input.composedSource));
        const [originalSize, composedSize] = await Promise.all([sharp(sourceBuffer, { limitInputPixels: MAX_PIXELS }).metadata(), sharp(composed, { limitInputPixels: MAX_PIXELS }).metadata()]);
        if (originalSize.width !== composedSize.width || originalSize.height !== composedSize.height) fail("Ukuran komposisi lama tidak cocok dengan sumber.");
        sourceBuffer = composed;
      }
      const result = await provider.decompose(sourceBuffer, count, controller.signal);
      const layers = [];
      for (const [index, layer] of result.layers.entries()) {
        if (controller.signal.aborted) throw controller.signal.reason;
        layers.push({ id: `layer-${index}`, kind: "image", name: index === 0 ? "Latar" : `Elemen ${index}`, url: await saveImage(layer.buffer, `layer-${index}.png`), x: layer.x, y: layer.y, width: layer.width, height: layer.height, rotation: 0, opacity: 1, visible: true, locked: index === 0 });
      }
      const document = { version: 1, width: result.width, height: result.height, layers };
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!findVersion().version) fail("Desain sudah dihapus dari Koleksi.");
      await store.mutate(() => { findVersion().version.layerDocument = document; });
      await addUsageEvent(userId, "refine", LAYER_CREDIT_COST);
      return sendJson(response, 200, { document, usage: getUsageStatus(userId) });
    }
    let document;
    try { document = normalizeCanvasDocument(input.document, ownsUrl); }
    catch (error) { return sendJson(response, 400, { error: "invalid_canvas", message: error.message }); }
    const previewBytes = imageData(String(input.preview || ""));
    const metadata = await sharp(previewBytes, { limitInputPixels: MAX_PIXELS }).metadata();
    if (metadata.width !== document.width || metadata.height !== document.height) fail("Ukuran preview tidak sama dengan kanvas.");
    for (const [index, layer] of document.layers.entries()) {
      if (layer.kind === "image" && layer.url.startsWith("data:")) {
        const buffer = await sharp(imageData(layer.url), { limitInputPixels: MAX_PIXELS }).rotate().png().toBuffer();
        layer.url = await saveImage(buffer, `upload-${index}.png`);
      }
    }
    const transparent = metadata.hasAlpha === true;
    const buffer = transparent ? await sharp(previewBytes).png().toBuffer() : await sharp(previewBytes).jpeg({ quality: 92 }).toBuffer();
    const url = await saveImage(buffer, transparent ? "concept-01.png" : "concept-01.jpg", transparent ? "image/png" : "image/jpeg");
    const edited = { id: `${job}-v`, url, canvasDocument: document, compositionMode: "ai", refinement: "Edit elemen kanvas", createdAt: new Date().toISOString(), immutable: false, colorGrade: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 } };
    if (!findVersion().version) fail("Desain sudah dihapus dari Koleksi.");
    await store.mutate(() => { const latest = findVersion().item; latest.versions.push(edited); latest.currentVersionId = edited.id; });
    return sendJson(response, 200, { version: edited, usage: getUsageStatus(userId) });
  } catch (error) {
    if (!response.destroyed) return sendJson(response, 502, { error: "layer_edit_failed", message: /401|unauthorized|unauthenticated/i.test(String(error.message)) ? "Token Replicate tidak valid. Periksa REPLICATE_API_TOKEN di environment server." : "Editor belum dapat memproses gambar. Original tidak berubah. Periksa konfigurasi provider, ukuran gambar, dan coba lagi." });
  } finally {
    response.off("close", abort);
    activeUserJobs.delete(userId);
  }
}
