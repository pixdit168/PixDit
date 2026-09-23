import fs from "node:fs/promises";
import sharp from "sharp";

const DEFAULT_API_BASE = "https://api.9router.com";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function getSize(format = "") {
  const value = String(format).toLowerCase();
  if (value.includes("9:16")) return "1024x1792";
  if (value.includes("16:9")) return "1792x1024";
  if (value.includes("1:1") || value.includes("persegi")) return "1024x1024";
  if (value.includes("3:4")) return "1024x1365";
  return "1024x1280";
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\s]+)$/i);
  return match ? Buffer.from(match[2].replace(/\s/g, ""), "base64") : null;
}

async function normalizeImage(buffer, outputQuality) {
  if (!buffer?.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("Ukuran file hasil 9Router tidak valid.");
  const normalized = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .jpeg({ quality: outputQuality, mozjpeg: true })
    .toBuffer();
  return { buffer: normalized, extension: "jpg", mimeType: "image/jpeg" };
}

async function readError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.detail || data.error?.message || data.error || data.message || `9Router merespons HTTP ${response.status}.`;
  } catch {
    return text.slice(0, 500) || `9Router merespons HTTP ${response.status}.`;
  }
}

export class NineRouterImageProvider {
  constructor(options = {}) {
    this.name = "9router";
    this.token = String(
      options.token ||
      process.env.NINEROUTER_API_KEY ||
      process.env.NINEROUTER_KEY ||
      ""
    ).trim();

    this.model = String(
      options.model ??
      process.env.NINEROUTER_IMAGE_MODEL ??
      ""
    ).trim();

    this.apiBase = String(
      options.apiBase ||
      process.env.NINEROUTER_URL ||
      DEFAULT_API_BASE
    )
      .trim()
      .replace(/\/+$/, "");
    this.timeoutMs = clampInteger(options.timeoutMs || process.env.NINEROUTER_TIMEOUT_MS, 30_000, 900_000, 300_000);
    this.outputQuality = clampInteger(options.outputQuality || process.env.NINEROUTER_OUTPUT_QUALITY, 1, 100, 90);
    this.fetch = options.fetchImpl || globalThis.fetch;
  }

  get configured() {
    return Boolean(this.token.trim() && this.model.trim() && this.apiBase);
  }

  get missingConfiguration() {
    const missing = [];
    if (!this.token.trim()) missing.push("NINEROUTER_API_KEY");
    if (!this.model.trim()) missing.push("NINEROUTER_IMAGE_MODEL");
    if (!this.apiBase) missing.push("NINEROUTER_URL");
    return missing;
  }

  get endpoint() {
    const versionedBase =
    /\/v1$/i.test(this.apiBase)
      ? this.apiBase
      : `${this.apiBase}/v1`;

    return `${versionedBase}/images/generations`;
  }

  async prepareReferenceImage(sourcePath) {
    const original = await fs.readFile(sourcePath);
    const metadata = await sharp(original, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Dimensi gambar sumber tidak dapat dibaca.");
    const scale = Math.min(1, Math.sqrt(1_000_000 / (metadata.width * metadata.height)));
    const width = Math.max(256, Math.round(metadata.width * scale));
    const buffer = await sharp(original, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width, withoutEnlargement: true, fit: "inside" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 76, mozjpeg: true })
      .toBuffer();
    if (buffer.length > 1_000_000) throw new Error("Gambar sumber tidak dapat diperkecil ke batas aman 9Router.");
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  async downloadUrl(value, signal) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error("9Router tidak mengembalikan URL gambar yang valid."); }
    if (parsed.protocol !== "https:") throw new Error("URL hasil 9Router harus menggunakan HTTPS.");
    const response = await this.fetch(parsed, { signal, redirect: "follow" });
    if (!response.ok) throw new Error(`File hasil 9Router gagal diunduh (HTTP ${response.status}).`);
    const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error("File hasil 9Router melebihi batas 25 MB.");
    return Buffer.from(await response.arrayBuffer());
  }

  async extractImage(response, signal) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("image/")) return Buffer.from(await response.arrayBuffer());
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error("9Router tidak mengembalikan data gambar yang valid."); }
    const output = data?.data?.[0] || data?.output?.[0] || data?.output || data;
    const inline = parseDataUrl(output?.b64_json || output?.data || output);
    if (inline) return inline;
    const base64 = String(output?.b64_json || "").replace(/\s/g, "");
    if (base64) return Buffer.from(base64, "base64");
    const url = output?.url || output?.uri || output?.href;
    if (url) return this.downloadUrl(url, signal);
    throw new Error("9Router tidak mengembalikan gambar pada respons API.");
  }

  async run({ prompt, format, sourcePath = "", signal }) {
    if (!this.configured) {
      throw new Error(`Konfigurasi provider gratis belum lengkap: ${this.missingConfiguration.join(", ")}.`);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("9Router melewati batas waktu pemrosesan.")), this.timeoutMs);
    const abort = () => controller.abort(signal?.reason || new Error("Permintaan dibatalkan."));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const body = {
        model: this.model,
        prompt,
        n: 1,
        size: getSize(format),
        response_format: "b64_json",
      };
      if (sourcePath) body.image = await this.prepareReferenceImage(sourcePath);
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "image/png, image/jpeg, application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await readError(response));
      return normalizeImage(await this.extractImage(response, controller.signal), this.outputQuality);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}
