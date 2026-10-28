import sharp from "sharp";
import {
  UUID,
  baseObject,
  normalizeDesign,
} from "../shared/design-document.js";
import { normalizeAsset, rasterData } from "./design-ai.js";
import { randomUUID } from "node:crypto";

export async function handleDesignApi(
  pathname: string,
  request: any,
  response: any,
  ctx: any,
) {
  const {
    repository,
    auth,
    appStore,
    sendJson,
    readJsonBody,
    securityHeaders,
    removalProvider,
    activeUserJobs,
    creditAllowed,
    quotaExceeded,
    addUsageEvent,
    getUsageStatus,
  } = ctx;
  const owner = auth.user.id;
  if (request.method === "GET" && pathname === "/api/designs/status")
    return sendJson(response, 200, { available: await repository.ready() });
  await repository.requireReady();
  const assetMatch = pathname.match(
    /^\/api\/design-assets\/([^/]+)(?:\/(info|remove-background))?$/,
  );
  if (assetMatch) {
    if (!UUID.test(assetMatch[1]))
      return sendJson(response, 404, { error: "not_found" });
    const asset = await repository.asset(owner, assetMatch[1]);
    if (!asset) return sendJson(response, 404, { error: "not_found" });
    if (request.method === "GET" && assetMatch[2] === "info")
      return sendJson(response, 200, { asset: repository.descriptor(asset) });
    const image = await appStore.getImage(asset.object_path, owner);
    if (!image) return sendJson(response, 404, { error: "not_found" });
    if (["GET", "HEAD"].includes(request.method) && !assetMatch[2]) {
      response.writeHead(200, {
        ...securityHeaders,
        "Content-Type": image.mimeType,
        "Content-Length": image.buffer.length,
        "Cache-Control": "private, no-store",
      });
      return request.method === "HEAD"
        ? response.end()
        : response.end(image.buffer);
    }
    if (request.method === "POST" && assetMatch[2] === "remove-background") {
      if (!removalProvider.configured)
        return sendJson(response, 503, {
          message: "Atur token Replicate untuk hapus latar.",
        });
      if (activeUserJobs.has(owner))
        return sendJson(response, 409, {
          message: "Tunggu proses AI sebelumnya selesai.",
        });
      if (!creditAllowed(owner, "refine", 3).allowed)
        return quotaExceeded(response, owner, "refine", 3);
      const controller = new AbortController();
      const abort = () => {
        if (!response.writableEnded) controller.abort();
      };
      response.on("close", abort);
      activeUserJobs.add(owner);
      try {
        const result = await removalProvider.removeBackground(
          image.buffer,
          controller.signal,
        );
        if ((await sharp(result.buffer).stats()).isOpaque)
          throw new Error(
            "Provider belum menghasilkan latar transparan. Original tidak berubah.",
          );
        if (controller.signal.aborted) throw controller.signal.reason;
        const removed = await repository.saveAsset(
          owner,
          result.buffer,
          result.width,
          result.height,
          result.mime,
          asset.original_asset_id || asset.id,
        );
        await addUsageEvent(owner, "refine", 3);
        return sendJson(response, 200, {
          asset: removed,
          usage: getUsageStatus(owner),
        });
      } catch {
        if (!response.destroyed)
          return sendJson(response, 502, {
            message:
              "Hapus latar gagal. Original dan kredit aplikasi tetap aman; periksa konfigurasi provider.",
          });
      } finally {
        response.off("close", abort);
        activeUserJobs.delete(owner);
      }
    }
    return sendJson(response, 405, { error: "method_not_allowed" });
  }
  if (request.method === "POST" && pathname === "/api/design-assets") {
    const input = await readJsonBody(request);
    const normalized = await normalizeAsset(rasterData(input.dataUrl));
    const asset = await repository.saveAsset(
      owner,
      normalized.buffer,
      normalized.width,
      normalized.height,
      normalized.mime,
    );
    return sendJson(response, 201, { asset });
  }
  if (request.method === "POST" && pathname === "/api/designs") {
    const input = await readJsonBody(request);
    let document = normalizeDesign(
      input.document || {
        schemaVersion: 1,
        width: 1080,
        height: 1350,
        background: "#211838",
        objects: [],
      },
    );
    if (input.sourceUrl) {
      const url = String(input.sourceUrl);
      if (
        !/^\/generated\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp)$/.test(
          url,
        ) ||
        appStore.data.generatedFiles[url]?.userId !== owner
      )
        return sendJson(response, 404, {
          message: "Gambar sumber tidak ditemukan untuk akun ini.",
        });
      const source = await appStore.getImage(
        url.slice("/generated/".length),
        owner,
      );
      if (!source) return sendJson(response, 404, { error: "not_found" });
      const normalized = await normalizeAsset(
        input.sourcePreview ? rasterData(input.sourcePreview) : source.buffer,
      );
      if (input.sourcePreview) {
        const original = await sharp(source.buffer).metadata();
        if (
          original.width !== normalized.width ||
          original.height !== normalized.height
        )
          return sendJson(response, 400, {
            message: "Ukuran komposisi sumber tidak cocok.",
          });
      }
      const asset = await repository.saveAsset(
        owner,
        normalized.buffer,
        normalized.width,
        normalized.height,
        normalized.mime,
      );
      document = {
        schemaVersion: 1,
        width: normalized.width,
        height: normalized.height,
        background: "#ffffff",
        assets: { [asset.id]: asset },
        objects: [
          {
            ...baseObject(
              randomUUID(),
              "image",
              "Poster lama (gambar utuh)",
              0,
              0,
              normalized.width,
              normalized.height,
            ),
            assetId: asset.id,
            fit: "contain",
            locked: true,
          },
        ],
      };
    }
    return sendJson(response, 201, {
      design: await repository.create(owner, document, input.title),
    });
  }
  const designMatch = pathname.match(
    /^\/api\/designs\/([^/]+)(?:\/(versions|preview))?$/,
  );
  if (!designMatch || !UUID.test(designMatch[1]))
    return sendJson(response, 404, { error: "not_found" });
  const id = designMatch[1],
    action = designMatch[2];
  const current = await repository.get(owner, id);
  if (!current) return sendJson(response, 404, { error: "not_found" });
  if (request.method === "GET")
    return sendJson(
      response,
      200,
      action === "versions"
        ? { versions: await repository.listVersions(owner, id) }
        : { design: current },
    );
  const input = await readJsonBody(request);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  )
    return sendJson(response, 400, { message: "Revisi desain wajib diisi." });
  if (request.method === "PATCH" && !action) {
    const design = await repository.save(
      owner,
      id,
      input.expectedRevision,
      input.document,
    );
    return sendJson(
      response,
      design ? 200 : 404,
      design ? { design } : { error: "not_found" },
    );
  }
  if (request.method === "POST" && ["versions", "preview"].includes(action)) {
    if (current.revision !== input.expectedRevision)
      return sendJson(response, 409, {
        message: "Revisi berbeda. Muat ulang desain atau simpan salinan.",
      });
    const preview = await normalizeAsset(rasterData(input.preview));
    if (
      preview.width !== current.document.width ||
      preview.height !== current.document.height
    )
      return sendJson(response, 400, {
        message: "Preview tidak sesuai ukuran artboard.",
      });
    const asset = await repository.saveAsset(
      owner,
      preview.buffer,
      preview.width,
      preview.height,
      preview.mime,
    );
    const version = await repository.version(
      owner,
      id,
      input.expectedRevision,
      asset.id,
      action === "preview",
    );
    return sendJson(response, 200, { version });
  }
  return sendJson(response, 405, { error: "method_not_allowed" });
}
