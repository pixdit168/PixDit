import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { creativeAgents, getBehavioralPrompt } from "./lib/creative-agents.js";
import { MemoryAuth, MemoryStore, SupabaseAuth, SupabaseStore } from "./lib/supabase.js";
import { ReplicateImageProvider, saveGeneratedImage } from "./lib/replicate.js";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env"));

const isProduction = process.env.NODE_ENV === "production";
const port = Math.min(65_535, Math.max(1, Number.parseInt(process.env.PORT || "8000", 10) || 8000));
const host = process.env.HOST || "0.0.0.0";
const publicOrigin = String(process.env.PUBLIC_ORIGIN || "").replace(/\/+$/, "");
const trustProxy = /^(?:1|true|yes)$/i.test(process.env.TRUST_PROXY || "");
const cookieSecure = publicOrigin.startsWith("https://") || /^(?:1|true|yes)$/i.test(process.env.COOKIE_SECURE || "");
const sessionCookieName = cookieSecure ? "__Host-layera_session" : "layera_session";
const generatedRoot = path.resolve(projectRoot, process.env.GENERATED_DIR || (process.env.VERCEL ? "/tmp/layera-generated" : "generated"));
const maxBodyBytes = 2 * 1024 * 1024;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "");
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || "");
const useMemoryBackend = process.env.NODE_ENV === "test";
if (!useMemoryBackend && (!supabaseUrl || !supabasePublishableKey || !supabaseSecretKey)) {
  throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, dan SUPABASE_SECRET_KEY wajib diatur.");
}
const store = useMemoryBackend ? new MemoryStore() : await SupabaseStore.connect({ url: supabaseUrl, secretKey: supabaseSecretKey });
const accountAuth = useMemoryBackend
  ? new MemoryAuth()
  : new SupabaseAuth({ url: supabaseUrl, publishableKey: supabasePublishableKey, secretKey: supabaseSecretKey });
const imageProvider = new ReplicateImageProvider();
const activeUserJobs = new Set();

if (isProduction && !publicOrigin) {
  throw new Error("PUBLIC_ORIGIN wajib diatur saat NODE_ENV=production, contoh https://app.example.com.");
}
await fsp.mkdir(generatedRoot, { recursive: true });

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; font-src 'self'; manifest-src 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function sendJson(response, statusCode, data, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(data), "utf8");
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    ...extraHeaders,
  });
  response.end(body);
}

function sendUnauthorized(response) {
  sendJson(response, 401, { ok: false, authenticated: false, error: "unauthorized", message: "Silakan masuk kembali ke akun Layera." });
}

function parseCookies(request) {
  const result = {};
  for (const pair of String(request.headers.cookie || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    result[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return result;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function fixedTimeTextEqual(actual, expected) {
  const left = Buffer.from(String(actual || ""), "utf8");
  const right = Buffer.from(String(expected || ""), "utf8");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function getClientAddress(request) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress || "unknown";
}

function getRequestOrigin(request) {
  const forwardedProto = trustProxy ? String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim() : "";
  const forwardedHost = trustProxy ? String(request.headers["x-forwarded-host"] || "").split(",")[0].trim() : "";
  const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
  const requestHost = forwardedHost || request.headers.host || "";
  return requestHost ? `${protocol}://${requestHost}` : "";
}

function isRequestOriginAllowed(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method || "GET")) return true;
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") return false;
  const origin = String(request.headers.origin || "").replace(/\/+$/, "");
  if (!origin) return !isProduction;
  const expected = publicOrigin || getRequestOrigin(request);
  return Boolean(expected) && origin === expected;
}

async function readJsonBody(request) {
  const declaredLength = Number.parseInt(request.headers["content-length"] || "0", 10);
  if (declaredLength > maxBodyBytes) {
    const error = new Error("Request body terlalu besar.");
    error.statusCode = 413;
    throw error;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBodyBytes) {
      const error = new Error("Request body terlalu besar.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch {
    const error = new Error("JSON request tidak valid.");
    error.statusCode = 400;
    throw error;
  }
}

function defaultPreferences() {
  return { defaultFormat: "Instagram Post · 4:5", defaultStyle: "Eksploratif", primaryColor: "#5a3529", startView: "dashboard" };
}

function findUserByEmail(email) {
  return Object.values(store.data.users).find((user) => user.email === email) || null;
}

function getPlanCode(userId) {
  return store.data.users[userId]?.plan === "premium" ? "premium" : "free";
}

function getPublicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt, plan: getPlanCode(user.id) };
}

function createUserProfile({ id, email, displayName, plan = "free", createdAt = new Date().toISOString() }) {
  return {
    id,
    email: String(email || "").toLowerCase(),
    displayName: String(displayName || "Kreator Layera").trim() || "Kreator Layera",
    createdAt,
    updatedAt: createdAt,
    preferences: defaultPreferences(),
    state: { projects: [], library: [], initialized: true, updatedAt: createdAt },
    plan,
  };
}

async function createSession(userId, remember = false) {
  const token = randomToken();
  const tokenHash = sha256(token);
  const csrfToken = randomToken();
  const now = Date.now();
  const expiresAt = new Date(now + (remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)).toISOString();
  await store.mutate((data) => {
    for (const [key, session] of Object.entries(data.sessions)) {
      if (Date.parse(session.expiresAt) <= now) delete data.sessions[key];
    }
    const userSessions = Object.entries(data.sessions).filter(([, session]) => session.userId === userId);
    if (userSessions.length >= 8) {
      for (const [key] of userSessions) delete data.sessions[key];
    }
    data.sessions[tokenHash] = { userId, csrfToken, expiresAt, createdAt: new Date(now).toISOString() };
  });
  return { token, csrfToken, expiresAt, remember, maxAge: Math.floor((Date.parse(expiresAt) - now) / 1000) };
}

async function getSessionRecord(request) {
  const token = parseCookies(request)[sessionCookieName];
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = store.data.sessions[tokenHash];
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await store.mutate((data) => { delete data.sessions[tokenHash]; });
    return null;
  }
  return { ...session, token, tokenHash };
}

async function getAuthenticatedUser(request) {
  const session = await getSessionRecord(request);
  if (!session) return null;
  const user = store.data.users[session.userId];
  return user ? { user, session } : null;
}

function hasValidCsrf(request, session) {
  return fixedTimeTextEqual(request.headers["x-csrf-token"], session?.csrfToken);
}

function getSessionCookie(session) {
  const parts = [`${sessionCookieName}=${session.token}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (cookieSecure) parts.push("Secure");
  if (session.remember) parts.push(`Max-Age=${session.maxAge}`);
  return parts.join("; ");
}

function getExpiredSessionCookie() {
  const parts = [`${sessionCookieName}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
  if (cookieSecure) parts.push("Secure");
  return parts.join("; ");
}

async function allowSecurityEvent(key, eventType, limit, windowMinutes) {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  const count = store.data.securityEvents.filter((event) => event.key === key && event.eventType === eventType && Date.parse(event.createdAt) >= cutoff).length;
  if (count >= limit) return false;
  await store.mutate((data) => {
    data.securityEvents.push({ id: randomUUID(), key, eventType, createdAt: new Date().toISOString() });
    const oldest = Date.now() - 7 * 24 * 60 * 60 * 1000;
    data.securityEvents = data.securityEvents.filter((event) => Date.parse(event.createdAt) >= oldest);
  });
  return true;
}

function getSignupSignal(input, request) {
  let deviceId = String(input.deviceId || "").trim();
  let fingerprint = String(input.deviceFingerprint || "").trim().slice(0, 500);
  if (deviceId.length < 12 || deviceId.length > 160) deviceId = "missing-device";
  const userAgent = String(request.headers["user-agent"] || "unknown");
  return {
    deviceHash: sha256(deviceId),
    ipHash: sha256(getClientAddress(request)),
    userAgentHash: sha256(`${userAgent}|${fingerprint}`),
  };
}

function getPeriod(plan) {
  const now = new Date();
  if (plan === "premium") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, reset, creditLimit: 200, period: "monthly" };
  }
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  return { start, reset: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000), creditLimit: 11, period: "weekly" };
}

function getUsageStatus(userId) {
  const plan = getPlanCode(userId);
  const isPremium = plan === "premium";
  const period = getPeriod(plan);
  const events = store.data.usageEvents.filter((event) => event.userId === userId && Date.parse(event.createdAt) >= period.start.getTime());
  const generationUsed = events.filter((event) => event.eventType === "generate").length;
  const refinementUsed = events.filter((event) => event.eventType === "refine").length;
  const creditsUsed = events.reduce((total, event) => total + Math.max(0, Number(event.creditCost) || 0), 0);
  const creditsRemaining = Math.max(0, period.creditLimit - creditsUsed);
  const brand = store.data.accountBrands[userId] || null;
  return {
    plan,
    planLabel: isPremium ? "Layera Pro" : "Paket Gratis",
    isPremium,
    isSubscriber: isPremium,
    maxAgents: isPremium ? 10 : 1,
    allowedQualities: isPremium ? ["1mp", "2mp", "4mp"] : ["1mp"],
    credits: { limit: period.creditLimit, used: creditsUsed, remaining: creditsRemaining, period: period.period, resetAt: period.reset.toISOString() },
    brand: { limit: isPremium ? -1 : 1, used: brand ? 1 : 0, name: brand?.displayName || "" },
    generation: {
      limit: isPremium ? -1 : 1,
      used: generationUsed,
      remaining: isPremium ? -1 : Math.max(0, 1 - generationUsed),
      exhausted: (!isPremium && generationUsed >= 1) || creditsRemaining < 2,
      resetAt: period.reset.toISOString(),
    },
    refinement: {
      limit: isPremium ? -1 : 3,
      used: refinementUsed,
      remaining: isPremium ? -1 : Math.max(0, 3 - refinementUsed),
      exhausted: (!isPremium && refinementUsed >= 3) || creditsRemaining < 3,
      resetAt: period.reset.toISOString(),
    },
  };
}

function generationCreditCost(quality, count = 1) {
  const perImage = ({ "2mp": 4, "4mp": 8 })[quality] || 2;
  return perImage * Math.max(1, count);
}

function creditAllowed(userId, eventType, creditCost) {
  const usage = getUsageStatus(userId);
  if (creditCost > usage.credits.remaining) return { allowed: false, usage };
  if (eventType === "generate" && usage.generation.exhausted) return { allowed: false, usage };
  if (eventType === "refine" && usage.refinement.exhausted) return { allowed: false, usage };
  return { allowed: true, usage };
}

async function addUsageEvent(userId, eventType, creditCost) {
  await store.mutate((data) => data.usageEvents.push({ id: randomUUID(), userId, eventType, creditCost, createdAt: new Date().toISOString() }));
}

function brandKey(brandName) {
  return String(brandName || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120) || "brand-tanpa-nama";
}

function isBrandAllowed(userId, brandName) {
  if (getPlanCode(userId) === "premium") return true;
  const existing = store.data.accountBrands[userId];
  return !existing || existing.key === brandKey(brandName);
}

async function addAccountBrand(userId, brandName) {
  if (getPlanCode(userId) === "premium" || store.data.accountBrands[userId]) return;
  const displayName = String(brandName || "").trim().slice(0, 120) || "Brand tanpa nama";
  await store.mutate((data) => { data.accountBrands[userId] = { key: brandKey(brandName), displayName, createdAt: new Date().toISOString() }; });
}

function quotaExceeded(response, userId, eventType, requiredCredits) {
  const usage = getUsageStatus(userId);
  const resetDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(usage.credits.resetAt));
  const message = usage.isPremium
    ? `Kredit Layera Pro kamu tidak cukup untuk tindakan ini. Kredit berikutnya hadir pada ${resetDate}.`
    : `Kamu sudah menggunakan semua token kreatif yang ada.\n\nToken gratis selanjutnya akan hadir pada ${resetDate}.\n\nAyo upgrade ke pro agar dapat membuka potensial terbaik dari program ini, dapat membuat ~100 gambar, bebas memilih behavior agentic, dll.`;
  sendJson(response, 429, { ok: false, error: "quota_exhausted", quotaType: eventType, requiredCredits, upgradeRequired: !usage.isPremium, upgradeLabel: "Upgrade ke pro - Rp. 199.999/bln", message, usage });
}

function convertToVisualBrief(brief) {
  let result = String(brief || "").replace(/(?:\b(?:dengan|serta|dan)\s+)?\b(tagline|headline|call\s+to\s+action|cta|tipografi|typography|font|teks|text|logo)\b\s*[:\-]?\s*[^.!?\r\n]*[.!?]?/gim, "");
  result = result.replace(/\b(poster|flyer|banner)\b/gi, "key visual").replace(/\s{2,}/g, " ").trim().replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, "");
  return result || "Create a tasteful commercial key visual based on the supplied business category.";
}

function newImagePrompt({ brief, category, creativeAgent, format, style, primaryColor, refinement = "" }) {
  const visualBrief = convertToVisualBrief(brief);
  if (refinement) {
    return `IMAGE EDIT TASK — the attached/source image is the visual source of truth.\nUSER'S REQUIRED CHANGE (highest priority): ${refinement}\n\nMake the requested change clearly visible. Preserve every element the user did not ask to change: subject identity, shape, people, activity, camera angle, crop, composition, lighting direction, background structure, and material details. If the requested change names one of those elements, change that element and preserve the rest. Do not reinterpret the full campaign or introduce an unrelated subject, object, person, industry, or setting.\nOriginal campaign context (use only to disambiguate the edit): ${visualBrief}\nBusiness category: ${category}\nOutput format: ${format}\nVisual continuity: ${style}, polished commercial quality, realistic materials.\nHard constraints: return one edited key visual only. No text, pseudo-text, letters, numbers, labels, logos, watermarks, signatures, borders, or UI. Any surface that could contain writing must remain blank.`;
  }
  return `IMPORTANT OUTPUT RULE: Generate only a clean advertising key visual. This is NOT a finished poster and must contain no typography.\nUse case: advertising key visual for an Indonesian small business\nBusiness category selected in the UI: ${category}\nPrimary visual brief (highest authority for subject and meaning): ${visualBrief}\nRequested output format: ${format}\nUser-selected visual style: ${style}\nPreferred primary color: ${/^#[0-9a-f]{6}$/i.test(primaryColor) ? primaryColor : "derive a tasteful palette from the brief"}\n\n${getBehavioralPrompt(creativeAgent)}\n\nPriority order: (1) preserve the user's actual business, subject, benefit, and audience; (2) obey this agent's exclusive composition and rendering contract; (3) apply the selected style and brand color without erasing the agent signature.\nDomain fidelity: infer the actual industry and subject from the user's visual brief. The visual brief overrides the UI category whenever they conflict. Represent services, software, education, health, property, fashion, beauty, events, professional work, and other fields through an appropriate audience, action, environment, outcome, or visual metaphor. Never substitute a different business sector or invent any subject, object, person, activity, or setting absent from the brief.\nBrief interpretation: use the brief to understand the subject or service, audience, benefit, mood, colors, materials, action, and setting. Treat any request for a tagline, headline, typography, logo, brand name, campaign name, or written copy only as a request to reserve the exact copy zone required by this agent. Never render or imitate those words.\nSet-wide diversity: this concept belongs to a ten-direction exploration. Make its camera, spatial hierarchy, visual medium, subject scale, and copy-zone geometry unmistakably specific to this agent. Brand consistency may come from palette and subject matter, never from repeating one layout.\nQuality: polished, commercially usable, context-appropriate imagery, realistic materials where relevant, and intentional lighting.\nCultural context: contemporary Indonesia, tasteful and authentic when relevant to the brief.\nHard constraints: visual imagery only. Absolutely no text, pseudo-text, glyphs, letters, words, numbers, captions, labels, logos, brand marks, signatures, UI, border, poster title, or watermark anywhere in the image. Any surface that could contain writing must remain blank. Do not add unrelated objects or people.`;
}

function enhancedPrompt(input) {
  const brief = String(input.prompt || "").trim();
  const projectName = String(input.projectName || "").trim();
  const category = String(input.category || "").trim() || "Bisnis lokal";
  const style = String(input.style || "").trim() || "Eksploratif";
  const format = String(input.format || "").trim() || "Instagram Post 4:5";
  const focusByCategory = {
    "Makanan & Minuman": "Tonjolkan produk, bahan, tekstur, dan momen konsumsi yang paling menggugah selera.",
    Kecantikan: "Tonjolkan manfaat, tekstur produk, ritual pemakaian, dan kesan yang ingin dirasakan audiens.",
    Fashion: "Tonjolkan potongan, material, detail, gerak, dan karakter pemakai yang dituju.",
    Jasa: "Visualisasikan hasil atau perubahan yang diterima pelanggan, bukan sekadar alat kerja.",
    Teknologi: "Tampilkan manfaat produk dalam konteks penggunaan yang mudah dipahami dan terasa manusiawi.",
    Pendidikan: "Visualisasikan proses belajar, rasa ingin tahu, perkembangan kemampuan, dan hasil yang relevan bagi pelajar.",
    Kesehatan: "Tonjolkan rasa aman, dukungan profesional, kebiasaan sehat, dan hasil yang realistis tanpa klaim berlebihan.",
    Properti: "Tonjolkan pengalaman ruang, fungsi, lingkungan, dan gaya hidup calon penghuni atau pengguna.",
    Lainnya: "Tentukan subjek utama, manfaat, audiens, suasana, dan konteks penggunaan secara spesifik.",
  };
  const parts = [];
  if (brief) {
    parts.push(brief.replace(/[.\s]+$/, ""));
    parts.push("Pertahankan bidang bisnis, subjek, dan tujuan asli dari brief; jangan menggantinya dengan bidang, objek, atau adegan lain yang tidak diminta");
    parts.push("Perjelas audiens, manfaat, suasana, aksi, dan konteks visual yang relevan tanpa mengarang jenis bisnis baru");
  } else {
    if (projectName) parts.push(`Buat key visual promosi untuk ${projectName} dalam kategori ${category}`);
    else parts.push(`Buat key visual promosi untuk bisnis kategori ${category}`);
    parts.push(`Tujuan visual: ${focusByCategory[category] || focusByCategory.Lainnya}`);
  }
  parts.push(`Arah gaya: ${style}; format: ${format}; pertahankan fleksibilitas komposisi agar setiap behavioral agent dapat menerjemahkan brief dengan ciri visualnya sendiri`);
  if (String(input.brand || "").trim()) parts.push(`Identitas brand yang perlu terasa: ${String(input.brand).trim()}`);
  if (String(input.headline || "").trim()) parts.push(`Makna headline yang perlu didukung visual: ${String(input.headline).trim()}`);
  if (String(input.cta || "").trim()) parts.push(`Aksi yang ingin didorong: ${String(input.cta).trim()}`);
  parts.push("Hasilkan key visual saja tanpa teks, huruf, angka, watermark, atau logo; aplikasi akan menambahkan elemen branding setelah gambar dibuat");
  const result = parts.join(". ").trim();
  return result.length > 1000 ? `${result.slice(0, 997).trimEnd()}...` : result;
}

function headlineSuggestion(input) {
  const brief = String(input.prompt || "").trim().slice(0, 1000);
  const category = String(input.category || "Lainnya").trim();
  const brand = String(input.brand || input.projectName || "").trim();
  const source = `${brief} ${category} ${brand}`.toLowerCase();
  const sectors = [
    { key: "technology", match: /software|aplikasi|platform|saas|digital|teknologi|akuntansi|otomasi|website|web app|fintech/, lines: ["Kerja lebih rapi. Keputusan lebih pasti.", "Sederhanakan kerja, besarkan peluang.", "Lebih sedikit langkah. Lebih banyak kemajuan."] },
    { key: "fashion", match: /fashion|pakaian|baju|sepatu|sneaker|koleksi|busana|hijab|tas|aksesoris|lari/, lines: ["Bergerak ringan, tampil percaya diri.", "Dibuat untuk langkah yang lebih berani.", "Gaya yang mengikuti caramu bergerak."] },
    { key: "beauty", match: /skincare|kecantikan|serum|kulit|kosmetik|makeup|perawatan wajah/, lines: ["Lembut dirawat, berani bersinar.", "Perawatan baik dimulai dari rasa nyaman.", "Kulitmu, ritmemu, cahayamu."] },
    { key: "food", match: /makanan|minuman|kopi|kuliner|restoran|cafe|kafe|roti|snack|rasa|menu|catering/, lines: ["Rasa baik untuk momen yang berarti.", "Satu rasa, banyak cerita.", "Temukan nikmat di setiap momen."] },
    { key: "education", match: /pendidikan|belajar|sekolah|kursus|kelas|pelatihan|siswa|mahasiswa|edukasi/, lines: ["Belajar hari ini, melangkah lebih jauh.", "Tumbuhkan kemampuan, buka lebih banyak jalan.", "Rasa ingin tahu menjadi kemajuan."] },
    { key: "health", match: /kesehatan|klinik|dokter|medis|sehat|kebugaran|fitness|terapi|wellness/, lines: ["Langkah kecil untuk hidup yang lebih baik.", "Dukungan tepat untuk dirimu yang sehat.", "Lebih tenang menjalani setiap hari."] },
    { key: "property", match: /properti|rumah|apartemen|hunian|real estate|interior|arsitektur|ruang/, lines: ["Ruang yang tumbuh bersama ceritamu.", "Temukan tempat untuk langkah berikutnya.", "Lebih dari ruang, ini awal yang baru."] },
    { key: "service", match: /jasa|konsultan|konsultasi|layanan|logistik|pengiriman|import|ekspor|freight|agency|agensi/, lines: ["Urusan lebih mudah, langkah lebih pasti.", "Partner tepat untuk hasil yang nyata.", "Dari rencana menuju hasil, tanpa rumit."] },
  ];
  const categorySector = {
    "Makanan & Minuman": "food",
    Kecantikan: "beauty",
    Fashion: "fashion",
    Jasa: "service",
    Teknologi: "technology",
    Pendidikan: "education",
    Kesehatan: "health",
    Properti: "property",
  }[category];
  const matched = sectors.find((sector) => sector.match.test(brief.toLowerCase()))
    || sectors.find((sector) => sector.key === categorySector);
  const lines = matched?.lines || [
    "Ide baik, dibuat lebih berarti.",
    "Saatnya mengubah rencana menjadi kemajuan.",
    "Buat langkah berikutnya terasa berbeda.",
  ];
  const variation = String(input.variation || "0");
  const hash = [...`${brief}|${brand}|${variation}`].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
  return lines[hash % lines.length].slice(0, 100);
}

function safeClientError(error) {
  const message = String(error?.message || "Provider gambar gagal memproses permintaan.")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/r8_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sbp_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 500);
  return isProduction && !/REPLICATE_API_TOKEN|batas waktu|Replicate|Flux|kredit|billing|rate/i.test(message)
    ? "Provider gambar gagal memproses permintaan. Silakan coba kembali."
    : message;
}

async function recordGeneratedFile(userId, urlPath) {
  await store.mutate((data) => { data.generatedFiles[urlPath] = { userId, createdAt: new Date().toISOString() }; });
}

async function resolveGeneratedSource(sourceUrl, userId) {
  const cleanUrl = String(sourceUrl || "").split("?")[0];
  if (!/^\/generated\/[a-zA-Z0-9-]+\/concept-\d{2}\.(?:jpg|jpeg|png|webp)$/i.test(cleanUrl)) throw new Error("Gambar sumber edit harus berasal dari Library Layera.");
  if (store.data.generatedFiles[cleanUrl]?.userId !== userId) throw new Error("Gambar sumber tidak ditemukan untuk akun ini.");
  const relative = decodeURIComponent(cleanUrl.slice("/generated/".length));
  const filePath = path.resolve(generatedRoot, relative);
  const rootPrefix = `${generatedRoot}${path.sep}`;
  if (!filePath.startsWith(rootPrefix)) throw new Error("Path gambar sumber tidak valid.");
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error("File gambar sumber tidak ditemukan.");
  return filePath;
}

function sendNdjson(response, data) {
  if (!response.destroyed && !response.writableEnded) response.write(`${JSON.stringify(data)}\n`);
}

async function handleGeneration(request, response, input, auth) {
  const brief = String(input.prompt || "").trim();
  if (brief.length < 20) return sendJson(response, 400, { error: "invalid_prompt", message: "Prompt minimal 20 karakter." });
  if (brief.length > 1000) return sendJson(response, 400, { error: "prompt_too_long", message: "Prompt maksimal 1000 karakter." });
  if (!imageProvider.configured) return sendJson(response, 503, { error: "missing_api_key", message: "REPLICATE_API_TOKEN belum diatur pada environment server Node.js." });
  if (activeUserJobs.has(auth.user.id)) return sendJson(response, 409, { error: "generation_in_progress", message: "Masih ada proses gambar untuk akun ini. Tunggu hingga selesai." });

  const usage = getUsageStatus(auth.user.id);
  let quality = String(input.quality || "1mp").toLowerCase();
  if (!["1mp", "2mp", "4mp"].includes(quality)) quality = "1mp";
  if (!usage.allowedQualities.includes(quality)) return sendJson(response, 403, { error: "quality_limit", upgradeRequired: true, message: "Paket Gratis hanya mendukung kualitas 1MP/HD. Upgrade ke Pro untuk membuka 2MP dan 4MP.", usage });
  const agentIndexes = [...new Set((Array.isArray(input.agentIndexes) ? input.agentIndexes : [0]).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < creativeAgents.length))];
  if (!agentIndexes.length) agentIndexes.push(0);
  if (agentIndexes.length > usage.maxAgents) return sendJson(response, 403, { error: "agent_limit", upgradeRequired: !usage.isSubscriber, message: `${usage.planLabel} hanya dapat menggunakan ${usage.maxAgents} agent dalam satu generasi.`, usage });
  const totalCreditCost = generationCreditCost(quality, agentIndexes.length);
  if (!creditAllowed(auth.user.id, "generate", totalCreditCost).allowed) return quotaExceeded(response, auth.user.id, "generate", totalCreditCost);
  const brandName = String(input.brandName || input.projectName || "").trim();
  if (!isBrandAllowed(auth.user.id, brandName)) return sendJson(response, 403, { error: "brand_limit", upgradeRequired: true, message: `Paket Gratis hanya berlaku untuk 1 brand. Brand aktif akun ini adalah '${usage.brand.name}'. Upgrade ke Pro untuk menggunakan brand tanpa batas.`, usage });

  const requestId = String(input.requestId || randomUUID());
  const jobId = randomUUID().replace(/-/g, "");
  const format = String(input.format || "Instagram Post · 4:5").trim();
  const style = String(input.style || "Eksploratif").trim();
  const category = String(input.category || "Bisnis lokal").trim();
  const primaryColor = /^#[0-9a-f]{6}$/i.test(input.primaryColor || "") ? input.primaryColor : "";
  const abortController = new AbortController();
  response.on("close", () => { if (!response.writableEnded) abortController.abort(new Error("Koneksi browser terputus.")); });
  activeUserJobs.add(auth.user.id);
  response.writeHead(200, {
    ...securityHeaders,
    "Cache-Control": "no-store",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Transfer-Encoding": "chunked",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  sendNdjson(response, { type: "start", requestId, promptLength: brief.length, jobId, total: agentIndexes.length, agentIndexes, model: imageProvider.model, provider: "replicate", format, style, quality, creditCost: totalCreditCost });

  let successCount = 0;
  let brandRecorded = false;
  const failureMessages = [];
  const perImageCreditCost = generationCreditCost(quality, 1);
  try {
    for (const index of agentIndexes) {
      const creativeAgent = creativeAgents[index];
      try {
        sendNdjson(response, { type: "progress", index, agent: creativeAgent.agent, name: creativeAgent.name });
        const prompt = newImagePrompt({ brief, category, creativeAgent, format, style, primaryColor });
        const result = await imageProvider.run({ prompt, format, quality, signal: abortController.signal });
        const url = await saveGeneratedImage({ generatedRoot, jobId, index, result });
        await recordGeneratedFile(auth.user.id, url);
        await addUsageEvent(auth.user.id, "generate", perImageCreditCost);
        if (!brandRecorded) { await addAccountBrand(auth.user.id, brandName); brandRecorded = true; }
        successCount += 1;
        sendNdjson(response, { type: "image", index, name: creativeAgent.name, agent: creativeAgent.agent, url, displayUrl: url });
      } catch (error) {
        const message = safeClientError(error);
        failureMessages.push(message);
        sendNdjson(response, { type: "image_error", index, name: creativeAgent.name, message });
        if (abortController.signal.aborted) break;
      }
    }
    sendNdjson(response, { type: "done", requestId, jobId, total: agentIndexes.length, success: successCount, failed: failureMessages.length, firstError: failureMessages[0] || "", usage: getUsageStatus(auth.user.id) });
    if (!response.writableEnded) response.end();
  } finally {
    activeUserJobs.delete(auth.user.id);
  }
}

async function handleRefinement(request, response, input, auth) {
  const brief = String(input.prompt || "").trim();
  const refinement = String(input.refinement || "").trim();
  if (brief.length < 20 || brief.length > 1000) return sendJson(response, 400, { error: "invalid_prompt", message: "Prompt Library harus berisi 20-1000 karakter." });
  if (!refinement || refinement.length > 500) return sendJson(response, 400, { error: "invalid_refinement", message: "Instruksi edit harus berisi 1-500 karakter." });
  if (!imageProvider.configured) return sendJson(response, 503, { error: "missing_api_key", message: "REPLICATE_API_TOKEN belum diatur pada environment server Node.js." });
  if (activeUserJobs.has(auth.user.id)) return sendJson(response, 409, { error: "generation_in_progress", message: "Masih ada proses gambar untuk akun ini. Tunggu hingga selesai." });
  if (!creditAllowed(auth.user.id, "refine", 3).allowed) return quotaExceeded(response, auth.user.id, "refine", 3);
  activeUserJobs.add(auth.user.id);
  try {
    const indexValue = Number(input.conceptIndex);
    const index = Number.isInteger(indexValue) && indexValue >= 0 && indexValue < creativeAgents.length ? indexValue : 0;
    const creativeAgent = creativeAgents[index];
    const format = String(input.format || "Instagram Post · 4:5").trim();
    const style = String(input.style || "Eksploratif").trim();
    const category = String(input.category || "Bisnis lokal").trim();
    const primaryColor = /^#[0-9a-f]{6}$/i.test(input.primaryColor || "") ? input.primaryColor : "";
    let quality = String(input.quality || "1mp").toLowerCase();
    const usage = getUsageStatus(auth.user.id);
    if (!usage.allowedQualities.includes(quality)) quality = "1mp";
    const sourcePath = await resolveGeneratedSource(input.sourceUrl, auth.user.id);
    const prompt = newImagePrompt({ brief, category, creativeAgent, format, style, primaryColor, refinement });
    const result = await imageProvider.run({ prompt, format, quality, sourcePath });
    const jobId = `refine-${randomUUID().replace(/-/g, "")}`;
    const url = await saveGeneratedImage({ generatedRoot, jobId, index, result });
    await recordGeneratedFile(auth.user.id, url);
    await addUsageEvent(auth.user.id, "refine", 3);
    return sendJson(response, 200, { ok: true, index, url, displayUrl: url, usage: getUsageStatus(auth.user.id) });
  } catch (error) {
    return sendJson(response, 502, { error: "generation_failed", message: safeClientError(error) });
  } finally {
    activeUserJobs.delete(auth.user.id);
  }
}

async function handleAuthAndAccount(request, response, pathname) {
  if (request.method === "POST" && pathname === "/api/auth/register") {
    const input = await readJsonBody(request);
    const displayName = String(input.displayName || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (displayName.length < 2 || displayName.length > 80) return sendJson(response, 400, { error: "invalid_name", message: "Nama harus terdiri dari 2-80 karakter." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return sendJson(response, 400, { error: "invalid_email", message: "Alamat email tidak valid." });
    if (password.length < 8 || password.length > 128) return sendJson(response, 400, { error: "weak_password", message: "Kata sandi minimal 8 karakter." });
    if (!await allowSecurityEvent(sha256(getClientAddress(request)), "signup", 8, 60)) return sendJson(response, 429, { error: "signup_rate_limit", message: "Terlalu banyak percobaan pendaftaran dari jaringan ini. Coba lagi dalam satu jam." });
    const signal = getSignupSignal(input, request);
    const deviceCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const deviceAccounts = store.data.signupSignals.filter((item) => item.deviceHash === signal.deviceHash && Date.parse(item.createdAt) >= deviceCutoff).length;
    if (deviceAccounts >= 3) return sendJson(response, 429, { error: "device_signup_limit", message: "Batas akun gratis untuk perangkat ini sudah tercapai. Hubungi bantuan jika ini keliru." });
    if (findUserByEmail(email)) return sendJson(response, 409, { error: "email_exists", message: "Email tersebut sudah terdaftar." });
    const now = new Date().toISOString();
    let authUser;
    try {
      authUser = await accountAuth.createUser({ email, password, displayName });
    } catch (error) {
      if (/already|registered|exists/i.test(String(error.message)) || /exists/i.test(String(error.code))) {
        return sendJson(response, 409, { error: "email_exists", message: "Email tersebut sudah terdaftar." });
      }
      throw error;
    }
    const user = createUserProfile({ id: authUser.id, email, displayName, createdAt: now });
    try {
      await store.mutate((data) => {
        if (Object.values(data.users).some((existing) => existing.email === email)) throw new Error("Email tersebut sudah terdaftar.");
        data.users[user.id] = user;
        data.signupSignals.push({ id: randomUUID(), userId: user.id, ...signal, createdAt: now });
      });
    } catch (error) {
      await accountAuth.deleteUser(user.id).catch(() => {});
      throw error;
    }
    const session = await createSession(user.id, Boolean(input.remember));
    return sendJson(response, 201, { ok: true, authenticated: true, csrfToken: session.csrfToken, user: getPublicUser(user), preferences: user.preferences }, { "Set-Cookie": getSessionCookie(session) });
  }

  if (request.method === "POST" && pathname === "/api/auth/login") {
    const input = await readJsonBody(request);
    const email = String(input.email || "").trim().toLowerCase();
    const [clientAllowed, emailAllowed] = await Promise.all([
      allowSecurityEvent(sha256(`ip:${getClientAddress(request)}`), "login_ip", 30, 15),
      allowSecurityEvent(sha256(`email:${email}`), "login_email", 10, 15),
    ]);
    if (!clientAllowed || !emailAllowed) return sendJson(response, 429, { error: "login_rate_limit", message: "Terlalu banyak percobaan masuk. Tunggu 15 menit lalu coba kembali." });
    let authUser;
    try {
      authUser = await accountAuth.signIn(email, String(input.password || ""));
    } catch {
      return sendJson(response, 401, { error: "invalid_credentials", message: "Email atau kata sandi tidak cocok." });
    }
    let user = store.data.users[authUser.id] || findUserByEmail(email);
    if (user && user.id !== authUser.id) {
      const previousId = user.id;
      await store.mutate((data) => {
        delete data.users[previousId];
        user.id = authUser.id;
        data.users[authUser.id] = user;
        for (const session of Object.values(data.sessions)) if (session.userId === previousId) session.userId = authUser.id;
        for (const event of data.usageEvents) if (event.userId === previousId) event.userId = authUser.id;
        for (const signal of data.signupSignals) if (signal.userId === previousId) signal.userId = authUser.id;
        for (const file of Object.values(data.generatedFiles)) if (file.userId === previousId) file.userId = authUser.id;
        if (data.accountBrands[previousId]) {
          data.accountBrands[authUser.id] = data.accountBrands[previousId];
          delete data.accountBrands[previousId];
        }
      });
    }
    if (!user) {
      user = createUserProfile({
        id: authUser.id,
        email,
        displayName: authUser.user_metadata?.display_name || email.split("@")[0],
      });
      await store.mutate((data) => { data.users[user.id] = user; });
    }
    const session = await createSession(user.id, Boolean(input.remember));
    return sendJson(response, 200, { ok: true, authenticated: true, csrfToken: session.csrfToken, user: getPublicUser(user), preferences: user.preferences || defaultPreferences() }, { "Set-Cookie": getSessionCookie(session) });
  }

  const auth = await getAuthenticatedUser(request);
  if (request.method === "GET" && pathname === "/api/auth/me") {
    if (!auth) return sendUnauthorized(response);
    return sendJson(response, 200, { ok: true, authenticated: true, csrfToken: auth.session.csrfToken, user: getPublicUser(auth.user), preferences: auth.user.preferences || defaultPreferences() });
  }
  if (request.method === "GET" && pathname === "/api/usage") {
    if (!auth) return sendUnauthorized(response);
    return sendJson(response, 200, { ok: true, usage: getUsageStatus(auth.user.id) });
  }
  if (request.method === "POST" && pathname === "/api/auth/logout") {
    if (!auth || !hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid." });
    await store.mutate((data) => { delete data.sessions[auth.session.tokenHash]; });
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": getExpiredSessionCookie() });
  }
  if (request.method === "GET" && pathname === "/api/state") {
    if (!auth) return sendUnauthorized(response);
    const state = auth.user.state || { projects: [], library: [], initialized: false };
    return sendJson(response, 200, { projects: Array.isArray(state.projects) ? state.projects : [], library: Array.isArray(state.library) ? state.library : [], initialized: Boolean(state.initialized) });
  }
  if (request.method === "PUT" && pathname === "/api/state") {
    if (!auth) return sendUnauthorized(response);
    if (!hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid." });
    const input = await readJsonBody(request);
    const projects = Array.isArray(input.projects) ? input.projects.slice(0, 250) : [];
    const library = Array.isArray(input.library) ? input.library.slice(0, 500) : [];
    if (JSON.stringify({ projects, library }).length > 1_800_000) return sendJson(response, 413, { error: "state_too_large", message: "Data proyek akun terlalu besar." });
    const savedAt = new Date().toISOString();
    await store.mutate((data) => { data.users[auth.user.id].state = { projects, library, initialized: true, updatedAt: savedAt }; });
    return sendJson(response, 200, { ok: true, savedAt });
  }
  if (request.method === "PUT" && pathname === "/api/account/profile") {
    if (!auth) return sendUnauthorized(response);
    if (!hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid." });
    const input = await readJsonBody(request);
    const displayName = String(input.displayName || "").trim();
    const email = String(input.email || auth.user.email).trim().toLowerCase();
    if (displayName.length < 2 || displayName.length > 80) return sendJson(response, 400, { error: "invalid_name", message: "Nama harus terdiri dari 2-80 karakter." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return sendJson(response, 400, { error: "invalid_email", message: "Alamat email tidak valid." });
    const emailChanged = email !== auth.user.email;
    if (emailChanged) {
      try {
        await accountAuth.signIn(auth.user.email, String(input.currentPassword || ""));
      } catch {
        return sendJson(response, 400, { error: "wrong_password", message: "Masukkan kata sandi saat ini untuk mengganti email login." });
      }
      const duplicate = findUserByEmail(email);
      if (duplicate && duplicate.id !== auth.user.id) return sendJson(response, 409, { error: "email_exists", message: "Email tersebut sudah terdaftar." });
    }
    const authAttributes = { user_metadata: { display_name: displayName } };
    if (emailChanged) Object.assign(authAttributes, { email, email_confirm: true });
    try {
      await accountAuth.updateUser(auth.user.id, authAttributes);
    } catch (error) {
      if (/already|registered|exists/i.test(String(error.message)) || /exists/i.test(String(error.code))) {
        return sendJson(response, 409, { error: "email_exists", message: "Email tersebut sudah terdaftar." });
      }
      throw error;
    }
    await store.mutate((data) => {
      data.users[auth.user.id].displayName = displayName;
      data.users[auth.user.id].email = email;
      data.users[auth.user.id].updatedAt = new Date().toISOString();
    });
    return sendJson(response, 200, { ok: true, user: getPublicUser(store.data.users[auth.user.id]) });
  }
  if (request.method === "PUT" && pathname === "/api/account/preferences") {
    if (!auth) return sendUnauthorized(response);
    if (!hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid." });
    const input = await readJsonBody(request);
    const allowedFormats = ["Instagram Post · 4:5", "Instagram Story · 9:16", "Persegi · 1:1"];
    const allowedStyles = ["Eksploratif", "Minimal", "Berani"];
    const preferences = { defaultFormat: String(input.defaultFormat || ""), defaultStyle: String(input.defaultStyle || ""), primaryColor: String(input.primaryColor || "").toLowerCase(), startView: String(input.startView || "") };
    if (!allowedFormats.includes(preferences.defaultFormat) || !allowedStyles.includes(preferences.defaultStyle) || !/^#[0-9a-f]{6}$/.test(preferences.primaryColor) || !["dashboard", "library"].includes(preferences.startView)) return sendJson(response, 400, { error: "invalid_preferences", message: "Preferensi yang dikirim tidak valid." });
    await store.mutate((data) => { data.users[auth.user.id].preferences = preferences; data.users[auth.user.id].updatedAt = new Date().toISOString(); });
    return sendJson(response, 200, { ok: true, preferences });
  }
  if (request.method === "PUT" && pathname === "/api/account/password") {
    if (!auth) return sendUnauthorized(response);
    if (!hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid." });
    const input = await readJsonBody(request);
    try {
      await accountAuth.signIn(auth.user.email, String(input.currentPassword || ""));
    } catch {
      return sendJson(response, 400, { error: "wrong_password", message: "Kata sandi saat ini tidak cocok." });
    }
    const newPassword = String(input.newPassword || "");
    if (newPassword.length < 8 || newPassword.length > 128) return sendJson(response, 400, { error: "weak_password", message: "Kata sandi baru minimal 8 karakter." });
    await accountAuth.updateUser(auth.user.id, { password: newPassword });
    await store.mutate((data) => {
      data.users[auth.user.id].updatedAt = new Date().toISOString();
      for (const [key, session] of Object.entries(data.sessions)) if (session.userId === auth.user.id) delete data.sessions[key];
    });
    const session = await createSession(auth.user.id, true);
    return sendJson(response, 200, { ok: true, csrfToken: session.csrfToken }, { "Set-Cookie": getSessionCookie(session) });
  }
  return false;
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, {
      ok: true,
      configured: imageProvider.configured,
      provider: "replicate",
      model: imageProvider.model,
      endpoint: imageProvider.endpoint,
      deploymentMode: "node",
      database: useMemoryBackend ? "memory" : "supabase",
      auth: useMemoryBackend ? "memory" : "supabase",
      publicOrigin,
      message: imageProvider.configured ? "Replicate Flux 2 Pro siap digunakan." : "REPLICATE_API_TOKEN belum diatur.",
    });
  }
  const accountHandled = await handleAuthAndAccount(request, response, pathname);
  if (accountHandled !== false) return;
  const auth = await getAuthenticatedUser(request);
  if (!auth) return sendUnauthorized(response);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method || "GET") && !hasValidCsrf(request, auth.session)) return sendJson(response, 403, { error: "invalid_csrf_token", message: "Token keamanan sesi tidak valid. Muat ulang halaman lalu coba kembali." });
  if (request.method === "POST" && pathname === "/api/prompt-check") {
    const input = await readJsonBody(request);
    const prompt = String(input.prompt || "").trim();
    if (prompt.length < 20) return sendJson(response, 400, { ok: false, error: "invalid_prompt", message: "Prompt minimal 20 karakter." });
    if (prompt.length > 1000) return sendJson(response, 400, { ok: false, error: "prompt_too_long", message: "Prompt maksimal 1000 karakter." });
    return sendJson(response, 200, { ok: true, requestId: String(input.requestId || ""), prompt, promptLength: prompt.length, format: String(input.format || ""), style: String(input.style || "") });
  }
  if (request.method === "POST" && pathname === "/api/prompt-enhance") {
    const input = await readJsonBody(request);
    if (String(input.prompt || "").trim().length > 1000) return sendJson(response, 400, { error: "prompt_too_long", message: "Prompt maksimal 1000 karakter." });
    const prompt = enhancedPrompt(input);
    return sendJson(response, 200, { ok: true, prompt, promptLength: prompt.length });
  }
  if (request.method === "POST" && pathname === "/api/headline-suggest") {
    const input = await readJsonBody(request);
    if (String(input.prompt || "").trim().length > 1000) return sendJson(response, 400, { error: "prompt_too_long", message: "Prompt maksimal 1000 karakter." });
    const headline = headlineSuggestion(input);
    return sendJson(response, 200, { ok: true, headline, headlineLength: headline.length });
  }
  if (request.method === "POST" && pathname === "/api/generate") {
    const input = await readJsonBody(request);
    return handleGeneration(request, response, input, auth);
  }
  if (request.method === "POST" && pathname === "/api/refine") {
    const input = await readJsonBody(request);
    return handleRefinement(request, response, input, auth);
  }
  return sendJson(response, 404, { error: "not_found" });
}

const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "public/app.js", type: "application/javascript; charset=utf-8" }],
  ["/styles.css", { file: "public/styles.css", type: "text/css; charset=utf-8" }],
]);
const assetMimeTypes = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"], [".svg", "image/svg+xml"], [".ico", "image/x-icon"]]);

async function sendFile(request, response, pathname) {
  let filePath;
  let contentType;
  let cacheControl = "no-cache";
  if (staticFiles.has(pathname)) {
    const entry = staticFiles.get(pathname);
    filePath = path.join(projectRoot, entry.file);
    contentType = entry.type;
  } else if (pathname.startsWith("/assets/")) {
    const relative = decodeURIComponent(pathname.slice("/assets/".length));
    filePath = path.resolve(projectRoot, "assets", relative);
    const assetRoot = `${path.resolve(projectRoot, "assets")}${path.sep}`;
    if (!filePath.startsWith(assetRoot)) return sendJson(response, 403, { error: "forbidden" });
    contentType = assetMimeTypes.get(path.extname(filePath).toLowerCase());
  } else if (pathname.startsWith("/generated/")) {
    const auth = await getAuthenticatedUser(request);
    if (!auth) return sendUnauthorized(response);
    if (store.data.generatedFiles[pathname]?.userId !== auth.user.id) return sendJson(response, 404, { error: "not_found" });
    const relative = decodeURIComponent(pathname.slice("/generated/".length));
    filePath = path.resolve(generatedRoot, relative);
    if (!filePath.startsWith(`${generatedRoot}${path.sep}`)) return sendJson(response, 403, { error: "forbidden" });
    contentType = assetMimeTypes.get(path.extname(filePath).toLowerCase());
    cacheControl = "private, max-age=31536000, immutable";
  } else {
    return sendJson(response, 404, { error: "not_found" });
  }
  if (!contentType) return sendJson(response, 404, { error: "not_found" });
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return sendJson(response, 404, { error: "not_found" });
  response.writeHead(200, { ...securityHeaders, "Cache-Control": cacheControl, "Content-Type": contentType, "Content-Length": stat.size });
  if (request.method === "HEAD") return response.end();
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => { if (!response.headersSent) sendJson(response, 500, { error: "file_error" }); else response.destroy(); });
  stream.pipe(response);
}

const requestHandler = async (request, response) => {
  try {
    const pathname = new URL(request.url || "/", "http://layera.local").pathname;
    if (!isRequestOriginAllowed(request)) return sendJson(response, 403, { error: "request_origin_rejected", message: "Origin request tidak diizinkan." });
    if (pathname.startsWith("/api/")) return await handleApi(request, response, pathname);
    if (["GET", "HEAD"].includes(request.method || "GET")) return await sendFile(request, response, pathname);
    return sendJson(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    console.error(`[${new Date().toISOString()}] ${request.method} ${request.url}:`, safeClientError(error));
    if (!response.headersSent) sendJson(response, statusCode, { error: statusCode === 500 ? "server_error" : "request_error", message: statusCode === 500 && isProduction ? "Server belum dapat memproses permintaan." : error.message });
    else if (!response.writableEnded) response.end();
  }
};

export { requestHandler };
export default requestHandler;

if (!process.env.VERCEL) {
  const server = http.createServer(requestHandler);
  server.requestTimeout = 7 * 60 * 1000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });

  server.listen(port, host, () => {
    console.log(`Layera Node.js berjalan di http://localhost:${port}`);
    console.log(`Provider gambar: Replicate ${imageProvider.model}`);
    console.log(imageProvider.configured ? "REPLICATE_API_TOKEN terdeteksi." : "REPLICATE_API_TOKEN belum diatur; UI tetap dapat dibuka.");
    console.log(`Penyimpanan akun: ${useMemoryBackend ? "memory test" : "Supabase"}`);
    if (isProduction) console.log(`Mode production aktif untuk ${publicOrigin}.`);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
