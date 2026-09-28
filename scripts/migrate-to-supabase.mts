import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SupabaseAuth, SupabaseStore, normalizeStore } from "../lib/supabase.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

function parsePasswordMap() {
  const raw = String(process.env.MIGRATION_USER_PASSWORDS_JSON || "").trim();
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("MIGRATION_USER_PASSWORDS_JSON harus berupa JSON object yang valid."); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("MIGRATION_USER_PASSWORDS_JSON harus berupa JSON object.");
  return Object.fromEntries(Object.entries(parsed).map(([email, password]) => [email.toLowerCase(), String(password)]));
}

function remapStore(source, idMap) {
  const data = normalizeStore(structuredClone(source));
  const users = {};
  for (const user of Object.values(data.users)) {
    const nextId = idMap.get(user.id);
    if (!nextId) continue;
    const cleanUser = { ...user, id: nextId, email: String(user.email || "").toLowerCase() };
    delete cleanUser.passwordHash;
    delete cleanUser.passwordSalt;
    delete cleanUser.passwordIterations;
    users[nextId] = cleanUser;
  }
  const remapUserId = (record) => {
    const userId = idMap.get(record.userId);
    return userId ? { ...record, userId } : null;
  };
  data.users = users;
  data.sessions = {};
  data.usageEvents = data.usageEvents.map(remapUserId).filter(Boolean);
  data.signupSignals = data.signupSignals.map(remapUserId).filter(Boolean);
  data.generatedFiles = Object.fromEntries(Object.entries(data.generatedFiles)
    .map(([url, record]) => [url, remapUserId(record)])
    .filter(([, record]) => record));
  data.accountBrands = Object.fromEntries(Object.entries(data.accountBrands)
    .map(([oldId, record]) => [idMap.get(oldId), record])
    .filter(([newId]) => newId));
  return data;
}

loadEnvFile(path.join(projectRoot, ".env"));

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "");
const secretKey = String(process.env.SUPABASE_SECRET_KEY || "");
const sourceFile = path.resolve(projectRoot, process.env.MIGRATION_SOURCE_FILE || "data/node-store.json");
if (!supabaseUrl || !publishableKey || !secretKey) throw new Error("Environment Supabase belum lengkap.");

const source = normalizeStore(JSON.parse(await fsp.readFile(sourceFile, "utf8")));
const passwordMap = parsePasswordMap();
const store = await SupabaseStore.connect({ url: supabaseUrl, secretKey });
const targetHasData = Object.keys(store.data.users).length > 0
  || store.data.usageEvents.length > 0
  || Object.keys(store.data.generatedFiles).length > 0;
if (targetHasData && !/^(?:1|true|yes)$/i.test(process.env.MIGRATION_OVERWRITE || "")) {
  throw new Error("Target Supabase sudah berisi data. Migrasi dibatalkan agar data aktif tidak tertimpa.");
}
const auth = new SupabaseAuth({ url: supabaseUrl, publishableKey, secretKey });
const idMap = new Map();
let createdCount = 0;
let updatedCount = 0;
let temporaryPasswordCount = 0;

for (const localUser of Object.values(source.users)) {
  const email = String(localUser.email || "").trim().toLowerCase();
  if (!email) throw new Error(`User lokal ${localUser.id} tidak memiliki email.`);
  const displayName = String(localUser.displayName || "Kreator Layera").trim();
  const suppliedPassword = passwordMap[email];
  if (suppliedPassword && (suppliedPassword.length < 8 || suppliedPassword.length > 128)) throw new Error(`Kata sandi migrasi untuk ${email} harus 8-128 karakter.`);
  let authUser = await auth.findUserByEmail(email);
  if (authUser) {
    const attributes: { user_metadata: any; password?: string } = { user_metadata: { ...authUser.user_metadata, display_name: displayName } };
    if (suppliedPassword) attributes.password = suppliedPassword;
    authUser = await auth.updateUser(authUser.id, attributes);
    updatedCount += 1;
  } else {
    const password = suppliedPassword || randomBytes(32).toString("base64url");
    authUser = await auth.createUser({ email, password, displayName });
    createdCount += 1;
    if (!suppliedPassword) temporaryPasswordCount += 1;
  }
  idMap.set(localUser.id, authUser.id);
}

const migrated = remapStore(source, idMap);
await store.replace(migrated);

console.log(`Migrasi selesai: ${Object.keys(migrated.users).length} profil, ${createdCount} user Auth dibuat, ${updatedCount} user Auth diperbarui.`);
console.log(`Data aplikasi: ${migrated.usageEvents.length} usage event dan ${Object.keys(migrated.generatedFiles).length} file tercatat.`);
if (temporaryPasswordCount) console.log(`${temporaryPasswordCount} akun tanpa kata sandi migrasi diberi kata sandi acak dan perlu di-reset sebelum dipakai.`);
