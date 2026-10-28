import { randomUUID } from "node:crypto";
import {
  assetIds,
  normalizeDesign,
  type DesignAsset,
  type DesignDocument,
} from "../shared/design-document.js";

export class DesignConflict extends Error {
  statusCode = 409;
  constructor() {
    super(
      "Desain telah berubah di sesi lain. Muat versi server atau simpan salinan; perubahan lokal belum dibuang.",
    );
  }
}
export class DesignSetupError extends Error {
  statusCode = 503;
  constructor() {
    super(
      "Editor memerlukan migrasi Supabase: jalankan supabase/designs.sql terlebih dahulu. Mode poster utuh tetap tersedia.",
    );
  }
}
type AssetRow = {
  id: string;
  user_id: string;
  object_path: string;
  width: number;
  height: number;
  original_asset_id?: string;
};
export class DesignRepository {
  memory: boolean;
  appStore: any;
  rows = new Map<string, any>();
  assets = new Map<string, AssetRow>();
  versions = new Map<string, any[]>();
  lastProbe = 0;
  available = false;
  constructor(appStore: any, memory = false) {
    this.appStore = appStore;
    this.memory = memory;
  }
  async ready() {
    if (this.memory) return true;
    if (!this.appStore?.client) return false;
    if (Date.now() - this.lastProbe < 15_000) return this.available;
    try {
      const { data, error } = await this.appStore.client.rpc(
        "pixgin_design_schema_version",
      );
      this.available = !error && data === 1;
    } catch {
      this.available = false;
    }
    this.lastProbe = Date.now();
    return this.available;
  }
  async requireReady() {
    if (!(await this.ready())) throw new DesignSetupError();
  }
  descriptor(row: AssetRow): DesignAsset {
    return {
      id: row.id,
      url: `/api/design-assets/${row.id}`,
      width: row.width,
      height: row.height,
      ...(row.original_asset_id
        ? { originalAssetId: row.original_asset_id }
        : {}),
    };
  }
  async asset(owner: string, id: string) {
    if (this.memory) {
      const row = this.assets.get(id);
      return row?.user_id === owner ? row : null;
    }
    const { data, error } = await this.appStore.client
      .from("pixgin_design_assets")
      .select("*")
      .eq("id", id)
      .eq("user_id", owner)
      .maybeSingle();
    if (error) throw new Error("Aset desain tidak dapat dibaca.");
    return data;
  }
  async saveAsset(
    owner: string,
    buffer: Buffer,
    width: number,
    height: number,
    mime: string,
    original?: string,
  ) {
    await this.requireReady();
    const id = randomUUID(),
      extension =
        mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const row = {
      id,
      user_id: owner,
      object_path: `design-assets/${id}.${extension}`,
      width,
      height,
      original_asset_id: original || null,
    };
    await this.appStore.saveImage(row.object_path, owner, buffer, mime);
    if (this.memory) this.assets.set(id, row);
    else {
      const { error } = await this.appStore.client
        .from("pixgin_design_assets")
        .insert(row);
      if (error) throw new Error("Aset desain belum dapat disimpan.");
    }
    return this.descriptor(row);
  }
  async hydrate(owner: string, document: any) {
    const normalized = normalizeDesign(document);
    for (const id of assetIds(normalized)) {
      const row = await this.asset(owner, id);
      if (!row) throw new Error("Aset tidak ditemukan untuk akun ini.");
      normalized.assets[id] = this.descriptor(row);
    }
    return normalized;
  }
  async record(owner: string, row: any) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      revision: Number(row.revision),
      document: await this.hydrate(owner, row.document),
      updatedAt: row.updated_at,
    };
  }
  async get(owner: string, id: string) {
    await this.requireReady();
    if (this.memory) {
      const row = this.rows.get(id);
      return row?.user_id === owner ? this.record(owner, row) : null;
    }
    const { data, error } = await this.appStore.client
      .from("pixgin_designs")
      .select("*")
      .eq("id", id)
      .eq("user_id", owner)
      .maybeSingle();
    if (error) throw new Error("Desain tidak dapat dibaca.");
    return this.record(owner, data);
  }
  async create(owner: string, document: DesignDocument, title = "Desain") {
    await this.requireReady();
    const normalized = await this.hydrate(owner, document);
    const row = {
      id: randomUUID(),
      user_id: owner,
      title: String(title).slice(0, 100),
      document: normalized,
      revision: 1,
      updated_at: new Date().toISOString(),
    };
    if (this.memory) {
      this.rows.set(row.id, structuredClone(row));
      this.versions.set(row.id, [
        {
          id: randomUUID(),
          design_id: row.id,
          number: 1,
          revision: 1,
          document: structuredClone(normalized),
          original: true,
          created_at: row.updated_at,
        },
      ]);
    } else {
      const { error } = await this.appStore.client.rpc("pixgin_create_design", {
        p_id: row.id,
        p_owner: owner,
        p_title: row.title,
        p_document: normalized,
      });
      if (error)
        throw new Error(
          "Desain belum dapat disimpan. Periksa migrasi Supabase.",
        );
    }
    return this.record(owner, row);
  }
  async save(
    owner: string,
    id: string,
    expectedRevision: number,
    document: any,
  ) {
    const normalized = await this.hydrate(owner, document);
    if (this.memory) {
      const row = this.rows.get(id);
      if (!row || row.user_id !== owner) return null;
      if (row.revision !== expectedRevision) throw new DesignConflict();
      row.document = structuredClone(normalized);
      row.revision++;
      row.updated_at = new Date().toISOString();
      return this.record(owner, row);
    }
    const { data, error } = await this.appStore.client
      .from("pixgin_designs")
      .update({
        document: normalized,
        revision: expectedRevision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", owner)
      .eq("revision", expectedRevision)
      .select()
      .maybeSingle();
    if (error) throw new Error("Draf gagal disimpan. Coba lagi.");
    if (!data) {
      if (!(await this.get(owner, id))) return null;
      throw new DesignConflict();
    }
    return this.record(owner, data);
  }
  async listVersions(owner: string, id: string) {
    if (!(await this.get(owner, id))) return null;
    let rows;
    if (this.memory) rows = this.versions.get(id) || [];
    else {
      const result = await this.appStore.client
        .from("pixgin_design_versions")
        .select("*")
        .eq("design_id", id)
        .eq("user_id", owner)
        .order("number", { ascending: true });
      if (result.error) throw new Error("Versi tidak dapat dibaca.");
      rows = result.data;
    }
    return Promise.all(
      rows.map(async (row: any) => ({
        id: row.id,
        number: row.number,
        revision: Number(row.revision),
        original: row.original,
        createdAt: row.created_at,
        document: await this.hydrate(owner, row.document),
        ...(row.preview_asset_id
          ? { previewUrl: `/api/design-assets/${row.preview_asset_id}` }
          : {}),
      })),
    );
  }
  async version(
    owner: string,
    id: string,
    expectedRevision: number,
    previewAssetId: string,
    initial = false,
  ) {
    const design = await this.get(owner, id);
    if (!design) return null;
    if (design.revision !== expectedRevision) throw new DesignConflict();
    if (!(await this.asset(owner, previewAssetId)))
      throw new Error("Preview tidak ditemukan.");
    if (this.memory) {
      if (this.rows.get(id)?.revision !== expectedRevision)
        throw new DesignConflict();
      const rows = this.versions.get(id)!;
      let row = rows.find((version) => version.revision === expectedRevision);
      if (initial && expectedRevision !== 1) throw new DesignConflict();
      if (row) {
        if (!row.preview_asset_id) row.preview_asset_id = previewAssetId;
      } else {
        row = {
          id: randomUUID(),
          design_id: id,
          number: rows.length + 1,
          revision: expectedRevision,
          document: structuredClone(design.document),
          original: false,
          preview_asset_id: previewAssetId,
          created_at: new Date().toISOString(),
        };
        rows.push(row);
      }
    } else {
      const { error } = await this.appStore.client.rpc(
        "pixgin_save_design_version",
        {
          p_id: id,
          p_owner: owner,
          p_revision: expectedRevision,
          p_preview: previewAssetId,
          p_initial: initial,
        },
      );
      if (error?.code === "40001") throw new DesignConflict();
      if (error) throw new Error("Versi gagal disimpan.");
    }
    return (await this.listVersions(owner, id))!.find(
      (version) => version.revision === expectedRevision,
    )!;
  }
}
