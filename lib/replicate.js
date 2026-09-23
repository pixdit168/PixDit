import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_MODEL = "black-forest-labs/flux-2-pro";
const DEFAULT_API_BASE = "https://api.replicate.com/v1";
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled", "cancelled"]);

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error("Permintaan dibatalkan."));
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("Permintaan dibatalkan."));
    }, { once: true });
  });
}

function getAspectRatio(format = "") {
  const value = String(format).toLowerCase();
  if (value.includes("9:16")) return "9:16";
  if (value.includes("1:1") || value.includes("persegi")) return "1:1";
  if (value.includes("16:9")) return "16:9";
  if (value.includes("3:4")) return "3:4";
  return "4:5";
}

function getResolution(quality = "1mp") {
  return ({ "1mp": "1 MP", "2mp": "2 MP", "4mp": "4 MP" })[String(quality).toLowerCase()] || "1 MP";
}

function getOutputUrl(output) {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return getOutputUrl(output[0]);
  if (output && typeof output === "object") {
    return output.url || output.uri || output.href || "";
  }
  return "";
}

function assertReplicateOutputUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Replicate tidak mengembalikan URL gambar yang valid."); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (host !== "replicate.delivery" && !host.endsWith(".replicate.delivery"))) {
    throw new Error("Domain file output Replicate tidak dikenali.");
  }
  return parsed;
}

async function readApiError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.detail || data.error || data.message || `Replicate merespons HTTP ${response.status}.`;
  } catch {
    return text.slice(0, 500) || `Replicate merespons HTTP ${response.status}.`;
  }
}

export class ReplicateImageProvider {
  constructor(options = {}) {
    this.token = options.token || process.env.REPLICATE_API_TOKEN || "";
    this.model = options.model || process.env.REPLICATE_MODEL || DEFAULT_MODEL;
    this.apiBase = (options.apiBase || process.env.REPLICATE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = clampInteger(options.timeoutMs || process.env.REPLICATE_TIMEOUT_MS, 30_000, 900_000, 300_000);
    this.pollIntervalMs = clampInteger(options.pollIntervalMs, 1, 30_000, 1_500);
    this.safetyTolerance = clampInteger(process.env.REPLICATE_SAFETY_TOLERANCE, 1, 5, 2);
    this.outputQuality = clampInteger(process.env.REPLICATE_OUTPUT_QUALITY, 1, 100, 90);
    this.fetch = options.fetchImpl || globalThis.fetch;
    if (!/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(this.model)) {
      throw new Error("REPLICATE_MODEL harus berbentuk owner/model, contoh black-forest-labs/flux-2-pro.");
    }
  }

  get configured() {
    return Boolean(this.token.trim());
  }

  get endpoint() {
    const [owner, name] = this.model.split("/");
    return `${this.apiBase}/models/${encodeURIComponent(owner || "black-forest-labs")}/${encodeURIComponent(name || "flux-2-pro")}/predictions`;
  }

  async requestJson(url, options = {}) {
    const response = await this.fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json();
  }

  async waitForPrediction(prediction, signal) {
    const deadline = Date.now() + this.timeoutMs;
    let current = prediction;
    while (!getOutputUrl(current.output) && !TERMINAL_STATUSES.has(String(current.status).toLowerCase())) {
      if (Date.now() >= deadline) throw new Error("Flux 2 Pro melewati batas waktu pemrosesan.");
      await delay(this.pollIntervalMs, signal);
      const statusUrl = current.urls?.get || `${this.apiBase}/predictions/${encodeURIComponent(current.id)}`;
      current = await this.requestJson(statusUrl, { method: "GET", signal });
    }
    if (String(current.status).toLowerCase() !== "succeeded" && !getOutputUrl(current.output)) {
      const detail = typeof current.error === "string" ? current.error : current.error?.message;
      throw new Error(detail || `Prediction Flux 2 Pro berakhir dengan status ${current.status || "tidak diketahui"}.`);
    }
    return current;
  }

  async downloadOutput(output, signal) {
    let outputUrl = assertReplicateOutputUrl(getOutputUrl(output));
    let response;
    for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
      response = await this.fetch(outputUrl, { signal, redirect: "manual" });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) throw new Error("Redirect file output Replicate tidak valid.");
      outputUrl = assertReplicateOutputUrl(new URL(location, outputUrl).href);
    }
    if (!response.ok) throw new Error(`File hasil Replicate gagal diunduh (HTTP ${response.status}).`);
    const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > 25 * 1024 * 1024) throw new Error("File hasil Replicate melebihi batas 25 MB.");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 25 * 1024 * 1024) throw new Error("Ukuran file hasil Replicate tidak valid.");
    const normalized = await sharp(buffer).rotate().jpeg({ quality: this.outputQuality, mozjpeg: true }).toBuffer();
    return { buffer: normalized, extension: "jpg", mimeType: "image/jpeg" };
  }

  async prepareReferenceImage(sourcePath) {
    const metadata = await sharp(sourcePath, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Dimensi gambar sumber tidak dapat dibaca.");
    const targetPixels = 1_000_000;
    const scale = Math.min(1, Math.sqrt(targetPixels / (metadata.width * metadata.height)));
    const width = Math.max(256, Math.round(metadata.width * scale));
    const qualities = [86, 76, 66, 56];
    let buffer = null;
    for (const quality of qualities) {
      buffer = await sharp(sourcePath, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true, fit: "inside" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (buffer.length <= 900_000) break;
    }
    if (!buffer || buffer.length > 950_000) {
      buffer = await sharp(sourcePath, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: Math.min(width, 896), withoutEnlargement: true, fit: "inside" })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 52, mozjpeg: true })
        .toBuffer();
    }
    if (buffer.length > 1_000_000) throw new Error("Gambar sumber tidak dapat diperkecil ke batas aman Replicate.");
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  async run({ prompt, format, quality, sourcePath = "", signal }) {
    if (!this.configured) throw new Error("REPLICATE_API_TOKEN belum diatur pada environment server Node.js.");
    const input = {
      prompt,
      resolution: getResolution(quality),
      aspect_ratio: getAspectRatio(format),
      input_images: [],
      output_format: "jpg",
      output_quality: this.outputQuality,
      safety_tolerance: this.safetyTolerance,
      seed: Math.floor(Math.random() * 2_147_483_647),
    };
    if (sourcePath) input.input_images = [await this.prepareReferenceImage(sourcePath)];

    const prediction = await this.requestJson(this.endpoint, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Prefer: "wait=60",
        "Cancel-After": "5m",
      },
      body: JSON.stringify({ input }),
    });
    const completed = getOutputUrl(prediction.output) ? prediction : await this.waitForPrediction(prediction, signal);
    return this.downloadOutput(completed.output, signal);
  }
}

