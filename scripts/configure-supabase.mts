import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "");
const projectRef = String(process.env.SUPABASE_PROJECT_REF || "");
if (!accessToken || !projectRef) throw new Error("SUPABASE_ACCESS_TOKEN dan SUPABASE_PROJECT_REF wajib diberikan untuk konfigurasi awal.");

const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

async function managementRequest(pathname, options: RequestInit = {}) {
  const response = await fetch(`https://api.supabase.com${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; }
  catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === "object" ? data?.message || data?.error || data?.detail : data;
    throw new Error(`Supabase Management API ${response.status}: ${String(detail || "request gagal").slice(0, 300)}`);
  }
  return data;
}

const schema = await fs.readFile(path.join(projectRoot, "supabase", "schema.sql"), "utf8");
await managementRequest(`/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
  method: "POST",
  body: JSON.stringify({ query: schema }),
});

const keys = await managementRequest(`/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`);
const publishable = keys.find((key) => key.type === "publishable")?.api_key;
const secret = keys.find((key) => key.type === "secret")?.api_key;
if (!publishable || !secret) throw new Error("Publishable key atau secret key Supabase tidak ditemukan.");

const envPath = path.join(projectRoot, ".env");
let envText = "";
try { envText = await fs.readFile(envPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
const lines = envText ? envText.split(/\r?\n/) : [];
function setEnv(name, value) {
  const line = `${name}=${value}`;
  const index = lines.findIndex((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
}
setEnv("SUPABASE_URL", `https://${projectRef}.supabase.co`);
setEnv("SUPABASE_PUBLISHABLE_KEY", publishable);
setEnv("SUPABASE_SECRET_KEY", secret);
await fs.writeFile(envPath, `${lines.filter((line, index) => line || index < lines.length - 1).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });

console.log("Schema Supabase dan runtime environment Layera berhasil dikonfigurasi.");
