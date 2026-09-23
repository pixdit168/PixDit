import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env"));

const url = String(process.env.SUPABASE_URL || "");
const secretKey = String(process.env.SUPABASE_SECRET_KEY || "");
const bucket = String(process.env.SUPABASE_IMAGE_BUCKET || "layera-generated");
if (!url || !secretKey) throw new Error("SUPABASE_URL dan SUPABASE_SECRET_KEY wajib diatur.");

const client = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const objectPath = `_health-check/${Date.now()}-${randomUUID()}.png`;
const expected = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let uploaded = false;

try {
  const { data: bucketData, error: bucketError } = await client.storage.getBucket(bucket);
  if (bucketError || !bucketData) throw new Error(`Bucket ${bucket} tidak dapat dibaca: ${bucketError?.message || "tidak ditemukan"}`);
  if (bucketData.public) throw new Error(`Bucket ${bucket} harus bersifat private.`);

  const { error: uploadError } = await client.storage.from(bucket).upload(objectPath, expected, {
    contentType: "image/png",
    cacheControl: "60",
    upsert: false,
  });
  if (uploadError) throw new Error(`Upload tes gagal: ${uploadError.message}`);
  uploaded = true;

  const { data: downloaded, error: downloadError } = await client.storage.from(bucket).download(objectPath);
  if (downloadError || !downloaded) throw new Error(`Download tes gagal: ${downloadError?.message || "file kosong"}`);
  const actual = Buffer.from(await downloaded.arrayBuffer());
  if (!actual.equals(expected)) throw new Error("Byte gambar hasil download tidak sama dengan file yang diunggah.");

  console.log(`VERIFIED: bucket privat '${bucket}' berhasil upload dan download gambar tanpa perubahan.`);
} finally {
  if (uploaded) {
    const { error: removeError } = await client.storage.from(bucket).remove([objectPath]);
    if (removeError) console.warn(`PERINGATAN: file tes ${objectPath} tidak dapat dihapus: ${removeError.message}`);
    else console.log("CLEANUP: file tes berhasil dihapus.");
  }
}
