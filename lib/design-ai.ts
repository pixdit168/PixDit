import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { ReplicateImageProvider } from "./replicate.js";
import {
  baseObject,
  isColor,
  normalizeDesign,
  type DesignAsset,
  type DesignDocument,
  type DesignObject,
} from "../shared/design-document.js";

export function rasterData(value: string) {
  const match = String(value).match(
    /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i,
  );
  if (!match || value.length > 3_300_000)
    throw new Error("Gunakan PNG, JPG, atau WebP berukuran aman.");
  const bytes = Buffer.from(match[2], "base64");
  if (!isRaster(bytes))
    throw new Error(
      "File bukan gambar raster yang valid (SVG tidak didukung).",
    );
  return bytes;
}
export const isRaster = (buffer: Buffer) =>
  buffer
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
  (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ||
  (buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP");
export async function normalizeAsset(buffer: Buffer) {
  if (!isRaster(buffer) || buffer.length > 8_000_000)
    throw new Error("Aset terlalu besar atau formatnya tidak didukung.");
  const meta = await sharp(buffer, { limitInputPixels: 16_000_000 }).metadata();
  if (
    !meta.width ||
    !meta.height ||
    meta.width > 8192 ||
    meta.height > 8192 ||
    (meta.pages && meta.pages > 1)
  )
    throw new Error("Dimensi aset tidak valid.");
  return {
    buffer,
    width: meta.width,
    height: meta.height,
    mime:
      meta.format === "jpeg"
        ? "image/jpeg"
        : meta.format === "webp"
          ? "image/webp"
          : "image/png",
  };
}

// Local composition avoids a second, billable planner prediction before each image.
// Only text supplied by the user is added; never invent prices or product claims.
export function planDesignLocally(brief: string, productCount: number, wording?: Record<string, string>) {
  if (!Number.isInteger(productCount) || productCount < 0 || productCount > 5)
    throw new Error("Jumlah gambar produk tidak valid.");
  const columns = Math.min(3, Math.max(1, productCount));
  const rows = Math.ceil(productCount / columns);
  const cellWidth = 0.84 / columns;
  const cellHeight = 0.48 / Math.max(1, rows);
  const quoted = Array.from(brief.matchAll(/["\u201c]([^"\u201d]{2,2000})["\u201d]/g), match => match[1]).join("\n");
  return validateLayout(JSON.stringify({
    backgroundPrompt: brief,
    background: "#211838",
    color: "#ffffff",
    texts: ["brand", "headline", "body", "cta"]
      .filter(role => (wording && Object.hasOwn(wording, role)) || (role === "headline" && quoted))
      .map(role => ({
        role,
        text: wording?.[role] ?? quoted,
        x: 0.07,
        y: { brand: 0.04, headline: 0.14, body: 0.74, cta: 0.88 }[role],
        width: role === "brand" || role === "headline" ? 0.6 : 0.86,
        height: role === "headline" ? 0.18 : 0.08,
        size: role === "headline" ? 0.055 : 0.025,
      })),
    products: Array.from({ length: productCount }, (_, index) => ({
      x: 0.08 + (index % columns) * cellWidth,
      y: 0.32 + Math.floor(index / columns) * cellHeight,
      width: cellWidth - 0.02,
      height: cellHeight - 0.02,
    })),
    logo: { x: 0.8, y: 0.05, width: 0.15, height: 0.12 },
    decorations: [],
  }), productCount, wording);
}

export class DesignAI extends ReplicateImageProvider {
  async predict(input: any, outerSignal?: AbortSignal) {
    if (!this.configured) throw new Error("REPLICATE_API_TOKEN belum diatur.");
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = outerSignal
      ? AbortSignal.any([outerSignal, timeout])
      : timeout;
    let prediction: any;
    try {
      prediction = await this.requestJson(this.endpoint, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "Cancel-After": "10m" },
        body: JSON.stringify({ input }),
      });
      while (
        !["succeeded", "failed", "canceled", "cancelled"].includes(
          prediction.status,
        )
      ) {
        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason);
          const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            reject(signal.reason);
          };
          const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, this.pollIntervalMs);
          signal.addEventListener("abort", abort, { once: true });
        });
        prediction = await this.requestJson(
          `${this.apiBase}/predictions/${encodeURIComponent(prediction.id)}`,
          { signal },
        );
      }
      if (prediction.status !== "succeeded")
        throw new Error("Provider gagal menyelesaikan pemrosesan desain.");
      return prediction.output;
    } catch (error) {
      if (prediction?.id)
        await this.cancelPrediction(prediction).catch(() => {});
      throw error;
    }
  }
  async downloadRaster(url: string, signal?: AbortSignal) {
    let target = url,
      response: Response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const parsed = new URL(target);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        (parsed.port && parsed.port !== "443") ||
        !(
          parsed.hostname === "replicate.delivery" ||
          parsed.hostname.endsWith(".replicate.delivery")
        )
      )
        throw new Error("URL output provider tidak diizinkan.");
      response = await this.fetch(target, {
        signal,
        redirect: "manual",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3)
        throw new Error("Redirect output tidak valid.");
      target = new URL(location, target).href;
    }
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 25_000_000
    )
      throw new Error("Output tidak dapat diunduh.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body!.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 25_000_000) throw new Error("Output terlalu besar.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = Buffer.concat(chunks);
    if (!isRaster(bytes))
      throw new Error("Provider tidak mengembalikan gambar raster.");
    return bytes;
  }
  async removeBackground(bytes: Buffer, signal?: AbortSignal) {
    const reference = await this.prepareLogoReferenceImage(
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    const output = await this.predict(
      { image: reference, preserve_alpha: true, content_moderation: true },
      signal,
    );
    const url =
      typeof output === "string"
        ? output
        : Array.isArray(output)
          ? output[0]
          : "";
    const raster = await this.downloadRaster(url, signal);
    const buffer = await sharp(raster, { limitInputPixels: 16_000_000 })
      .ensureAlpha()
      .png()
      .toBuffer();
    await normalizeAsset(buffer);
    const meta = await sharp(buffer).metadata();
    return {
      buffer,
      width: meta.width!,
      height: meta.height!,
      mime: "image/png",
    };
  }
}
export function validateLayout(
  raw: string,
  productCount: number,
  wording?: Record<string, string>,
) {
  if (raw.length > 30_000) throw new Error("Rencana AI terlalu besar.");
  let plan: any;
  try {
    plan = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw new Error(
      "Planner tidak mengembalikan JSON valid. Tidak ada gambar yang ditagih; coba lagi.",
    );
  }
  const box = (value: any) => {
    if (
      !value ||
      !["x", "y", "width", "height"].every(
        (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
      ) ||
      value.x < 0 ||
      value.y < 0 ||
      value.width < 0.02 ||
      value.height < 0.02 ||
      value.x + value.width > 1.001 ||
      value.y + value.height > 1.001
    )
      throw new Error("Layout AI di luar kanvas.");
    return { x: value.x, y: value.y, width: value.width, height: value.height };
  };
  if (
    !plan ||
    typeof plan.backgroundPrompt !== "string" ||
    plan.backgroundPrompt.length < 10 ||
    plan.backgroundPrompt.length > 3000 ||
    !isColor(plan.background) ||
    !isColor(plan.color) ||
    !Array.isArray(plan.products) ||
    plan.products.length !== productCount ||
    !Array.isArray(plan.texts) ||
    plan.texts.length > 8 ||
    !Array.isArray(plan.decorations) ||
    plan.decorations.length > 12
  )
    throw new Error("Rencana komposisi AI tidak valid.");
  const seen = new Set<string>();
  const texts = plan.texts.map((value: any) => {
    if (
      !["brand", "headline", "body", "cta"].includes(value.role) ||
      seen.has(value.role) ||
      typeof value.text !== "string" ||
      value.text.length > 2000 ||
      typeof value.size !== "number" ||
      value.size < 0.01 ||
      value.size > 0.2
    )
      throw new Error("Instruksi teks AI tidak valid.");
    seen.add(value.role);
    return {
      role: value.role,
      text:
        wording && Object.hasOwn(wording, value.role)
          ? wording[value.role]
          : value.text,
      size: value.size,
      ...box(value),
    };
  });
  // The model may omit a role. Explicit nonblank wording must still appear verbatim.
  for (const role of ["brand", "headline", "body", "cta"])
    if (wording && Object.hasOwn(wording, role) && !seen.has(role))
      texts.push({
        role,
        text: wording[role],
        size: role === "headline" ? 0.055 : 0.025,
        x: 0.07,
        y: { brand: 0.04, headline: 0.14, body: 0.74, cta: 0.88 }[role],
        width: 0.86,
        height: role === "headline" ? 0.18 : 0.08,
      });
  return {
    backgroundPrompt: plan.backgroundPrompt,
    background: plan.background,
    color: plan.color,
    texts,
    products: plan.products.map(box),
    logo: box(plan.logo || { x: 0.8, y: 0.05, width: 0.13, height: 0.13 }),
    decorations: plan.decorations.map((value: any) => {
      if (
        !["rect", "ellipse", "star"].includes(value.shape) ||
        !isColor(value.fill)
      )
        throw new Error("Dekorasi AI tidak valid.");
      return { ...box(value), shape: value.shape, fill: value.fill };
    }),
  };
}
export function composeDesign(
  layout: ReturnType<typeof validateLayout>,
  width: number,
  height: number,
  background: DesignAsset,
  products: DesignAsset[],
  logo?: DesignAsset,
): DesignDocument {
  const objects: DesignObject[] = [
    {
      ...baseObject(randomUUID(), "image", "Latar AI", 0, 0, width, height),
      assetId: background.id,
      fit: "cover" as const,
      locked: true,
    },
  ];
  for (const shape of layout.decorations)
    objects.push({
      ...baseObject(
        randomUUID(),
        "shape",
        "Dekorasi",
        shape.x * width,
        shape.y * height,
        shape.width * width,
        shape.height * height,
      ),
      shape: shape.shape,
      fill: shape.fill,
    } as any);
  for (const [index, asset] of products.entries()) {
    const box = layout.products[index];
    objects.push({
      ...baseObject(
        randomUUID(),
        "image",
        `Produk ${index + 1}`,
        box.x * width,
        box.y * height,
        box.width * width,
        box.height * height,
      ),
      assetId: asset.id,
      fit: "contain",
    });
  }
  if (logo) {
    const box = layout.logo;
    objects.push({
      ...baseObject(
        randomUUID(),
        "image",
        "Logo",
        box.x * width,
        box.y * height,
        box.width * width,
        box.height * height,
      ),
      assetId: logo.id,
      fit: "contain",
    });
  }
  for (const text of layout.texts)
    if (text.text !== "")
      objects.push({
        ...baseObject(
          randomUUID(),
          "text",
          text.role,
          text.x * width,
          text.y * height,
          text.width * width,
          text.height * height,
        ),
        text: text.text,
        fontSize: Math.max(8, width * text.size),
        fontFamily: "Arial",
        color: layout.color,
        bold: text.role !== "body",
        align: "left",
      } as any);
  const document = normalizeDesign({
    schemaVersion: 1,
    width,
    height,
    background: layout.background,
    objects,
  });
  document.assets = Object.fromEntries(
    [background, ...products, ...(logo ? [logo] : [])].map((asset) => [
      asset.id,
      asset,
    ]),
  );
  return document;
}
