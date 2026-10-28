import type {
  DesignAsset,
  DesignDocument,
  DesignRecord,
  DesignVersion,
} from "../shared/design-document";
export type EditorOptions = {
  csrfToken: string;
  designId: string;
  onSaved?: (result: { designId: string; version: DesignVersion }) => void;
  onUsage?: (usage: unknown) => void;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  token: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    signal,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      data.message || "Permintaan desain gagal.",
    );
  return data;
}
export const loadDesign = (id: string, token: string) =>
  api<{ design: DesignRecord }>(`/api/designs/${id}`, token);
export async function uploadAsset(
  file: File,
  token: string,
): Promise<DesignAsset> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 10_000_000
  )
    throw new Error("Gunakan PNG/JPG/WebP maksimal 10 MB.");
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  let dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > 3_000_000 && file.type !== "image/png")
    dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  if (dataUrl.length > 3_000_000)
    throw new Error("Gambar terlalu besar. Gunakan gambar yang lebih kecil.");
  return (
    await api<{ asset: DesignAsset }>("/api/design-assets", token, "POST", {
      dataUrl,
    })
  ).asset;
}
export async function saveVersion(
  id: string,
  revision: number,
  token: string,
  document: DesignDocument,
  initial = false,
) {
  const { renderPreview } = await import("./preview");
  const preview = await renderPreview(document, true);
  return api<{ version: DesignVersion }>(
    `/api/designs/${id}/${initial ? "preview" : "versions"}`,
    token,
    "POST",
    { expectedRevision: revision, preview },
  );
}
