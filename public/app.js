const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const LEGACY_STORAGE = {
  projects: "kanvas_projects",
  library: "kanvas_library",
};

const inspirationProjects = [
  {
    id: "kopi-gula-aren",
    name: "Kampanye Kopi Gula Aren",
    category: "Makanan & Minuman",
    type: "coffee",
    status: "Inspirasi",
    updated: "Diedit 12 menit lalu",
    hasResults: true,
    brandName: "Rumah Seduh",
    headline: "Rasa pulang di setiap tegukan.",
    cta: "Nikmati sekarang",
    primaryColor: "#5a3529",
    format: "Instagram Post · 4:5",
    style: "Eksploratif",
    prompt:
      "Buat poster promosi untuk kopi susu gula aren artisan. Tonjolkan rasa lokal yang premium, hangat, dan cocok untuk anak muda. Gunakan nuansa cokelat karamel dengan tipografi yang berani.",
  },
  {
    id: "lunea-skincare",
    name: "Peluncuran Lunea Skincare",
    category: "Kecantikan",
    type: "skincare",
    status: "Dipilih",
    updated: "Diedit kemarin",
    hasResults: true,
    brandName: "Lunea",
    headline: "Lembut untuk kulitmu, setiap hari.",
    cta: "Temukan perawatanmu",
    primaryColor: "#e6a58b",
    format: "Instagram Post · 4:5",
    style: "Minimal",
    prompt:
      "Kampanye peluncuran skincare yang lembut untuk kulit sensitif. Visual bersih, feminin, tenang, dengan warna peach dan krem.",
  },
  {
    id: "koleksi-raya",
    name: "Koleksi Raya 2026",
    category: "Fashion",
    type: "fashion",
    status: "Draf",
    updated: "Diedit 3 hari lalu",
    hasResults: false,
    brandName: "Koleksi Raya",
    headline: "Rayakan hari istimewa dengan caramu.",
    cta: "Lihat koleksi",
    primaryColor: "#8fa694",
    format: "Instagram Post · 4:5",
    style: "Minimal",
    prompt:
      "Poster koleksi pakaian Hari Raya modern dengan siluet sederhana, warna sage, dan kesan editorial premium.",
  },
];

const concepts = [
  { name: "Human Narrative", agent: "Agent Aruna", description: "Cerita manusia yang autentik" },
  { name: "Kinetic Impact", agent: "Agent Bima", description: "Aksi sinematik dan diagonal" },
  { name: "Modular Explainer", agent: "Agent Citra", description: "Alur visual 3–5 tahap" },
  { name: "Catalog Matrix", agent: "Agent Dara", description: "Katalog modular 4–6 contoh" },
  { name: "Macro Craft", agent: "Agent Elang", description: "Detail proses dari dekat" },
  { name: "Bold Diptych", agent: "Agent Fajar", description: "Dua sisi dengan kontras tegas" },
  { name: "Spatial Journey", agent: "Agent Gita", description: "Rute dan ruang berlapis" },
  { name: "Mixed Collage", agent: "Agent Harsa", description: "Kolase ekspresif dan tak rapi" },
  { name: "Premium Sculpture", agent: "Agent Intan", description: "Minimal, ikonik, dan mewah" },
  { name: "Surreal Scale", agent: "Agent Jaya", description: "Metafora skala tak terduga" },
];

const copyDefaults = {
  "Makanan & Minuman": { headline: "Rasa yang layak dibagikan.", cta: "Pesan sekarang" },
  Kecantikan: { headline: "Perawatan yang terasa seperti dirimu.", cta: "Temukan sekarang" },
  Fashion: { headline: "Tampil dengan caramu sendiri.", cta: "Lihat koleksi" },
  Jasa: { headline: "Hasil nyata untuk langkah berikutnya.", cta: "Konsultasikan sekarang" },
  Teknologi: { headline: "Cara lebih cerdas untuk bergerak.", cta: "Coba sekarang" },
  Pendidikan: { headline: "Belajar hari ini, berkembang seterusnya.", cta: "Mulai belajar" },
  Kesehatan: { headline: "Langkah baik untuk dirimu.", cta: "Pelajari layanan" },
  Properti: { headline: "Ruang untuk cerita berikutnya.", cta: "Lihat properti" },
  Lainnya: { headline: "Ide baik, dibuat lebih berarti.", cta: "Pelajari selengkapnya" },
};

function getPosterFormatClass(format = "") {
  if (String(format).includes("9:16")) return "format-story";
  if (String(format).includes("1:1")) return "format-square";
  return "format-portrait";
}

function getPosterCopy(project = activeProject, conceptIndex = 0) {
  const defaults = copyDefaults[project?.category] || copyDefaults.Lainnya;
  const hasValue = (key) => project && Object.prototype.hasOwnProperty.call(project, key);
  return {
    brand: String(hasValue("brandName") ? project.brandName : (project?.name || "Brand lokal")).trim().slice(0, 60),
    headline: String(hasValue("headline") ? project.headline : defaults.headline).trim().slice(0, 100),
    cta: String(hasValue("cta") ? project.cta : defaults.cta).trim().slice(0, 50),
    logo: sanitizeLogoDataUrl(project?.brandLogo || ""),
    logoPosition: getProjectLogoPosition(project, conceptIndex),
  };
}

function getWorkspacePosterCopy(conceptIndex = selectedConcept ?? 0) {
  if (!$("#brand-input")) return getPosterCopy(activeProject, conceptIndex);
  return {
    brand: $("#brand-input").value.trim().slice(0, 60),
    headline: $("#headline-input").value.trim().slice(0, 100),
    cta: $("#cta-input").value.trim().slice(0, 50),
    logo: sanitizeLogoDataUrl(activeProject?.brandLogo || ""),
    logoPosition: getProjectLogoPosition(activeProject, conceptIndex),
  };
}

function getLibraryPosterCopy(item) {
  if (item?.posterCopy) {
    return {
      brand: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "brand") ? item.posterCopy.brand : (item.projectName || "Brand lokal")),
      headline: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "headline") ? item.posterCopy.headline : copyDefaults.Lainnya.headline),
      cta: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "cta") ? item.posterCopy.cta : copyDefaults.Lainnya.cta),
      logo: sanitizeLogoDataUrl(item.posterCopy.logo || item.brandLogo || ""),
      logoPosition: normalizeLogoPosition(item.posterCopy.logoPosition || item.logoPosition),
    };
  }
  return getPosterCopy({ name: item?.projectName, category: item?.category });
}

function posterCopyMarkup(copy, { draggableLogo = false, logoScope = "", logoKey = "" } = {}) {
  const headline = escapeHtml(copy.headline).replace(/\n/g, "<br>");
  const logo = sanitizeLogoDataUrl(copy.logo || "");
  const position = normalizeLogoPosition(copy.logoPosition);
  const logoStyle = `left:${position.x * 100}%;top:${position.y * 100}%;width:${position.width * 100}%;`;
  const editorData = draggableLogo ? `data-logo-draggable="true" data-logo-scope="${escapeHtml(logoScope)}" data-logo-key="${escapeHtml(logoKey)}"` : "";
  return `${logo ? `<div class="poster-brand-logo${draggableLogo ? " draggable" : ""}" style="${logoStyle}" data-logo-plate="pending" ${editorData}><img src="${escapeHtml(logo)}" alt="Logo brand" draggable="false" />${draggableLogo ? '<i class="logo-resize-handle" role="button" aria-label="Ubah ukuran logo" title="Drag untuk mengubah ukuran"></i>' : ""}</div>` : ""}${copy.brand ? `<small>${escapeHtml(copy.brand)}</small>` : ""}${headline ? `<strong>${headline}</strong>` : ""}${copy.cta ? `<span>${escapeHtml(copy.cta)}</span>` : ""}`;
}

function posterCopyClass(copy) {
  return (copy.brand || copy.headline || copy.cta) ? "poster-copy" : "poster-copy no-text";
}

function sanitizeLogoDataUrl(value = "") {
  const logo = String(value);
  return /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(logo) ? logo : "";
}

function normalizeLogoPosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const safeWidth = Number.isFinite(width) ? Math.min(0.42, Math.max(0.1, width)) : 0.22;
  return {
    x: Number.isFinite(x) ? Math.min(1 - safeWidth, Math.max(0, x)) : 0.71,
    y: Number.isFinite(y) ? Math.min(0.9, Math.max(0, y)) : 0.06,
    width: safeWidth,
  };
}

function getProjectLogoPosition(project, conceptIndex = 0) {
  const key = String(Math.max(0, Number(conceptIndex) || 0));
  const perConcept = project?.logoPositions && typeof project.logoPositions === "object" ? project.logoPositions[key] : null;
  return normalizeLogoPosition(perConcept || project?.logoPosition);
}

function setProjectLogoPosition(project, conceptIndex, value) {
  if (!project) return normalizeLogoPosition(value);
  const key = String(Math.max(0, Number(conceptIndex) || 0));
  if (!project.logoPositions || typeof project.logoPositions !== "object" || Array.isArray(project.logoPositions)) project.logoPositions = {};
  const normalized = normalizeLogoPosition(value);
  project.logoPositions[key] = normalized;
  return normalized;
}

const defaultColorGrade = Object.freeze({ brightness: 100, contrast: 100, saturation: 100, warmth: 0 });

function normalizeColorGrade(value) {
  const clamp = (input, minimum, maximum, fallback) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.round(number))) : fallback;
  };
  return {
    brightness: clamp(value?.brightness, 50, 150, defaultColorGrade.brightness),
    contrast: clamp(value?.contrast, 50, 150, defaultColorGrade.contrast),
    saturation: clamp(value?.saturation, 0, 200, defaultColorGrade.saturation),
    warmth: clamp(value?.warmth, -100, 100, defaultColorGrade.warmth),
  };
}

function getColorGradeFilter(value) {
  const grade = normalizeColorGrade(value);
  const warmth = Math.abs(grade.warmth) / 100;
  const temperature = grade.warmth >= 0
    ? `sepia(${(warmth * 0.22).toFixed(2)}) saturate(${(1 + warmth * 0.18).toFixed(2)})`
    : `sepia(${(warmth * 0.14).toFixed(2)}) hue-rotate(${Math.round(165 * warmth)}deg) saturate(${(1 + warmth * 0.12).toFixed(2)})`;
  return `brightness(${grade.brightness}%) contrast(${grade.contrast}%) saturate(${grade.saturation}%) ${temperature}`;
}

function inferLogoPositionFromPrompt(prompt, currentPosition) {
  const text = String(prompt).toLowerCase();
  const current = normalizeLogoPosition(currentPosition);
  const positions = [
    { terms: ["kiri atas", "top left", "upper left"], x: 0.06, y: 0.06 },
    { terms: ["kanan atas", "top right", "upper right"], x: 0.72, y: 0.06 },
    { terms: ["kiri bawah", "bottom left", "lower left"], x: 0.06, y: 0.82 },
    { terms: ["kanan bawah", "bottom right", "lower right"], x: 0.72, y: 0.82 },
    { terms: ["tengah atas", "top center", "atas tengah"], x: 0.39, y: 0.06 },
    { terms: ["tengah bawah", "bottom center", "bawah tengah"], x: 0.39, y: 0.82 },
    { terms: ["logo di tengah", "logo tengah", "center logo"], x: 0.39, y: 0.42 },
  ];
  const match = positions.find((candidate) => candidate.terms.some((term) => text.includes(term)));
  return match ? normalizeLogoPosition({ ...current, x: match.x, y: match.y }) : current;
}

function relativeLuminance(red, green, blue) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function analyzePixels(pixels, { ignoreTransparent = false } = {}) {
  const luminances = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  let totalWeight = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (ignoreTransparent && alpha < 0.2) continue;
    const weight = ignoreTransparent ? alpha : 1;
    const blendedRed = ignoreTransparent ? pixels[index] : pixels[index] * alpha + 255 * (1 - alpha);
    const blendedGreen = ignoreTransparent ? pixels[index + 1] : pixels[index + 1] * alpha + 255 * (1 - alpha);
    const blendedBlue = ignoreTransparent ? pixels[index + 2] : pixels[index + 2] * alpha + 255 * (1 - alpha);
    luminances.push(relativeLuminance(blendedRed, blendedGreen, blendedBlue));
    red += blendedRed * weight;
    green += blendedGreen * weight;
    blue += blendedBlue * weight;
    totalWeight += weight;
  }
  if (!luminances.length) return { luminances: [0.5], average: 0.5, variance: 0, rgb: [128, 128, 128] };
  const average = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  const variance = luminances.reduce((sum, value) => sum + (value - average) ** 2, 0) / luminances.length;
  return {
    luminances,
    average,
    variance,
    rgb: [Math.round(red / totalWeight), Math.round(green / totalWeight), Math.round(blue / totalWeight)],
  };
}

function contrastRatio(first, second) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function chooseLogoTreatment(surface, logo) {
  const weakShare = logo.luminances.filter((value) => contrastRatio(value, surface.average) < 2.4).length / logo.luminances.length;
  const busy = surface.variance > 0.055;
  if (weakShare < 0.28 && !busy) return { plate: "none", busy: false };
  const score = (plateLuminance) => logo.luminances.reduce((sum, value) => sum + Math.min(contrastRatio(value, plateLuminance), 7), 0) / logo.luminances.length;
  return { plate: score(0.96) >= score(0.025) ? "light" : "dark", busy };
}

function getElementPixelStats(image, { width = 64, height = 64, ignoreTransparent = false } = {}) {
  if (!image?.naturalWidth || !image?.naturalHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  return analyzePixels(context.getImageData(0, 0, canvas.width, canvas.height).data, { ignoreTransparent });
}

function updateAdaptiveLogo(logo) {
  const poster = logo.closest(".poster");
  const background = poster?.querySelector(".generated-image");
  const logoImage = logo.querySelector("img");
  if (!poster || !background || !logoImage) return;
  if (!background.complete || !background.naturalWidth) {
    background.addEventListener("load", () => updateAdaptiveLogo(logo), { once: true });
    return;
  }
  if (!logoImage.complete || !logoImage.naturalWidth) {
    logoImage.addEventListener("load", () => updateAdaptiveLogo(logo), { once: true });
    return;
  }
  try {
    const posterRect = poster.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    if (!posterRect.width || !posterRect.height || !logoRect.width || !logoRect.height) return;
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = Math.max(1, Math.round(96 * posterRect.height / posterRect.width));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const scale = Math.max(canvas.width / background.naturalWidth, canvas.height / background.naturalHeight);
    const drawWidth = background.naturalWidth * scale;
    const drawHeight = background.naturalHeight * scale;
    context.filter = background.style.filter || getComputedStyle(background).filter || "none";
    context.drawImage(background, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
    context.filter = "none";
    const sampleX = Math.max(0, Math.floor((logoRect.left - posterRect.left) / posterRect.width * canvas.width));
    const sampleY = Math.max(0, Math.floor((logoRect.top - posterRect.top) / posterRect.height * canvas.height));
    const sampleWidth = Math.max(1, Math.min(canvas.width - sampleX, Math.ceil(logoRect.width / posterRect.width * canvas.width)));
    const sampleHeight = Math.max(1, Math.min(canvas.height - sampleY, Math.ceil(logoRect.height / posterRect.height * canvas.height)));
    const surface = analyzePixels(context.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data);
    const logoStats = getElementPixelStats(logoImage, { width: 64, height: Math.max(16, 64 * logoImage.naturalHeight / logoImage.naturalWidth), ignoreTransparent: true });
    if (!logoStats) return;
    const treatment = chooseLogoTreatment(surface, logoStats);
    logo.dataset.logoPlate = treatment.plate;
    logo.dataset.logoBusy = String(treatment.busy);
    logo.dataset.logoSurface = surface.average < 0.38 ? "dark" : surface.average > 0.72 ? "light" : "mid";
    logo.style.setProperty("--logo-surface-rgb", surface.rgb.join(","));
  } catch {
    logo.dataset.logoPlate = "light";
  }
}

function updateAdaptiveLogos(root = document) {
  $$(".poster-brand-logo", root).forEach(updateAdaptiveLogo);
}

function scheduleAdaptiveLogos(root) {
  cancelAnimationFrame(scheduleAdaptiveLogos.frameId || 0);
  scheduleAdaptiveLogos.frameId = requestAnimationFrame(() => updateAdaptiveLogos(root));
}

let projects = [];
let libraryItems = [];
let activeProject = null;
let activeLibraryItemId = null;
let activeLibraryPreviewId = null;
let libraryPreviewZoom = 1;
let selectedConcept = null;
let selectedCategory = "Lainnya";
let generatedImages = [];
let generationInProgress = false;
let saveTimer = null;
let accountStateTimer = null;
let accountStateReady = false;
let currentUser = null;
let accountPreferences = null;
let accountMenuTrigger = null;
let apiHealth = { online: false, configured: false, model: null };
let usageState = null;
let selectedAgentIndexes = [0];
let pendingDeleteProjectId = null;
let csrfToken = "";
function cloneInspirationProjects() {
  return JSON.parse(JSON.stringify(inspirationProjects));
}

function loadLegacyArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

async function requestJson(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.message || `Permintaan gagal (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function getSignupDeviceIdentity() {
  let deviceId = localStorage.getItem("layera_device_id");
  if (!deviceId) {
    deviceId = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("layera_device_id", deviceId);
  }
  const screenValue = globalThis.screen ? `${screen.width}x${screen.height}x${screen.colorDepth}` : "screen-unknown";
  return {
    deviceId,
    deviceFingerprint: [navigator.userAgent, navigator.language, screenValue, Intl.DateTimeFormat().resolvedOptions().timeZone].join("|"),
  };
}

async function persistAccountState() {
  if (!accountStateReady || !currentUser) return;
  try {
    await requestJson("/api/state", {
      method: "PUT",
      body: JSON.stringify({ projects, library: libraryItems }),
    });
  } catch (error) {
    if (error.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      return;
    }
    showToast("Penyimpanan tertunda", error.message || "Data akun belum dapat disimpan.", "!");
  }
}

function scheduleAccountStateSave() {
  if (!accountStateReady || !currentUser) return;
  clearTimeout(accountStateTimer);
  accountStateTimer = setTimeout(persistAccountState, 250);
}

function saveProjects() {
  scheduleAccountStateSave();
}

function saveLibrary() {
  updateLibraryCount();
  scheduleAccountStateSave();
}

async function loadAccountState() {
  accountStateReady = false;
  const state = await requestJson("/api/state");
  if (state.initialized) {
    projects = Array.isArray(state.projects) ? state.projects : [];
    libraryItems = Array.isArray(state.library) ? state.library : [];
  } else {
    const legacyProjects = loadLegacyArray(LEGACY_STORAGE.projects);
    const legacyLibrary = loadLegacyArray(LEGACY_STORAGE.library);
    projects = legacyProjects || [];
    libraryItems = legacyLibrary || [];
    accountStateReady = true;
    await persistAccountState();
    localStorage.removeItem(LEGACY_STORAGE.projects);
    localStorage.removeItem(LEGACY_STORAGE.library);
  }
  accountStateReady = true;
}

function updateLibraryCount() {
  const count = libraryItems.length;
  if ($("#library-nav-count")) $("#library-nav-count").textContent = count;
  if ($("#library-count")) $("#library-count").textContent = `${count} desain`;
}

function isSubscriber() {
  return Boolean(usageState?.isPremium || usageState?.isSubscriber || ["premium", "subscriber"].includes(currentUser?.plan));
}

async function refreshUsage() {
  if (!currentUser || window.location.protocol === "file:") return;
  try {
    const data = await requestJson("/api/usage");
    usageState = data.usage;
    currentUser.plan = usageState.plan;
    updatePlanInterface();
  } catch (error) {
    if (error.status === 401) showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
  }
}

function updatePlanInterface() {
  const subscriber = isSubscriber();
  const planLabel = usageState?.planLabel || (subscriber ? "Layera Pro" : "Paket Gratis");
  $("#sidebar-plan-name").textContent = planLabel;
  $("#account-menu-plan").textContent = planLabel;
  const credits = usageState?.credits;
  $("#sidebar-plan-usage").textContent = `${credits?.remaining ?? (subscriber ? 200 : 11)} dari ${credits?.limit ?? (subscriber ? 200 : 11)} kredit tersisa`;
  const progress = $("#plan-card .plan-progress i");
  if (progress) progress.style.width = `${Math.max(0, Math.min(100, ((credits?.remaining ?? 0) / (credits?.limit || 1)) * 100))}%`;
  if (!subscriber && selectedAgentIndexes.length > 1) selectedAgentIndexes = [selectedAgentIndexes[0]];
  const qualitySelect = $("#quality-select");
  if (qualitySelect) {
    $$("option", qualitySelect).forEach((option) => { option.disabled = !subscriber && option.value !== "1mp"; });
    if (!subscriber && qualitySelect.value !== "1mp") qualitySelect.value = "1mp";
    $("#quality-plan-note").textContent = subscriber ? "Layera Pro mendukung 1MP, 2MP, dan 4MP." : "Paket Gratis mendukung hingga 1MP / HD.";
  }
  renderAgentSelector();
  updateGenerationControls();
}

function updateGenerationControls() {
  const count = Math.max(1, selectedAgentIndexes.length);
  const subscriber = isSubscriber();
  const quality = $("#quality-select")?.value || "1mp";
  const unitCost = { "1mp": 2, "2mp": 4, "4mp": 8 }[quality] || 2;
  const totalCost = count * unitCost;
  $("#generate-button-label").textContent = `Buat ${count} gambar`;
  $("#agent-plan-note").textContent = subscriber ? `Layera Pro: ${count} dari 10 agent dipilih` : "Paket gratis: pilih 1 agent";
  const note = $("#generation-cost-note");
  if (!note) return;
  const remaining = usageState?.credits?.remaining;
  note.textContent = remaining !== undefined && remaining < totalCost ? `Butuh ${totalCost} kredit · saldo tidak cukup` : `${quality.toUpperCase()} · ${totalCost} kredit`;
}

function showToast(title, message, icon = "✓") {
  const toast = $("#toast");
  $("span", toast).textContent = icon;
  $("strong", toast).textContent = title;
  $("small", toast).textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function checkApiHealth() {
  const status = $("#api-status");
  if (!status) return;

  if (window.location.protocol === "file:") {
    apiHealth = { online: false, configured: false, model: null };
    status.className = "private-note api-status offline";
    status.innerHTML = "<span>●</span> Jalankan npm start untuk mengaktifkan AI.";
    return;
  }

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("Health check gagal");
    const data = await response.json();
    apiHealth = { online: true, configured: Boolean(data.configured), model: data.model };
    updateGenerationControls();
    if (data.configured) {
      status.className = "private-note api-status connected";
      status.innerHTML = `<span>●</span> Aktif · ${escapeHtml(data.model || "Flux 2 Pro")}`;
    } else {
      status.className = "private-note api-status offline";
      const message = data.message || "REPLICATE_API_TOKEN belum diatur.";
      status.innerHTML = `<span>●</span> Server aktif · ${escapeHtml(message)}`;
    }
  } catch {
    apiHealth = { online: false, configured: false, model: null };
    status.className = "private-note api-status offline";
    status.innerHTML = "<span>●</span> Server AI tidak terhubung.";
  }
}

function getUserInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "KN").toUpperCase();
}

function updateUserInterface() {
  if (!currentUser) return;
  const initials = getUserInitials(currentUser.displayName);
  const firstName = currentUser.displayName.trim().split(/\s+/)[0] || "Kreator";
  $("#user-avatar").textContent = initials;
  $("#mobile-avatar").textContent = initials;
  $("#account-menu-avatar").textContent = initials;
  $("#account-menu-mini-avatar").textContent = initials;
  $("#user-name").textContent = currentUser.displayName;
  $("#user-email").textContent = currentUser.email;
  $("#account-menu-name").textContent = currentUser.displayName;
  $("#account-menu-current-name").textContent = currentUser.displayName;
  $("#account-menu-email").textContent = currentUser.email;
  $("#welcome-title").textContent = `Selamat Datang, ${firstName}.`;
}

function setAuthError(message = "") {
  const error = $("#auth-error");
  error.textContent = message;
  error.classList.toggle("is-hidden", !message);
}

function showAuthMode(mode = "login") {
  const registering = mode === "register";
  $("#login-heading").classList.toggle("is-hidden", registering);
  $("#login-form").classList.toggle("is-hidden", registering);
  $("#register-heading").classList.toggle("is-hidden", !registering);
  $("#register-form").classList.toggle("is-hidden", !registering);
  setAuthError();
  setTimeout(() => $(registering ? "#register-name" : "#email").focus(), 50);
}

function showAuthScreen(message = "") {
  clearTimeout(accountStateTimer);
  accountStateReady = false;
  currentUser = null;
  accountPreferences = null;
  usageState = null;
  csrfToken = "";
  selectedAgentIndexes = [0];
  projects = [];
  libraryItems = [];
  activeProject = null;
  generatedImages = [];
  closeAccountMenu();
  closeAllProjectsModal();
  closeHelpModal();
  closeAccountModal();
  $("#app-shell").classList.add("is-hidden");
  $("#auth-screen").classList.remove("is-hidden");
  showAuthMode("login");
  if (message) setAuthError(message);
}

async function enterApp(sessionData, { loadState = true } = {}) {
  currentUser = sessionData.user;
  csrfToken = sessionData.csrfToken || "";
  accountPreferences = sessionData.preferences || {
    defaultFormat: "Instagram Post · 4:5",
    defaultStyle: "Eksploratif",
    primaryColor: "#5a3529",
    startView: "dashboard",
  };
  updateUserInterface();
  if (loadState) await loadAccountState();
  $("#auth-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  renderProjects();
  renderLibrary();
  renderInspirations();
  updatePlanInterface();
  showView(accountPreferences.startView === "library" ? "library" : "dashboard");
  await refreshUsage();
  checkApiHealth();
}

function populateAccountModal() {
  if (!currentUser) return;
  $("#account-name").value = currentUser.displayName;
  $("#account-email").value = currentUser.email;
  $("#preference-format").value = accountPreferences.defaultFormat;
  $("#preference-style").value = accountPreferences.defaultStyle;
  $("#preference-color").value = accountPreferences.primaryColor;
  $("#preference-start-view").value = accountPreferences.startView;
}

function switchAccountTab(name) {
  $$(".account-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.accountTab === name));
  $$(".account-panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.dataset.accountPanel !== name));
}

function closeAccountMenu({ restoreFocus = false } = {}) {
  const popover = $("#account-popover");
  if (!popover) return;
  const trigger = accountMenuTrigger;
  popover.classList.add("is-hidden");
  popover.classList.remove("mobile-anchor");
  popover.setAttribute("aria-hidden", "true");
  ["#profile-button", "#mobile-profile-button"].forEach((selector) => {
    $(selector)?.setAttribute("aria-expanded", "false");
  });
  $("#profile-button")?.classList.remove("menu-open");
  accountMenuTrigger = null;
  if (restoreFocus) trigger?.focus();
}

function toggleAccountMenu(trigger) {
  if (!currentUser) return;
  const popover = $("#account-popover");
  const isOpen = !popover.classList.contains("is-hidden");
  if (isOpen) {
    closeAccountMenu();
    return;
  }

  accountMenuTrigger = trigger;
  popover.classList.toggle("mobile-anchor", trigger.id === "mobile-profile-button");
  popover.classList.remove("is-hidden");
  popover.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");
  if (trigger.id === "profile-button") trigger.classList.add("menu-open");
}

function openAccountModal(tab = "profile") {
  if (!currentUser) return;
  closeAccountMenu();
  populateAccountModal();
  switchAccountTab(tab);
  $("#account-modal").classList.remove("is-hidden");
  const focusTarget = {
    profile: "#account-name",
    preferences: "#preference-format",
    security: "#current-password",
  }[tab];
  setTimeout(() => $(focusTarget || "#account-name").focus(), 60);
}

function closeAccountModal() {
  $("#account-modal")?.classList.add("is-hidden");
  $("#password-form")?.reset();
}

async function performLogout() {
  closeAccountMenu();
  closeAccountModal();
  try {
    clearTimeout(accountStateTimer);
    await persistAccountState();
    await requestJson("/api/auth/logout", { method: "POST" });
  } catch {
    // Sesi lokal tetap ditutup meskipun server sedang tidak tersedia.
  }
  showAuthScreen();
  showToast("Kamu sudah keluar", "Sampai jumpa di sesi kreatif berikutnya.", "→");
}

function renderInspirations() {
  const grid = $("#inspiration-grid");
  if (!grid) return;
  grid.innerHTML = cloneInspirationProjects().map((project) => `
    <article class="inspiration-card" data-inspiration-id="${escapeHtml(project.id)}">
      <div class="project-preview ${escapeHtml(project.type)}"><i></i></div>
      <div class="inspiration-card-body">
        <div class="inspiration-card-meta"><i class="status-dot"></i>${escapeHtml(project.category)}</div>
        <h2>${escapeHtml(project.name)}</h2>
        <p>${escapeHtml(project.prompt)}</p>
        <button class="secondary-button" type="button">Gunakan inspirasi <span>→</span></button>
      </div>
    </article>`).join("");
  $$(".inspiration-card", grid).forEach((card) => {
    $("button", card).addEventListener("click", () => createProjectFromInspiration(card.dataset.inspirationId));
  });
}

function createProjectFromInspiration(inspirationId) {
  const source = inspirationProjects.find((project) => project.id === inspirationId);
  if (!source) return;
  const project = {
    ...JSON.parse(JSON.stringify(source)),
    id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: "Draf",
    updated: "Baru saja",
    hasResults: false,
    generatedImages: [],
    quality: "1mp",
    headlineMode: "manual",
    logoPositions: {},
    inspirationSource: source.id,
  };
  projects.unshift(project);
  saveProjects();
  renderProjects();
  openProject(project.id);
  showToast("Inspirasi siap dikembangkan", "Ubah brief, teks poster, dan agent agar sesuai dengan brand-mu.", "✦");
}

const promptSuggestionSets = {
  "Makanan & Minuman": [
    ["Audiens", "Audiens: pelanggan yang mencari pengalaman makan atau minum yang sesuai dengan kebiasaan mereka"],
    ["Momen", "Momen penggunaan: jelaskan kapan dan dalam situasi apa produk dinikmati"],
    ["Detail Visual", "Fokus visual: tekstur produk, bahan utama, penyajian, dan suasana yang menggugah selera"],
  ],
  Kecantikan: [
    ["Audiens", "Audiens: jelaskan kebutuhan kulit, rentang usia, dan kebiasaan perawatan yang dituju"],
    ["Manfaat", "Manfaat utama: tunjukkan hasil dan perasaan yang ingin diasosiasikan dengan produk"],
    ["Suasana", "Suasana visual: bersih, menenangkan, lembut, dan terasa terpercaya"],
  ],
  Fashion: [
    ["Audiens", "Audiens: jelaskan gaya hidup, karakter, dan kesempatan pemakaian koleksi"],
    ["Material", "Detail visual: tonjolkan siluet, material, tekstur kain, dan gerak"],
    ["Suasana", "Suasana visual: editorial, percaya diri, dan relevan dengan musim kampanye"],
  ],
  Jasa: [
    ["Audiens", "Audiens: jelaskan siapa yang membutuhkan layanan ini dan masalah yang sedang mereka hadapi"],
    ["Hasil", "Hasil utama: visualisasikan perubahan nyata yang diterima pelanggan setelah memakai layanan"],
    ["Konteks", "Konteks visual: tampilkan situasi, interaksi, atau lingkungan kerja yang relevan"],
  ],
  Teknologi: [
    ["Pengguna", "Pengguna: jelaskan siapa yang memakai teknologi ini dan dalam situasi apa"],
    ["Manfaat", "Manfaat utama: tunjukkan pekerjaan yang menjadi lebih mudah, cepat, aman, atau terhubung"],
    ["Suasana", "Suasana visual: modern dan manusiawi tanpa bergantung pada layar antarmuka atau teks"],
  ],
  Pendidikan: [
    ["Pelajar", "Pelajar: jelaskan usia, tingkat kemampuan, dan tujuan belajar yang dituju"],
    ["Perkembangan", "Hasil utama: gambarkan kemampuan atau rasa percaya diri yang berkembang"],
    ["Lingkungan", "Konteks visual: jelaskan suasana belajar, pengajar, aktivitas, dan lingkungan yang relevan"],
  ],
  Kesehatan: [
    ["Audiens", "Audiens: jelaskan kebutuhan kesehatan dan dukungan yang mereka cari tanpa membuat klaim berlebihan"],
    ["Kepercayaan", "Nilai utama: tonjolkan rasa aman, profesional, empatik, dan mudah diakses"],
    ["Konteks", "Konteks visual: tampilkan kebiasaan sehat, interaksi layanan, atau lingkungan perawatan yang relevan"],
  ],
  Properti: [
    ["Pengguna", "Pengguna: jelaskan calon penghuni, penyewa, pembeli, atau pelaku bisnis yang dituju"],
    ["Ruang", "Fokus visual: tonjolkan fungsi ruang, pencahayaan, material, dan lingkungan sekitar"],
    ["Gaya Hidup", "Manfaat utama: gambarkan pengalaman dan gaya hidup yang dimungkinkan oleh properti"],
  ],
  Lainnya: [
    ["Audiens", "Audiens: jelaskan siapa yang paling membutuhkan produk atau layanan ini"],
    ["Manfaat", "Manfaat utama: jelaskan perubahan atau hasil yang diterima pelanggan"],
    ["Suasana", "Suasana visual: jelaskan emosi, warna, material, dan konteks yang diinginkan"],
  ],
};

function renderPromptSuggestions() {
  const holder = $("#prompt-suggestion-buttons");
  if (!holder) return;
  const category = activeProject?.category || selectedCategory || "Lainnya";
  const suggestions = promptSuggestionSets[category] || promptSuggestionSets.Lainnya;
  holder.innerHTML = suggestions.map(([label, addition]) => `<button type="button" data-add="${escapeHtml(addition)}">+ ${escapeHtml(label)}</button>`).join("");
  $$("button", holder).forEach((button) => button.addEventListener("click", () => {
    const prompt = $("#prompt-input");
    const addition = button.dataset.add;
    if (prompt.value.includes(addition)) return;
    const nextValue = `${prompt.value.trim()}${prompt.value.trim() ? "\n\n" : ""}${addition}.`;
    prompt.value = nextValue.slice(0, 1000);
    updateCharacterCount();
    markSaving();
  }));
}

function renderAgentSelector() {
  const selector = $("#agent-selector");
  if (!selector) return;
  selector.innerHTML = concepts.map((concept, index) => `
    <button class="agent-option ${selectedAgentIndexes.includes(index) ? "selected" : ""}" type="button" data-agent-index="${index}" aria-pressed="${selectedAgentIndexes.includes(index)}" ${generationInProgress ? "disabled" : ""}>
      <b>${String(index + 1).padStart(2, "0")}</b><span><strong>${escapeHtml(concept.agent)}</strong><small>${escapeHtml(concept.name)}</small></span>
    </button>`).join("");
  $$(".agent-option", selector).forEach((button) => button.addEventListener("click", () => toggleAgentSelection(Number(button.dataset.agentIndex))));
}

function toggleAgentSelection(index) {
  if (generationInProgress) return;
  if (!Number.isInteger(index) || index < 0 || index >= concepts.length) return;
  if (!isSubscriber()) {
    selectedAgentIndexes = [index];
  } else if (selectedAgentIndexes.includes(index)) {
    if (selectedAgentIndexes.length === 1) {
      showToast("Pilih minimal satu agent", "Satu agent diperlukan untuk membuat gambar.", "!");
      return;
    }
    selectedAgentIndexes = selectedAgentIndexes.filter((candidate) => candidate !== index);
  } else {
    selectedAgentIndexes = [...selectedAgentIndexes, index].sort((a, b) => a - b);
  }
  if (activeProject) activeProject.agentIndexes = [...selectedAgentIndexes];
  renderAgentSelector();
  updateGenerationControls();
  markSaving();
}

function openUpgradeModal(message = "") {
  if (message) {
    $("#upgrade-modal-message").textContent = message;
  } else if (usageState?.credits?.resetAt) {
    const resetDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(usageState.credits.resetAt));
    $("#upgrade-modal-message").textContent = isSubscriber()
      ? `Kredit Layera Pro kamu tidak cukup untuk tindakan ini. Kredit berikutnya hadir pada ${resetDate}.`
      : `Kamu sudah menggunakan semua token kreatif yang ada.\n\nToken gratis selanjutnya akan hadir pada ${resetDate}.\n\nAyo upgrade ke pro agar dapat membuka potensial terbaik dari program ini, dapat membuat ~100 gambar, bebas memilih behavior agentic, dll.`;
  }
  $("#upgrade-modal").classList.remove("is-hidden");
  $("#upgrade-modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#upgrade-modal-close").focus(), 50);
}

function closeUpgradeModal() {
  $("#upgrade-modal")?.classList.add("is-hidden");
  $("#upgrade-modal")?.setAttribute("aria-hidden", "true");
}

function renderBrandLogoPreview() {
  const logo = sanitizeLogoDataUrl(activeProject?.brandLogo || "");
  const preview = $("#brand-logo-preview");
  if (!preview) return;
  preview.classList.toggle("is-hidden", !logo);
  $("img", preview).src = logo || "";
}

async function optimizeBrandLogo(file) {
  const supportedType = ["image/png", "image/jpeg", "image/jpg"].includes(file?.type);
  const supportedName = /\.(?:png|jpe?g)$/i.test(file?.name || "");
  if (!file || !supportedType || !supportedName) throw new Error("Gunakan file PNG, JPG, atau JPEG.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran logo maksimal 2 MB.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadPosterImage(sourceUrl);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensi logo tidak dapat dibaca.");

    const renderOptimizedLogo = (maxEdge) => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      removeConnectedLogoBackground(context, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    };

    let result = renderOptimizedLogo(512);
    if (result.length > 520000) result = renderOptimizedLogo(320);
    if (result.length > 520000) throw new Error("Logo masih terlalu kompleks. Gunakan file dengan dimensi lebih kecil.");
    return result;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function removeConnectedLogoBackground(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const borderSamples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  const addSample = (x, y) => {
    const offset = (y * width + x) * 4;
    borderSamples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]]);
  };
  for (let x = 0; x < width; x += step) {
    addSample(x, 0);
    if (height > 1) addSample(x, height - 1);
  }
  for (let y = step; y < height - 1; y += step) {
    addSample(0, y);
    if (width > 1) addSample(width - 1, y);
  }

  const transparentShare = borderSamples.filter((sample) => sample[3] < 32).length / Math.max(1, borderSamples.length);
  if (transparentShare > 0.55) return false;
  const opaqueSamples = borderSamples.filter((sample) => sample[3] >= 192);
  if (opaqueSamples.length < Math.max(8, borderSamples.length * 0.5)) return false;
  const median = (channel) => {
    const values = opaqueSamples.map((sample) => sample[channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const background = [median(0), median(1), median(2)];
  const distanceSquaredAt = (pixelIndex) => {
    const offset = pixelIndex * 4;
    const red = pixels[offset] - background[0];
    const green = pixels[offset + 1] - background[1];
    const blue = pixels[offset + 2] - background[2];
    return red * red + green * green + blue * blue;
  };
  const borderDistances = opaqueSamples
    .map((sample) => Math.hypot(sample[0] - background[0], sample[1] - background[1], sample[2] - background[2]))
    .sort((a, b) => a - b);
  const typicalVariation = borderDistances[Math.floor(borderDistances.length * 0.8)] || 0;
  const tolerance = Math.min(72, Math.max(24, typicalVariation + 12));
  const toleranceSquared = tolerance * tolerance;
  const uniformShare = borderDistances.filter((distance) => distance <= tolerance).length / borderDistances.length;
  if (uniformShare < 0.68) return false;

  const pixelCount = width * height;
  const connectedBackground = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let queueStart = 0;
  let queueEnd = 0;
  const enqueue = (pixelIndex) => {
    if (connectedBackground[pixelIndex]) return;
    const alpha = pixels[pixelIndex * 4 + 3];
    if (alpha > 20 && distanceSquaredAt(pixelIndex) > toleranceSquared) return;
    connectedBackground[pixelIndex] = 1;
    queue[queueEnd++] = pixelIndex;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (queueStart < queueEnd) {
    const pixelIndex = queue[queueStart++];
    const x = pixelIndex % width;
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < width - 1) enqueue(pixelIndex + 1);
    if (pixelIndex >= width) enqueue(pixelIndex - width);
    if (pixelIndex < pixelCount - width) enqueue(pixelIndex + width);
  }

  if (queueEnd < Math.max(4, pixelCount * 0.005)) return false;
  const featherLimit = tolerance + 36;
  const featherLimitSquared = featherLimit * featherLimit;
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const offset = pixelIndex * 4;
    if (connectedBackground[pixelIndex]) {
      pixels[offset + 3] = 0;
      continue;
    }
    const x = pixelIndex % width;
    const touchesBackground = (x > 0 && connectedBackground[pixelIndex - 1])
      || (x < width - 1 && connectedBackground[pixelIndex + 1])
      || (pixelIndex >= width && connectedBackground[pixelIndex - width])
      || (pixelIndex < pixelCount - width && connectedBackground[pixelIndex + width]);
    if (!touchesBackground || distanceSquaredAt(pixelIndex) >= featherLimitSquared) continue;
    const distance = Math.sqrt(distanceSquaredAt(pixelIndex));
    const opacity = Math.max(0, Math.min(1, (distance - tolerance) / (featherLimit - tolerance)));
    pixels[offset + 3] = Math.round(pixels[offset + 3] * opacity);
  }
  context.putImageData(imageData, 0, 0);
  return true;
}

function showView(name) {
  closeAccountMenu();
  $("#dashboard-view").classList.toggle("is-hidden", name !== "dashboard");
  $("#library-view").classList.toggle("is-hidden", name !== "library");
  $("#inspiration-view").classList.toggle("is-hidden", name !== "inspiration");
  $("#workspace-view").classList.toggle("is-hidden", name !== "workspace");
  if (name !== "workspace") clearSelection();
  $$(".side-nav .nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === name));
  $(".sidebar").classList.remove("mobile-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getLibraryItem(id) {
  return libraryItems.find((item) => item.id === id);
}

function getCurrentLibraryVersion(item) {
  if (!item || !Array.isArray(item.versions) || !item.versions.length) return null;
  return item.versions.find((version) => version.id === item.currentVersionId) || item.versions[0];
}

function renderLibrary() {
  const grid = $("#library-grid");
  if (!grid) return;
  updateLibraryCount();
  $("#library-empty").classList.toggle("is-hidden", libraryItems.length > 0);
  grid.classList.toggle("is-hidden", libraryItems.length === 0);

  grid.innerHTML = libraryItems
    .map((item) => {
      const conceptIndex = Math.max(0, Math.min(concepts.length - 1, Number(item.conceptIndex) || 0));
      const concept = concepts[conceptIndex];
      const versions = Array.isArray(item.versions) ? item.versions : [];
      const current = getCurrentLibraryVersion(item) || {};
      const imageSource = current.url || "";
      const posterCopy = getLibraryPosterCopy(item);
      const formatClass = getPosterFormatClass(item.format);
      const originalId = versions[0]?.id;
      const isOriginal = current.id === originalId;
      return `
        <article class="library-card" data-library-id="${escapeHtml(item.id)}">
          <div class="library-card-preview">
            <div class="poster poster-${conceptIndex + 1} ${formatClass} ${imageSource ? "api-poster" : ""}">
              ${imageSource ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="${escapeHtml(item.conceptName || concept.name)}" style="filter:${escapeHtml(getColorGradeFilter(current.colorGrade))}" />` : ""}
              <div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy)}</div>
            </div>
            <span class="library-version-badge">${isOriginal ? "ORIGINAL" : `VERSI ${versions.indexOf(current) + 1}`}</span>
          </div>
          <div class="library-card-body">
            <div class="library-card-title"><div><small>${escapeHtml(item.projectName || "Proyek Kanvas")}</small><h3>${escapeHtml(item.conceptName || concept.name)}</h3></div><span class="original-lock" title="Gambar awal terkunci">◆ Aman</span></div>
            <p>${escapeHtml(item.category || "Bisnis lokal")} · ${versions.length} versi</p>
            <div class="version-strip" aria-label="Pilih versi">
              ${versions.map((version, index) => `<button class="version-pill ${version.id === current.id ? "active" : ""}" data-version-id="${escapeHtml(version.id)}" type="button" title="${escapeHtml(version.refinement || "Gambar original")}">${index === 0 ? "Original" : `V${index + 1}`}</button>`).join("")}
            </div>
            <div class="library-card-actions">
              <button class="secondary-button library-preview-button" type="button">Preview</button>
              <button class="secondary-button library-download" type="button">Unduh</button>
              <button class="dark-button library-edit" type="button">✦ Edit salinan</button>
            </div>
          </div>
        </article>`;
    })
    .join("");

  updateAdaptiveLogos(grid);

  $$(".library-card", grid).forEach((card) => {
    const itemId = card.dataset.libraryId;
    $$(".version-pill", card).forEach((button) => button.addEventListener("click", () => selectLibraryVersion(itemId, button.dataset.versionId)));
    $(".library-preview-button", card).addEventListener("click", () => openLibraryPreview(itemId));
    $(".library-edit", card).addEventListener("click", () => openRefineDrawer(itemId));
    $(".library-download", card).addEventListener("click", () => downloadLibraryVersion(itemId));
  });
}

function selectLibraryVersion(itemId, versionId) {
  const item = getLibraryItem(itemId);
  if (!item || !item.versions.some((version) => version.id === versionId)) return;
  item.currentVersionId = versionId;
  saveLibrary();
  renderLibrary();
  if (activeLibraryPreviewId === itemId) renderLibraryPreview();
}

function updateLibraryPreviewZoom(value) {
  const numericValue = Number(value) || 1;
  libraryPreviewZoom = Math.min(2.5, Math.max(0.5, numericValue > 10 ? numericValue / 100 : numericValue));
  const shell = $("#library-preview-poster-shell");
  if (shell) shell.style.transform = `scale(${libraryPreviewZoom})`;
  const range = $("#library-zoom");
  if (range) range.value = String(Math.round(libraryPreviewZoom * 100));
  const output = $("#library-zoom-value");
  if (output) output.textContent = `${Math.round(libraryPreviewZoom * 100)}%`;
}

function renderLibraryPreview() {
  const item = getLibraryItem(activeLibraryPreviewId);
  const version = getCurrentLibraryVersion(item);
  if (!item || !version?.url) return closeLibraryPreview();
  const conceptIndex = Math.max(0, Math.min(concepts.length - 1, Number(item.conceptIndex) || 0));
  const poster = $("#library-preview-poster");
  const posterCopy = getLibraryPosterCopy(item);
  const versionIndex = item.versions.findIndex((candidate) => candidate.id === version.id);
  const grade = normalizeColorGrade(version.colorGrade);
  version.colorGrade = grade;
  $("#library-preview-title").textContent = item.conceptName || concepts[conceptIndex].name;
  $("#library-preview-version").textContent = `${item.projectName || "Proyek Kanvas"} · ${versionIndex === 0 ? "Original" : `Versi ${versionIndex + 1}`}`;
  poster.className = `poster poster-${conceptIndex + 1} ${getPosterFormatClass(item.format)} api-poster`;
  poster.innerHTML = `<img class="generated-image" src="${escapeHtml(version.url)}" alt="Preview penuh ${escapeHtml(item.conceptName || concepts[conceptIndex].name)}" style="filter:${escapeHtml(getColorGradeFilter(grade))}" /><div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy)}</div>`;
  updateAdaptiveLogos(poster);
  $$('[data-grade]', $("#library-preview-modal")).forEach((input) => {
    input.value = String(grade[input.dataset.grade]);
  });
  updateColorGradeOutputs(grade);
  updateLibraryPreviewZoom(libraryPreviewZoom);
}

function openLibraryPreview(itemId) {
  const item = getLibraryItem(itemId);
  if (!getCurrentLibraryVersion(item)?.url) {
    showToast("Preview belum tersedia", "Versi ini belum memiliki gambar yang bisa ditampilkan.", "!");
    return;
  }
  activeLibraryPreviewId = itemId;
  libraryPreviewZoom = 1;
  const modal = $("#library-preview-modal");
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  renderLibraryPreview();
  setTimeout(() => $("#library-preview-close").focus(), 50);
}

function closeLibraryPreview({ restoreFocus = false } = {}) {
  const modal = $("#library-preview-modal");
  if (!modal) return;
  const itemId = activeLibraryPreviewId;
  const wasOpen = !modal.classList.contains("is-hidden");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  activeLibraryPreviewId = null;
  libraryPreviewZoom = 1;
  if (wasOpen) renderLibrary();
  if (restoreFocus && itemId) setTimeout(() => $(`.library-card[data-library-id="${CSS.escape(itemId)}"] .library-preview-button`)?.focus(), 0);
}

function updateColorGradeOutputs(grade) {
  Object.entries(normalizeColorGrade(grade)).forEach(([key, value]) => {
    const output = $(`[data-grade-value="${key}"]`);
    if (output) output.textContent = key === "warmth" && value > 0 ? `+${value}` : String(value);
  });
}

function updateLibraryColorGrade() {
  const item = getLibraryItem(activeLibraryPreviewId);
  const version = getCurrentLibraryVersion(item);
  if (!item || !version) return;
  const values = {};
  $$('[data-grade]', $("#library-preview-modal")).forEach((input) => { values[input.dataset.grade] = input.value; });
  version.colorGrade = normalizeColorGrade(values);
  const filter = getColorGradeFilter(version.colorGrade);
  const previewImage = $("#library-preview-poster .generated-image");
  if (previewImage) previewImage.style.filter = filter;
  const cardImage = $(`.library-card[data-library-id="${CSS.escape(item.id)}"] .generated-image`);
  if (cardImage) cardImage.style.filter = filter;
  updateColorGradeOutputs(version.colorGrade);
  saveLibrary();
  scheduleAdaptiveLogos($("#library-preview-poster"));
}

function getProjectCardMarkup(project) {
  return `
    <article class="project-card" data-project-id="${escapeHtml(project.id)}" tabindex="0" role="button" aria-label="Buka ${escapeHtml(project.name)}">
      <div class="project-preview ${escapeHtml(project.type || "empty")}"><i></i></div>
      <div class="project-card-body">
        <h3>${escapeHtml(project.name)}</h3>
        <div class="project-meta"><i class="status-dot ${project.status === "Draf" ? "draft" : ""}"></i>${escapeHtml(project.status)}<span>·</span>${escapeHtml(project.category)}</div>
        <div class="project-card-actions"><span>${escapeHtml(project.updated)}</span><button class="project-options-button" type="button" aria-label="Opsi proyek" aria-expanded="false">•••</button></div>
        <div class="project-action-menu is-hidden" role="menu">
          <button type="button" data-project-action="duplicate" role="menuitem"><span>⧉</span> Duplikat</button>
          <button type="button" data-project-action="delete" class="danger" role="menuitem"><span>⌫</span> Hapus</button>
        </div>
      </div>
    </article>`;
}

function bindProjectCards(grid, { beforeOpen } = {}) {
  $$(".project-card", grid).forEach((card) => {
    const open = () => {
      beforeOpen?.();
      openProject(card.dataset.projectId);
    };
    card.addEventListener("click", (event) => {
      if (!event.target.closest(".project-options-button, .project-action-menu")) open();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    const optionsButton = $(".project-options-button", card);
    optionsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = $(".project-action-menu", card);
      const willOpen = menu.classList.contains("is-hidden");
      $$(".project-action-menu").forEach((candidate) => candidate.classList.add("is-hidden"));
      $$(".project-options-button").forEach((candidate) => candidate.setAttribute("aria-expanded", "false"));
      menu.classList.toggle("is-hidden", !willOpen);
      optionsButton.setAttribute("aria-expanded", String(willOpen));
    });
    $$("[data-project-action]", card).forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.dataset.projectAction === "duplicate") duplicateProject(card.dataset.projectId);
      if (button.dataset.projectAction === "delete") openDeleteProjectModal(card.dataset.projectId);
    }));
  });
}

function duplicateProject(projectId) {
  const source = projects.find((project) => project.id === projectId);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  copy.name = `${source.name} — Salinan`;
  copy.updated = "Baru saja";
  projects.unshift(copy);
  saveProjects();
  renderProjects();
  if (!$("#all-projects-modal").classList.contains("is-hidden")) renderAllProjects();
  showToast("Proyek diduplikasi", `${copy.name} sudah ditambahkan ke proyekmu.`, "⧉");
}

function openDeleteProjectModal(projectId) {
  const project = projects.find((candidate) => candidate.id === projectId);
  if (!project) return;
  pendingDeleteProjectId = projectId;
  $("#delete-project-name").textContent = project.name;
  $("#delete-project-modal").classList.remove("is-hidden");
  $("#delete-project-modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#confirm-delete-project").focus(), 50);
}

function closeDeleteProjectModal() {
  pendingDeleteProjectId = null;
  $("#delete-project-modal")?.classList.add("is-hidden");
  $("#delete-project-modal")?.setAttribute("aria-hidden", "true");
}

function deletePendingProject() {
  const project = projects.find((candidate) => candidate.id === pendingDeleteProjectId);
  if (!project) return closeDeleteProjectModal();
  const deletedProjectId = pendingDeleteProjectId;
  projects = projects.filter((candidate) => candidate.id !== deletedProjectId);
  const deletedActiveProject = activeProject?.id === deletedProjectId;
  closeDeleteProjectModal();
  saveProjects();
  renderProjects();
  if (!$("#all-projects-modal").classList.contains("is-hidden")) renderAllProjects();
  if (deletedActiveProject) {
    activeProject = null;
    showView("dashboard");
  }
  showToast("Proyek dihapus", `${project.name} dihapus. Item Library tetap aman.`, "⌫");
}

function renderProjectCards(grid, projectList, options) {
  grid.innerHTML = projectList.map(getProjectCardMarkup).join("");
  bindProjectCards(grid, options);
}

function renderProjects() {
  $("#project-count").textContent = `${projects.length} proyek`;
  renderProjectCards($("#project-grid"), projects.slice(0, 6));
}

function renderAllProjects() {
  const hasProjects = projects.length > 0;
  $("#all-projects-count").textContent = `${projects.length} proyek`;
  $("#all-projects-grid").classList.toggle("is-hidden", !hasProjects);
  $("#all-projects-empty").classList.toggle("is-hidden", hasProjects);
  renderProjectCards($("#all-projects-grid"), projects, { beforeOpen: closeAllProjectsModal });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function openProject(id) {
  activeProject = projects.find((project) => project.id === id);
  if (!activeProject) return;
  $("#workspace-name").textContent = activeProject.name;
  $("#workspace-category").textContent = activeProject.category;
  $("#prompt-input").value = activeProject.prompt || "";
  const posterCopy = getPosterCopy(activeProject);
  $("#brand-input").value = posterCopy.brand;
  $("#headline-input").value = posterCopy.headline;
  $("#cta-input").value = posterCopy.cta;
  setHeadlineMode(activeProject.headlineMode || "manual", { persist: false });
  const storedAgents = Array.isArray(activeProject.agentIndexes)
    ? activeProject.agentIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < concepts.length)
    : [];
  selectedAgentIndexes = storedAgents.length ? [...new Set(storedAgents)] : [0];
  if (!isSubscriber()) selectedAgentIndexes = [selectedAgentIndexes[0]];
  $("#color-control").value = activeProject.primaryColor || accountPreferences?.primaryColor || "#5a3529";
  $("#color-value").textContent = $("#color-control").value.toUpperCase();
  $("#format-select").value = activeProject.format || accountPreferences?.defaultFormat || "Instagram Post · 4:5";
  $("#quality-select").value = activeProject.quality || "1mp";
  if (!isSubscriber()) $("#quality-select").value = "1mp";
  const projectStyle = activeProject.style || accountPreferences?.defaultStyle || "Eksploratif";
  $$(".style-option").forEach((option) => option.classList.toggle("selected", option.dataset.style === projectStyle));
  generatedImages = Array.isArray(activeProject.generatedImages) ? [...activeProject.generatedImages] : [];
  updateCharacterCount();
  renderPromptSuggestions();
  renderAgentSelector();
  updateGenerationControls();
  renderBrandLogoPreview();
  clearSelection();
  showView("workspace");

  if (activeProject.hasResults) {
    $("#empty-results").classList.add("is-hidden");
    renderConcepts(false, generatedImages);
    const resultCount = generatedImages.filter((image) => image?.url).length;
    $("#results-subtitle").textContent = `${resultCount || selectedAgentIndexes.length} gambar dibuat dari brief-mu.`;
  } else {
    $("#results-grid").innerHTML = "";
    $("#empty-results").classList.remove("is-hidden");
    $("#results-subtitle").textContent = "Hasil kreasimu akan tampil di sini.";
  }
}

function openProjectModal() {
  closeAllProjectsModal();
  selectedCategory = "Lainnya";
  $$(".category-option").forEach((option) => option.classList.toggle("selected", option.dataset.category === selectedCategory));
  $("#project-name").value = "";
  $("#project-modal").classList.remove("is-hidden");
  setTimeout(() => $("#project-name").focus(), 80);
}

function closeProjectModal() {
  $("#project-modal").classList.add("is-hidden");
}

function openAllProjectsModal() {
  closeAccountMenu();
  renderAllProjects();
  $("#all-projects-modal").classList.remove("is-hidden");
  $("#all-projects-modal").setAttribute("aria-hidden", "false");
  $("#view-all").setAttribute("aria-expanded", "true");
  setTimeout(() => $("#all-projects-close").focus(), 60);
}

function closeAllProjectsModal({ restoreFocus = false } = {}) {
  const modal = $("#all-projects-modal");
  if (!modal) return;
  const wasOpen = !modal.classList.contains("is-hidden");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  $("#view-all")?.setAttribute("aria-expanded", "false");
  if (restoreFocus && wasOpen) setTimeout(() => $("#view-all")?.focus(), 0);
}

function openHelpModal() {
  closeAccountMenu();
  closeAllProjectsModal();
  $(".sidebar").classList.remove("mobile-open");
  $("#help-modal").classList.remove("is-hidden");
  $("#help-modal").setAttribute("aria-hidden", "false");
  $("#help-button").setAttribute("aria-expanded", "true");
  setTimeout(() => $("#help-modal-close").focus(), 60);
}

function closeHelpModal({ restoreFocus = false } = {}) {
  const modal = $("#help-modal");
  if (!modal) return;
  const wasOpen = !modal.classList.contains("is-hidden");
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
  $("#help-button")?.setAttribute("aria-expanded", "false");
  if (restoreFocus && wasOpen) setTimeout(() => $("#help-button")?.focus(), 0);
}

function renderConcepts(loading = false, images = generatedImages) {
  const formatClass = getPosterFormatClass($("#format-select")?.value || activeProject?.format);
  const completedIndexes = concepts.map((_, index) => index).filter((index) => images[index]);
  const visibleIndexes = loading ? selectedAgentIndexes : (completedIndexes.length ? completedIndexes : selectedAgentIndexes);
  $("#results-grid").innerHTML = visibleIndexes
    .map((index) => {
      const concept = concepts[index];
      const image = images[index];
      const imageSource = image && (image.displayUrl || image.url);
      const isLoading = loading && !imageSource && !(image && image.error);
      const hasApiImage = Boolean(imageSource);
      const posterCopy = getWorkspacePosterCopy(index);
      return `
        <article class="concept-card ${selectedConcept === index ? "selected" : ""} ${isLoading ? "loading" : ""} ${image && image.error ? "generation-error" : ""}" data-concept="${index}" tabindex="${isLoading ? -1 : 0}" role="button" aria-label="Pilih konsep ${index + 1}: ${concept.name}">
          <span class="concept-check">✓</span>
          <div class="poster poster-${index + 1} ${formatClass} ${hasApiImage ? "api-poster" : ""}">
            ${hasApiImage ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="Hasil visual ${escapeHtml(concept.name)}" />` : ""}
            <div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy, { draggableLogo: hasApiImage && !isLoading, logoScope: "project", logoKey: index })}</div>
          </div>
          <div class="concept-meta"><span>${String(index + 1).padStart(2, "0")} · ${concept.name}</span><small>${image && image.error ? "Gagal · coba lagi" : concept.agent}</small></div>
        </article>`;
    })
    .join("");

  bindLogoEditing($("#results-grid"));
  updateAdaptiveLogos($("#results-grid"));

  $$(".concept-card:not(.loading)").forEach((card) => {
    if (!card.classList.contains("generation-error")) {
      const select = () => selectConcept(Number(card.dataset.concept));
      card.addEventListener("click", select);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") select();
      });
    }
  });
}

function getEditableLogoPosition(logo) {
  if (logo.dataset.logoScope === "library") {
    const item = getLibraryItem(logo.dataset.logoKey);
    return normalizeLogoPosition(getLibraryPosterCopy(item).logoPosition);
  }
  return getProjectLogoPosition(activeProject, Number(logo.dataset.logoKey));
}

function storeEditableLogoPosition(logo, value) {
  const normalized = normalizeLogoPosition(value);
  if (logo.dataset.logoScope === "library") {
    const item = getLibraryItem(logo.dataset.logoKey);
    if (!item) return normalized;
    item.posterCopy = { ...getLibraryPosterCopy(item), logoPosition: normalized };
    return normalized;
  }
  return setProjectLogoPosition(activeProject, Number(logo.dataset.logoKey), normalized);
}

function applyLogoElementPosition(logo, position) {
  logo.style.left = `${position.x * 100}%`;
  logo.style.top = `${position.y * 100}%`;
  logo.style.width = `${position.width * 100}%`;
}

function finishLogoEditing(logo, root) {
  logo.classList.remove("dragging", "resizing");
  updateAdaptiveLogo(logo);
  if (logo.dataset.logoScope === "library") saveLibrary();
  else markSaving();
  scheduleAdaptiveLogos(root);
}

function bindLogoEditing(root) {
  if (!root) return;
  $$('[data-logo-draggable="true"]', root).forEach((logo) => {
    logo.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (logo.dataset.logoScope !== "library" && !activeProject)) return;
      if (event.target.closest(".logo-resize-handle")) return;
      event.preventDefault();
      event.stopPropagation();
      const poster = logo.closest(".poster");
      const posterRect = poster.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const offsetX = event.clientX - logoRect.left;
      const offsetY = event.clientY - logoRect.top;
      logo.setPointerCapture?.(event.pointerId);
      logo.classList.add("dragging");

      const move = (moveEvent) => {
        const current = getEditableLogoPosition(logo);
        const next = storeEditableLogoPosition(logo, {
          ...current,
          x: (moveEvent.clientX - posterRect.left - offsetX) / posterRect.width,
          y: (moveEvent.clientY - posterRect.top - offsetY) / posterRect.height,
        });
        applyLogoElementPosition(logo, next);
        scheduleAdaptiveLogos(logo.closest(".poster"));
      };
      const finish = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", finish);
        document.removeEventListener("pointercancel", finish);
        finishLogoEditing(logo, root);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", finish, { once: true });
      document.addEventListener("pointercancel", finish, { once: true });
    });

    const handle = $(".logo-resize-handle", logo);
    handle?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (logo.dataset.logoScope !== "library" && !activeProject)) return;
      event.preventDefault();
      event.stopPropagation();
      const poster = logo.closest(".poster");
      const posterRect = poster.getBoundingClientRect();
      const startX = event.clientX;
      const start = getEditableLogoPosition(logo);
      handle.setPointerCapture?.(event.pointerId);
      logo.classList.add("resizing");

      const resize = (moveEvent) => {
        const next = storeEditableLogoPosition(logo, {
          ...start,
          width: start.width + (moveEvent.clientX - startX) / posterRect.width,
        });
        applyLogoElementPosition(logo, next);
        scheduleAdaptiveLogos(poster);
      };
      const finishResize = () => {
        document.removeEventListener("pointermove", resize);
        document.removeEventListener("pointerup", finishResize);
        document.removeEventListener("pointercancel", finishResize);
        finishLogoEditing(logo, root);
      };
      document.addEventListener("pointermove", resize);
      document.addEventListener("pointerup", finishResize, { once: true });
      document.addEventListener("pointercancel", finishResize, { once: true });
    });
  });
}

function selectConcept(index) {
  selectedConcept = index;
  $$(".concept-card").forEach((card) => card.classList.toggle("selected", Number(card.dataset.concept) === index));
  const selected = concepts[index];
  $("#selected-name").textContent = `Konsep ${String(index + 1).padStart(2, "0")} · ${selected.name}`;
  const thumb = $("#selection-bar .selected-thumb");
  const image = generatedImages[index];
  const imageSource = image && (image.displayUrl || image.url);
  thumb.className = `selected-thumb poster poster-${index + 1} ${getPosterFormatClass($("#format-select").value)} ${imageSource ? "api-poster" : ""}`;
  const thumbCopy = getWorkspacePosterCopy(index);
  thumb.innerHTML = `${imageSource ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="" />` : ""}<div class="${posterCopyClass(thumbCopy)}">${posterCopyMarkup(thumbCopy)}</div>`;
  updateAdaptiveLogos(thumb);
  const savedItem = findSavedSelection(index);
  $("#save-library-button").textContent = savedItem ? "✓ Sudah di Library" : "◇ Simpan ke Library";
  $("#selection-bar").classList.remove("is-hidden");
}

function clearSelection() {
  selectedConcept = null;
  $$(".concept-card.selected").forEach((card) => card.classList.remove("selected"));
  $("#selection-bar").classList.add("is-hidden");
}

function findSavedSelection(index = selectedConcept) {
  if (index === null || !activeProject) return null;
  const image = generatedImages[index];
  const sourceUrl = image?.url || "";
  return libraryItems.find((item) => item.projectId === activeProject.id && Number(item.conceptIndex) === index && (item.sourceUrl || "") === sourceUrl);
}

function saveSelectedToLibrary() {
  if (selectedConcept === null || !activeProject) {
    showToast("Pilih desain terlebih dahulu", "Klik salah satu hasil generasi yang ingin disimpan.", "!");
    return;
  }

  const existing = findSavedSelection();
  if (existing) {
    existing.posterCopy = getWorkspacePosterCopy(selectedConcept);
    existing.primaryColor = $("#color-control").value;
    saveLibrary();
    renderLibrary();
    showView("library");
    showToast("Teks poster diperbarui", "Copy terbaru diterapkan tanpa membuat ulang key visual.", "✓");
    return;
  }

  const image = generatedImages[selectedConcept] || {};
  if (!image.url) {
    showToast("Belum ada key visual AI", "Buat gambar terlebih dahulu sebelum menyimpan desain ke Library.", "!");
    return;
  }
  const concept = concepts[selectedConcept];
  const createdAt = new Date().toISOString();
  const itemId = `library-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const originalVersionId = `${itemId}-v1`;
  const sourceUrl = image.url || "";
  libraryItems.unshift({
    id: itemId,
    projectId: activeProject.id,
    projectName: activeProject.name,
    category: activeProject.category,
    prompt: $("#prompt-input").value.trim(),
    format: $("#format-select").value,
    style: $(".style-option.selected strong")?.textContent || "Eksploratif",
    primaryColor: $("#color-control").value,
    quality: $("#quality-select").value,
    posterCopy: getWorkspacePosterCopy(selectedConcept),
    conceptIndex: selectedConcept,
    conceptName: concept.name,
    agent: concept.agent,
    sourceUrl,
    createdAt,
    currentVersionId: originalVersionId,
    versions: [{ id: originalVersionId, url: sourceUrl, refinement: "", createdAt, immutable: true, colorGrade: { ...defaultColorGrade } }],
  });
  saveLibrary();
  renderLibrary();
  $("#save-library-button").textContent = "✓ Sudah di Library";
  showToast("Tersimpan ke Library", "Original dikunci. Editing berikutnya akan dibuat sebagai versi baru.", "◇");
}

async function startGeneration() {
  if (generationInProgress) return;
  const prompt = $("#prompt-input").value.trim();
  const requestId = globalThis.crypto?.randomUUID?.() || `generation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (prompt.length < 20) {
    showToast("Brief masih terlalu singkat", "Tambahkan sedikit detail tentang produk atau audiensmu.", "!");
    $("#prompt-input").focus();
    return;
  }

  if (activeProject?.headlineMode === "ai") await suggestHeadline({ silent: true });

  const requestedQuality = $("#quality-select").value;
  const requestedCreditCost = selectedAgentIndexes.length * ({ "1mp": 2, "2mp": 4, "4mp": 8 }[requestedQuality] || 2);
  if (usageState?.generation?.exhausted || (usageState?.credits && usageState.credits.remaining < requestedCreditCost)) {
    openUpgradeModal();
    return;
  }
  if (activeProject?.brandLogo) {
    const storedPositions = activeProject.logoPositions && typeof activeProject.logoPositions === "object" ? activeProject.logoPositions : {};
    selectedAgentIndexes.forEach((index) => {
      if (!Object.prototype.hasOwnProperty.call(storedPositions, String(index))) {
        setProjectLogoPosition(activeProject, index, inferLogoPositionFromPrompt(prompt, getProjectLogoPosition(activeProject, index)));
      }
    });
  }

  if (window.location.protocol === "file:") {
    showToast("Server AI belum berjalan", "Jalankan npm start lalu buka http://localhost:8000.", "!");
    return;
  }

  const previousImages = [...generatedImages];
  const requestedAgentIndexes = [...selectedAgentIndexes];
  const requestedCount = requestedAgentIndexes.length;
  const imageModelLabel = "Flux 2 Pro";
  generationInProgress = true;
  generatedImages = Array(10).fill(null);
  clearSelection();
  $("#empty-results").classList.add("is-hidden");
  $("#generation-progress").classList.remove("is-hidden");
  $("#generate-button").disabled = true;
  renderConcepts(true, generatedImages);
  $("#results-subtitle").textContent = `${imageModelLabel} mengeksplorasi ${requestedCount} arah visual.`;
  const progressTitle = $("#progress-title");
  if (progressTitle) progressTitle.textContent = `${imageModelLabel} sedang membuat key visual...`;
  setGenerationProgress(3, `Menyiapkan ${imageModelLabel} dan ${requestedCount} agent kreatif`);

  try {
    const selectedStyle = $(".style-option.selected strong")?.textContent || "Eksploratif";
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        requestId,
        prompt,
        projectName: activeProject?.name || "Proyek Kanvas",
        category: activeProject?.category || "Bisnis lokal",
        format: $("#format-select").value,
        style: selectedStyle,
        primaryColor: $("#color-control").value,
        agentIndexes: requestedAgentIndexes,
        quality: requestedQuality,
        brandName: $("#brand-input").value.trim() || activeProject?.name || "",
      }),
    });

    if (response.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      throw new Error("Sesi login telah berakhir.");
    }

    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch {
        errorData.message = `Server merespons dengan status ${response.status}.`;
      }
      const requestError = new Error(errorData.message || "Generasi gambar gagal.");
      requestError.data = errorData;
      throw requestError;
    }

    if (!response.body) throw new Error("Browser tidak mendukung streaming hasil gambar.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    let completedImages = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "start") {
          if (event.requestId !== requestId || Number(event.promptLength) !== prompt.length) {
            throw new Error("Backend menerima brief yang tidak cocok. Muat ulang halaman lalu coba lagi.");
          }
          apiHealth.model = event.model;
          setGenerationProgress(5, `Brief diterima utuh (${event.promptLength} karakter) · ${event.model}`);
        }
        if (event.type === "progress") {
          const percent = Math.min(92, 8 + (completedImages / requestedCount) * 82);
          setGenerationProgress(percent, `${imageModelLabel} mengeksplorasi arah ${event.name}`);
        }
        if (event.type === "image") {
          generatedImages[event.index] = {
            url: event.url,
            displayUrl: event.displayUrl,
            name: event.name,
            agent: event.agent,
          };
          renderConcepts(true, generatedImages);
          completedImages += 1;
          const percent = Math.min(96, 10 + (completedImages / requestedCount) * 86);
          setGenerationProgress(Math.round(percent), `${completedImages} dari ${requestedCount} gambar selesai`);
        }
        if (event.type === "image_error") {
          generatedImages[event.index] = { error: true, message: event.message };
          renderConcepts(true, generatedImages);
        }
        if (event.type === "done") {
          if (event.requestId !== requestId) throw new Error("Respons generasi tidak cocok dengan permintaan ini.");
          completed = true;
          finishGeneration(event.success, event.failed, event.firstError, event.usage);
        }
      }
    }

    if (!completed) {
      throw new Error("Koneksi terputus sebelum semua agent selesai.");
    }
  } catch (error) {
    if (error.data?.usage) {
      usageState = error.data.usage;
      updatePlanInterface();
    }
    if (error.data?.upgradeRequired) openUpgradeModal(error.message);
    const hasNewImages = generatedImages.some((image) => image && image.url);
    if (!hasNewImages) generatedImages = previousImages;
    renderConcepts(false, generatedImages);
    $("#generation-progress").classList.add("is-hidden");
    $("#generate-button").disabled = false;
    $("#results-subtitle").textContent = "Generasi belum selesai. Brief-mu tetap tersimpan.";
    const fallback = "Periksa REPLICATE_API_TOKEN, saldo Replicate, atau status prediction Flux 2 Pro.";
    showToast("Generasi AI gagal", error.message || fallback, "!");
  } finally {
    generationInProgress = false;
    renderAgentSelector();
  }
}

function setGenerationProgress(percent, label) {
  $("#progress-percent").textContent = `${percent}%`;
  $("#progress-label").textContent = label;
  $("#progress-bar").style.width = `${percent}%`;
}

function finishGeneration(reportedSuccess = 0, reportedFailed = 0, firstError = "", latestUsage = null) {
  if (latestUsage) {
    usageState = latestUsage;
    updatePlanInterface();
  }
  const receivedSuccess = generatedImages.filter((image) => image && (image.url || image.displayUrl)).length;
  const successCount = Math.max(Number(reportedSuccess) || 0, receivedSuccess);
  const failedCount = Math.max(Number(reportedFailed) || 0, generatedImages.filter((image) => image?.error).length);
  renderConcepts(false, generatedImages);
  $("#generation-progress").classList.add("is-hidden");
  $("#generate-button").disabled = false;
  $("#results-subtitle").textContent = failedCount > 0 ? `${successCount} gambar selesai · ${failedCount} gagal.` : `${successCount} gambar AI dibuat dari brief-mu.`;
  if (activeProject) {
    activeProject.hasResults = successCount > 0;
    activeProject.status = `${successCount} gambar`;
    activeProject.updated = "Baru saja";
    activeProject.prompt = $("#prompt-input").value.trim();
    activeProject.format = $("#format-select").value;
    activeProject.style = $(".style-option.selected")?.dataset.style || "Eksploratif";
    const posterCopy = getWorkspacePosterCopy();
    activeProject.brandName = posterCopy.brand;
    activeProject.headline = posterCopy.headline;
    activeProject.cta = posterCopy.cta;
    activeProject.primaryColor = $("#color-control").value;
    activeProject.quality = $("#quality-select").value;
    activeProject.brandLogo = sanitizeLogoDataUrl(activeProject.brandLogo || "");
    activeProject.agentIndexes = [...selectedAgentIndexes];
    activeProject.generatedImages = generatedImages.map((image) => (image && image.url ? { url: image.url } : null));
    saveProjects();
  }
  if (successCount > 0) {
    const message = failedCount > 0 ? `${failedCount} gambar gagal, tetapi hasil yang selesai tetap dapat dipilih.` : "Pilih satu desain yang paling mewakili bisnismu.";
    showToast(`${successCount} gambar sudah siap`, message, "✦");
  } else {
    const cardError = generatedImages.find((image) => image?.error)?.message || "";
    const conciseError = String(firstError || cardError).split("\n")[0].slice(0, 220);
    const providerMessage = "Periksa API token, billing, rate limit, atau halaman prediction pada akun Replicate.";
    showToast("Belum ada gambar yang selesai", conciseError || providerMessage, "!");
  }
}

function updateCharacterCount() {
  $("#char-count").textContent = $("#prompt-input").value.length;
}

function setHeadlineMode(mode, { persist = true } = {}) {
  const normalized = mode === "ai" ? "ai" : "manual";
  if (activeProject) activeProject.headlineMode = normalized;
  $$('[data-headline-mode]').forEach((button) => {
    const active = button.dataset.headlineMode === normalized;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const input = $("#headline-input");
  if (input) input.readOnly = normalized === "ai";
  $("#generate-headline")?.classList.toggle("is-hidden", normalized !== "ai");
  if (persist) markSaving();
}

async function suggestHeadline({ silent = false } = {}) {
  if (!activeProject) return false;
  const button = $("#generate-headline");
  const originalMarkup = button?.innerHTML || "✦ Buat headline dari brief";
  if (button) {
    button.disabled = true;
    button.textContent = "Menyusun headline...";
  }
  try {
    const data = await requestJson("/api/headline-suggest", {
      method: "POST",
      body: JSON.stringify({
        prompt: $("#prompt-input").value.trim(),
        projectName: activeProject.name || "",
        category: activeProject.category || "Lainnya",
        brand: $("#brand-input").value.trim(),
        variation: Date.now(),
      }),
    });
    $("#headline-input").value = String(data.headline || "").slice(0, 100);
    activeProject.headline = $("#headline-input").value;
    markSaving();
    if (activeProject.hasResults) renderConcepts(false, generatedImages);
    if (!silent) showToast("Headline siap", "Headline dibuat dari brief dan bisa dibuat ulang kapan saja.", "✦");
    return true;
  } catch (error) {
    showToast("Headline belum dapat dibuat", silent ? "Headline terakhir tetap digunakan untuk generasi ini." : (error.message || "Periksa brief dan koneksi server."), "!");
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalMarkup;
    }
  }
}

function markSaving() {
  if (!activeProject) return;
  $("#save-status").innerHTML = "<i></i> Menyimpan...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    activeProject.prompt = $("#prompt-input").value;
    activeProject.format = $("#format-select").value;
    activeProject.style = $(".style-option.selected")?.dataset.style || "Eksploratif";
    const posterCopy = getWorkspacePosterCopy();
    activeProject.brandName = posterCopy.brand;
    activeProject.headline = posterCopy.headline;
    activeProject.headlineMode = activeProject.headlineMode === "ai" ? "ai" : "manual";
    activeProject.cta = posterCopy.cta;
    activeProject.primaryColor = $("#color-control").value;
    activeProject.quality = $("#quality-select").value;
    activeProject.brandLogo = sanitizeLogoDataUrl(activeProject.brandLogo || "");
    activeProject.agentIndexes = [...selectedAgentIndexes];
    saveProjects();
    $("#save-status").innerHTML = "<i></i> Tersimpan";
  }, 700);
}

function openRefineDrawer(itemId) {
  const item = getLibraryItem(itemId);
  if (!item) {
    showToast("Simpan ke Library terlebih dahulu", "Editing hanya tersedia untuk salinan yang sudah masuk Library.", "!");
    return;
  }
  activeLibraryItemId = itemId;
  const conceptIndex = Math.max(0, Math.min(concepts.length - 1, Number(item.conceptIndex) || 0));
  const currentVersion = getCurrentLibraryVersion(item);
  const imageSource = currentVersion?.url || "";
  const poster = $("#drawer-poster");
  poster.className = `poster poster-${conceptIndex + 1} ${getPosterFormatClass(item.format)} ${imageSource ? "api-poster" : ""}`;
  const drawerCopy = getLibraryPosterCopy(item);
  poster.innerHTML = `${imageSource ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="" style="filter:${escapeHtml(getColorGradeFilter(currentVersion?.colorGrade))}" />` : ""}<div class="${posterCopyClass(drawerCopy)}">${posterCopyMarkup(drawerCopy, { draggableLogo: Boolean(imageSource && drawerCopy.logo), logoScope: "library", logoKey: item.id })}</div>`;
  bindLogoEditing(poster);
  updateAdaptiveLogos(poster);
  const versionNumber = Math.max(1, item.versions.findIndex((version) => version.id === currentVersion?.id) + 1);
  $("#drawer-version-meta").textContent = `Mengedit versi ${versionNumber}. Hasilnya akan disimpan sebagai V${item.versions.length + 1}; original tetap aman.`;
  $("#drawer-scrim").classList.remove("is-hidden");
  $("#refine-drawer").classList.add("open");
  $("#refine-drawer").setAttribute("aria-hidden", "false");
}

function closeRefineDrawer() {
  const shouldRefresh = Boolean(activeLibraryItemId && $("#refine-drawer").classList.contains("open"));
  $("#drawer-scrim").classList.add("is-hidden");
  $("#refine-drawer").classList.remove("open");
  $("#refine-drawer").setAttribute("aria-hidden", "true");
  if (shouldRefresh) renderLibrary();
  activeLibraryItemId = null;
}

async function regenerateSelected() {
  const libraryItem = getLibraryItem(activeLibraryItemId);
  if (!libraryItem) {
    closeRefineDrawer();
    showToast("Item Library tidak ditemukan", "Simpan desain ke Library sebelum melakukan editing.", "!");
    return;
  }
  const input = $("#refine-input");
  if (!input.value.trim()) {
    input.focus();
    showToast("Tuliskan perubahanmu", "Cukup satu detail kecil agar hasil tetap konsisten.", "✦");
    return;
  }
  if (usageState?.refinement?.exhausted || (usageState?.credits && usageState.credits.remaining < 3)) {
    openUpgradeModal();
    return;
  }
  if (window.location.protocol === "file:") {
    showToast("Server AI belum berjalan", "Buka aplikasi melalui http://localhost:8000.", "!");
    return;
  }
  const button = $("#regenerate-button");
  button.disabled = true;
  $("strong", button).textContent = "Membuat variasi...";

  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        prompt: libraryItem.prompt,
        refinement: input.value.trim(),
        conceptIndex: libraryItem.conceptIndex,
        projectName: libraryItem.projectName || "Proyek Kanvas",
        category: libraryItem.category || "Bisnis lokal",
        format: libraryItem.format || "Instagram Post · 4:5",
        style: libraryItem.style || "Eksploratif",
        primaryColor: libraryItem.primaryColor || "",
        quality: libraryItem.quality || "1mp",
        sourceUrl: getCurrentLibraryVersion(libraryItem)?.url || libraryItem.sourceUrl,
      }),
    });
    if (response.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      throw new Error("Sesi login telah berakhir.");
    }
    const data = await response.json();
    if (!response.ok) {
      const requestError = new Error(data.message || "Variasi baru gagal dibuat.");
      requestError.data = data;
      throw requestError;
    }
    if (data.usage) {
      usageState = data.usage;
      updatePlanInterface();
    }

    const versionNumber = libraryItem.versions.length + 1;
    const versionId = `${libraryItem.id}-v${versionNumber}-${Date.now()}`;
    libraryItem.versions.push({
      id: versionId,
      url: data.url,
      refinement: input.value.trim(),
      createdAt: new Date().toISOString(),
      immutable: false,
      colorGrade: normalizeColorGrade(getCurrentLibraryVersion(libraryItem)?.colorGrade),
    });
    libraryItem.currentVersionId = versionId;
    saveLibrary();
    renderLibrary();
    closeRefineDrawer();
    input.value = "";
    showToast(`Versi ${versionNumber} selesai`, "Versi baru disimpan di Library; gambar original tidak berubah.", "✦");
  } catch (error) {
    if (error.data?.usage) {
      usageState = error.data.usage;
      updatePlanInterface();
    }
    if (error.data?.upgradeRequired) openUpgradeModal(error.message);
    showToast("Refinement gagal", error.message || "Periksa koneksi AI lalu coba lagi.", "!");
  } finally {
    button.disabled = false;
    $("strong", button).textContent = "Buat variasi baru";
  }
}

function useSelectedDesign() {
  if (selectedConcept === null || !activeProject) return;
  activeProject.status = "Dipilih";
  activeProject.updated = "Baru saja";
  activeProject.selectedConcept = selectedConcept;
  saveProjects();
  showToast("Desain utama dipilih", "Simpan ke Library jika kamu ingin membuat versi edit tanpa mengubah original.", "✓");
}

function loadPosterImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("File key visual tidak dapat dimuat."));
    image.src = url;
  });
}

function getCanvasTextLines(context, text, maxWidth, maxLines = 3) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let finalLine = lines[lines.length - 1];
    while (finalLine && context.measureText(`${finalLine}…`).width > maxWidth) finalLine = finalLine.slice(0, -1).trim();
    lines[lines.length - 1] = `${finalLine}…`;
  }
  return lines.length ? lines : [""];
}

const canvasPosterLayouts = Object.freeze([
  { overlay: "left", brand: [0.07, 0.07, 0.42, "left"], headline: [0.07, 0.35, 0.42, "left", "Arial", 700, 0.058, false], cta: [0.07, 0.84, 0.42, "left"] },
  { overlay: "topRight", brand: [0.48, 0.07, 0.45, "right"], headline: [0.38, 0.14, 0.55, "right", "Arial", 900, 0.064, true], cta: [0.51, 0.43, 0.42, "right"] },
  { overlay: "top", brand: [0.09, 0.05, 0.82, "center"], headline: [0.09, 0.11, 0.82, "center", "Arial", 800, 0.052, false], cta: [0.29, 0.29, 0.42, "center"] },
  { overlay: "bottom", brand: [0.06, 0.05, 0.42, "left"], headline: [0.06, 0.7, 0.88, "center", "Arial", 900, 0.055, true], cta: [0.29, 0.91, 0.42, "center"] },
  { overlay: "right", brand: [0.51, 0.07, 0.42, "right"], headline: [0.5, 0.35, 0.43, "right", "Georgia", 500, 0.052, false, true], cta: [0.51, 0.84, 0.42, "right"] },
  { overlay: "left", brand: [0.06, 0.06, 0.46, "left"], headline: [0.06, 0.16, 0.46, "left", "Arial", 900, 0.063, true], cta: [0.06, 0.48, 0.42, "left"] },
  { overlay: "leftNarrow", brand: [0.06, 0.06, 0.34, "left"], headline: [0.06, 0.3, 0.34, "left", "Georgia", 600, 0.052, false], cta: [0.06, 0.86, 0.34, "left"] },
  { overlay: "topRight", brand: [0.52, 0.06, 0.42, "right"], headline: [0.46, 0.15, 0.48, "right", "Arial", 900, 0.062, true], cta: [0.52, 0.47, 0.42, "right"] },
  { overlay: "top", brand: [0.11, 0.05, 0.78, "center"], headline: [0.11, 0.12, 0.78, "center", "Georgia", 500, 0.055, false], cta: [0.29, 0.31, 0.42, "center"] },
  { overlay: "bottomLeft", brand: [0.06, 0.61, 0.5, "left"], headline: [0.06, 0.68, 0.5, "left", "Arial", 900, 0.063, true], cta: [0.06, 0.89, 0.42, "left"] },
]);

function getCanvasPosterLayout(conceptIndex) {
  const index = Math.max(0, Math.min(canvasPosterLayouts.length - 1, Number(conceptIndex) || 0));
  return canvasPosterLayouts[index];
}

function drawCanvasAgentOverlay(context, width, height, type) {
  let gradient;
  if (type === "left" || type === "leftNarrow") {
    gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(8,11,14,.9)");
    gradient.addColorStop(type === "leftNarrow" ? 0.34 : 0.43, "rgba(8,11,14,.55)");
    gradient.addColorStop(type === "leftNarrow" ? 0.62 : 0.72, "rgba(8,11,14,0)");
  } else if (type === "right") {
    gradient = context.createLinearGradient(width, 0, 0, 0);
    gradient.addColorStop(0, "rgba(12,9,8,.9)");
    gradient.addColorStop(0.42, "rgba(12,9,8,.52)");
    gradient.addColorStop(0.7, "rgba(12,9,8,0)");
  } else if (type === "top") {
    gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(10,13,19,.88)");
    gradient.addColorStop(0.34, "rgba(10,13,19,.44)");
    gradient.addColorStop(0.56, "rgba(10,13,19,0)");
  } else if (type === "bottom") {
    gradient = context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, "rgba(8,11,16,.94)");
    gradient.addColorStop(0.33, "rgba(8,11,16,.57)");
    gradient.addColorStop(0.56, "rgba(8,11,16,0)");
  } else {
    const atRight = type === "topRight";
    const centerX = atRight ? width : 0;
    const centerY = atRight ? 0 : height;
    gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.78);
    gradient.addColorStop(0, "rgba(10,10,14,.92)");
    gradient.addColorStop(0.48, "rgba(10,10,14,.52)");
    gradient.addColorStop(1, "rgba(10,10,14,0)");
  }
  context.save();
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function canvasTextAnchor(width, spec) {
  const [x, , blockWidth, alignment] = spec;
  if (alignment === "right") return width * (x + blockWidth);
  if (alignment === "center") return width * (x + blockWidth / 2);
  return width * x;
}

function drawCanvasPosterText(context, width, height, posterCopy, layout) {
  context.save();
  context.textBaseline = "top";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0,0,0,.58)";
  context.shadowBlur = Math.max(2, Math.round(width * 0.009));

  if (posterCopy.brand) {
    const spec = layout.brand;
    const brandSize = Math.max(14, Math.min(width * 0.025, height * 0.04));
    context.font = `800 ${Math.round(brandSize)}px Arial, sans-serif`;
    context.textAlign = spec[3];
    context.fillText(String(posterCopy.brand).toUpperCase(), canvasTextAnchor(width, spec), height * spec[1]);
  }

  if (posterCopy.headline) {
    const spec = layout.headline;
    const [, y, blockWidth, alignment, family, weight, scale, uppercase, italic] = spec;
    const headlineSize = Math.max(24, Math.min(width * scale, height * 0.092));
    context.font = `${italic ? "italic " : ""}${weight} ${Math.round(headlineSize)}px ${family}, ${family === "Georgia" ? "serif" : "sans-serif"}`;
    context.textAlign = alignment;
    const headline = uppercase ? String(posterCopy.headline).toUpperCase() : String(posterCopy.headline);
    const lines = getCanvasTextLines(context, headline, width * blockWidth, 3);
    const lineHeight = Math.round(headlineSize * 1.02);
    const anchor = canvasTextAnchor(width, spec);
    lines.forEach((line, index) => context.fillText(line, anchor, height * y + index * lineHeight));
  }

  if (posterCopy.cta) {
    const spec = layout.cta;
    const ctaText = String(posterCopy.cta).toUpperCase();
    const ctaSize = Math.max(13, Math.min(width * 0.022, height * 0.033));
    context.font = `800 ${Math.round(ctaSize)}px Arial, sans-serif`;
    const padX = Math.round(width * 0.021);
    const boxHeight = Math.round(ctaSize * 2.05);
    const maxWidth = width * spec[2];
    const boxWidth = Math.min(maxWidth, Math.ceil(context.measureText(ctaText).width + padX * 2));
    const anchor = canvasTextAnchor(width, spec);
    const boxX = spec[3] === "right" ? anchor - boxWidth : spec[3] === "center" ? anchor - boxWidth / 2 : anchor;
    const boxY = Math.min(height - boxHeight, height * spec[1]);
    context.shadowBlur = 0;
    context.fillStyle = "#d9ff5b";
    canvasRoundedRect(context, boxX, boxY, boxWidth, boxHeight, boxHeight * 0.22);
    context.fill();
    context.fillStyle = "#26301b";
    context.textAlign = "center";
    context.fillText(ctaText, boxX + boxWidth / 2, boxY + Math.round(boxHeight * 0.28));
  }
  context.restore();
}

function canvasRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function getCanvasImageStats(image) {
  const width = 64;
  const height = Math.max(16, Math.round(width * image.naturalHeight / image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  return analyzePixels(context.getImageData(0, 0, width, height).data, { ignoreTransparent: true });
}

async function drawAdaptiveCanvasLogo(context, width, height, posterCopy) {
  const logoUrl = sanitizeLogoDataUrl(posterCopy.logo || "");
  if (!logoUrl) return;
  const logo = await loadPosterImage(logoUrl);
  const position = normalizeLogoPosition(posterCopy.logoPosition);
  const plateWidth = width * position.width;
  const padding = Math.max(3, Math.round(width * 0.006));
  const contentWidth = Math.max(1, plateWidth - padding * 2);
  const contentHeight = Math.max(1, height * 0.18 - padding * 2);
  const scale = Math.min(contentWidth / logo.naturalWidth, contentHeight / logo.naturalHeight);
  const logoWidth = Math.max(1, Math.round(logo.naturalWidth * scale));
  const logoHeight = Math.max(1, Math.round(logo.naturalHeight * scale));
  const plateHeight = logoHeight + padding * 2;
  const x = Math.min(width - plateWidth, width * position.x);
  const y = Math.min(height - plateHeight, height * position.y);
  let treatment = { plate: "light", busy: true };
  try {
    const sample = context.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.max(1, Math.min(width - Math.floor(x), Math.ceil(plateWidth))), Math.max(1, Math.min(height - Math.floor(y), Math.ceil(plateHeight))));
    treatment = chooseLogoTreatment(analyzePixels(sample.data), getCanvasImageStats(logo));
  } catch {
    // Gunakan pelat terang yang aman jika browser memblokir pembacaan pixel.
  }
  if (treatment.plate !== "none") {
    context.save();
    context.fillStyle = treatment.plate === "dark"
      ? `rgba(12,16,22,${treatment.busy ? 0.94 : 0.84})`
      : `rgba(255,255,255,${treatment.busy ? 0.95 : 0.87})`;
    context.shadowColor = "rgba(0,0,0,.32)";
    context.shadowBlur = Math.max(3, Math.round(width * 0.012));
    canvasRoundedRect(context, x, y, plateWidth, plateHeight, Math.round(width * 0.008));
    context.fill();
    context.restore();
  }
  const imageX = x + (plateWidth - logoWidth) / 2;
  context.drawImage(logo, imageX, y + padding, logoWidth, logoHeight);
}

async function downloadComposedPoster(imageUrl, posterCopy, fileName, conceptIndex = 0, colorGrade = defaultColorGrade) {
  const source = await loadPosterImage(imageUrl);
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.filter = getColorGradeFilter(colorGrade);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  context.filter = "none";

  const width = canvas.width;
  const height = canvas.height;
  const layout = getCanvasPosterLayout(conceptIndex);
  const hasPosterText = Boolean(posterCopy.brand || posterCopy.headline || posterCopy.cta);
  if (hasPosterText) {
    drawCanvasAgentOverlay(context, width, height, layout.overlay);
    drawCanvasPosterText(context, width, height, posterCopy, layout);
  }
  try {
    await drawAdaptiveCanvasLogo(context, width, height, posterCopy);
  } catch {
    // Ekspor teks tetap dapat dilanjutkan jika data logo lama tidak dapat dibaca.
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
  if (!blob) throw new Error("Browser gagal menyusun file poster.");
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${fileName}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function exportSelectedImage() {
  if (selectedConcept === null) {
    showToast("Pilih satu konsep dulu", "Klik poster yang paling kamu suka sebelum mengekspor.", "↓");
    return;
  }

  const image = generatedImages[selectedConcept];
  if (!image || !image.url) {
    showToast("Belum ada file AI", "Buat konsep melalui server AI agar dapat mengunduh gambar asli.", "!");
    return;
  }

  const safeName = (activeProject?.name || "kanvas")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    await downloadComposedPoster(image.url, getWorkspacePosterCopy(selectedConcept), `${safeName}-konsep-${String(selectedConcept + 1).padStart(2, "0")}`, selectedConcept);
    showToast("Poster siap", "Key visual dan teks poster sudah digabungkan sebagai PNG.", "↓");
  } catch (error) {
    showToast("Ekspor gagal", error.message || "Poster tidak dapat disusun.", "!");
  }
}

async function downloadLibraryVersion(itemId) {
  const item = getLibraryItem(itemId);
  const version = getCurrentLibraryVersion(item);
  if (!item || !version?.url) {
    showToast("Belum ada file AI", "Versi demo CSS tidak memiliki file gambar untuk diunduh.", "!");
    return;
  }
  const versionIndex = item.versions.findIndex((candidate) => candidate.id === version.id) + 1;
  const safeName = `${item.projectName || "kanvas"}-${item.conceptName || "desain"}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    await downloadComposedPoster(version.url, getLibraryPosterCopy(item), `${safeName}-v${versionIndex}`, item.conceptIndex, version.colorGrade);
    showToast("Poster siap", `Versi ${versionIndex} sudah digabungkan dengan teks poster.`, "↓");
  } catch (error) {
    showToast("Unduhan gagal", error.message || "Versi ini tidak dapat disusun.", "!");
  }
}

function bindEvents() {
  window.addEventListener("resize", () => scheduleAdaptiveLogos(document), { passive: true });
  $$('[data-auth-home]').forEach((brandLink) => {
    brandLink.addEventListener("click", (event) => {
      event.preventDefault();
      showAuthMode("login");
    });
  });
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#login-form .auth-submit");
    button.disabled = true;
    setAuthError();
    try {
      const session = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("#email").value.trim(),
          password: $("#password").value,
          remember: $("#login-remember").checked,
        }),
      });
      await enterApp(session);
      $("#password").value = "";
    } catch (error) {
      setAuthError(error.message || "Kanvas belum dapat menghubungi server akun.");
    } finally {
      button.disabled = false;
    }
  });
  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("#register-password").value;
    if (password !== $("#register-confirm").value) {
      setAuthError("Konfirmasi kata sandi belum cocok.");
      return;
    }
    const button = $("#register-form .auth-submit");
    button.disabled = true;
    setAuthError();
    try {
      const session = await requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: $("#register-name").value.trim(),
          email: $("#register-email").value.trim(),
          password,
          remember: $("#register-remember").checked,
          ...getSignupDeviceIdentity(),
        }),
      });
      await enterApp(session);
      $("#register-form").reset();
      showToast("Akun berhasil dibuat", "Ruang kreatif pribadimu sudah siap digunakan.", "✓");
    } catch (error) {
      setAuthError(error.message || "Akun belum dapat dibuat.");
    } finally {
      button.disabled = false;
    }
  });
  $("#show-register").addEventListener("click", () => showAuthMode("register"));
  $("#show-login").addEventListener("click", () => showAuthMode("login"));
  $("#toggle-password").addEventListener("click", () => {
    const password = $("#password");
    password.type = password.type === "password" ? "text" : "password";
  });
  $(".text-button.subtle").addEventListener("click", () => showToast("Pemulihan belum aktif", "Untuk versi lokal, ubah kata sandi dari Pengaturan setelah masuk.", "i"));

  ["#profile-button", "#mobile-profile-button"].forEach((selector) => {
    $(selector).addEventListener("click", (event) => toggleAccountMenu(event.currentTarget));
  });
  $$('[data-account-open]').forEach((button) => {
    button.addEventListener("click", () => openAccountModal(button.dataset.accountOpen));
  });
  $("#account-menu-logout").addEventListener("click", performLogout);
  $("#account-modal-close").addEventListener("click", closeAccountModal);
  $("#account-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAccountModal();
  });
  $$(".account-tab").forEach((tab) => tab.addEventListener("click", () => switchAccountTab(tab.dataset.accountTab)));
  $("#profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await requestJson("/api/account/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: $("#account-name").value.trim(),
          email: $("#account-email").value.trim(),
          currentPassword: $("#account-current-password").value,
        }),
      });
      currentUser = data.user;
      $("#account-current-password").value = "";
      updateUserInterface();
      showToast("Profil diperbarui", "Nama dan email akunmu sudah tersimpan.", "✓");
    } catch (error) {
      showToast("Profil belum tersimpan", error.message, "!");
    }
  });
  $("#preferences-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await requestJson("/api/account/preferences", {
        method: "PUT",
        body: JSON.stringify({
          defaultFormat: $("#preference-format").value,
          defaultStyle: $("#preference-style").value,
          primaryColor: $("#preference-color").value,
          startView: $("#preference-start-view").value,
        }),
      });
      accountPreferences = data.preferences;
      showToast("Preferensi disimpan", "Proyek berikutnya akan memakai pilihan ini.", "✓");
    } catch (error) {
      showToast("Preferensi belum tersimpan", error.message, "!");
    }
  });
  $("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = $("#new-password").value;
    if (newPassword !== $("#confirm-new-password").value) {
      showToast("Kata sandi belum cocok", "Ulangi kata sandi baru dengan nilai yang sama.", "!");
      return;
    }
    try {
      const data = await requestJson("/api/account/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: $("#current-password").value, newPassword }),
      });
      csrfToken = data.csrfToken || csrfToken;
      $("#password-form").reset();
      showToast("Kata sandi diperbarui", "Sesi lain sudah dikeluarkan demi keamanan.", "✓");
    } catch (error) {
      showToast("Kata sandi belum berubah", error.message, "!");
    }
  });
  document.addEventListener("click", (event) => {
    const popover = $("#account-popover");
    if (popover.classList.contains("is-hidden")) return;
    if (popover.contains(event.target) || event.target.closest("#profile-button, #mobile-profile-button")) return;
    closeAccountMenu();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".project-options-button, .project-action-menu")) return;
    $$(".project-action-menu").forEach((menu) => menu.classList.add("is-hidden"));
    $$(".project-options-button").forEach((button) => button.setAttribute("aria-expanded", "false"));
  });
  window.addEventListener("resize", closeAccountMenu);

  ["#new-project-side", "#new-project-main", "#quick-create"].forEach((selector) => $(selector)?.addEventListener("click", openProjectModal));
  $$('[data-close-modal]').forEach((button) => button.addEventListener("click", closeProjectModal));
  $("#project-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeProjectModal();
  });
  $("#view-all").addEventListener("click", openAllProjectsModal);
  $("#all-projects-close").addEventListener("click", () => closeAllProjectsModal({ restoreFocus: true }));
  $("#all-projects-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAllProjectsModal({ restoreFocus: true });
  });
  $("#all-projects-create").addEventListener("click", openProjectModal);
  $("#delete-project-close").addEventListener("click", closeDeleteProjectModal);
  $("#cancel-delete-project").addEventListener("click", closeDeleteProjectModal);
  $("#confirm-delete-project").addEventListener("click", deletePendingProject);
  $("#delete-project-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDeleteProjectModal();
  });
  $("#help-button").addEventListener("click", openHelpModal);
  $("#help-modal-close").addEventListener("click", () => closeHelpModal({ restoreFocus: true }));
  $("#help-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeHelpModal({ restoreFocus: true });
  });
  $("#upgrade-plan-button").addEventListener("click", () => openUpgradeModal());
  $("#upgrade-modal-close").addEventListener("click", closeUpgradeModal);
  $("#upgrade-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeUpgradeModal();
  });
  $("#upgrade-contact-button").addEventListener("click", () => {
    closeUpgradeModal();
    closeDeleteProjectModal();
    openHelpModal();
  });
  $$(".category-option").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".category-option").forEach((option) => option.classList.remove("selected"));
      button.classList.add("selected");
      selectedCategory = button.dataset.category;
    }),
  );
  $("#project-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#project-name").value.trim();
    const project = {
      id: `project-${Date.now()}`,
      name,
      category: selectedCategory,
      type: "empty",
      status: "Draf",
      updated: "Baru saja",
      hasResults: false,
      brandName: name,
      headline: (copyDefaults[selectedCategory] || copyDefaults.Lainnya).headline,
      cta: (copyDefaults[selectedCategory] || copyDefaults.Lainnya).cta,
      primaryColor: accountPreferences?.primaryColor || "#5a3529",
      format: accountPreferences?.defaultFormat || "Instagram Post · 4:5",
      style: accountPreferences?.defaultStyle || "Eksploratif",
      prompt: "",
      brandLogo: "",
      logoPositions: {},
      headlineMode: "manual",
      quality: "1mp",
      agentIndexes: [0],
    };
    projects.unshift(project);
    saveProjects();
    renderProjects();
    closeProjectModal();
    openProject(project.id);
    showToast("Proyek baru dibuat", "Mulai dengan menceritakan ide promosimu.", "✦");
  });

  $$('[data-route="dashboard"]').forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    renderProjects();
    showView("dashboard");
  }));
  $("#library-nav").addEventListener("click", () => {
    renderLibrary();
    showView("library");
  });
  $('[data-route="inspiration"]').addEventListener("click", () => {
    renderInspirations();
    showView("inspiration");
  });
  $("#inspiration-create").addEventListener("click", openProjectModal);
  ["#library-to-projects", "#library-empty-projects"].forEach((selector) => $(selector).addEventListener("click", () => {
    renderProjects();
    showView("dashboard");
  }));
  $$(".side-nav .nav-item").forEach((button) => {
    if (!["dashboard", "library", "inspiration"].includes(button.dataset.route)) button.addEventListener("click", () => showToast("Fitur sedang disiapkan", "Untuk sekarang, lanjutkan eksplorasi dari proyekmu.", "✦"));
  });
  $("#back-dashboard").addEventListener("click", () => {
    renderProjects();
    showView("dashboard");
  });
  $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("mobile-open"));
  $("#dismiss-tip").addEventListener("click", () => $(".tips-strip").remove());

  $("#prompt-input").addEventListener("input", () => {
    updateCharacterCount();
    markSaving();
  });
  ["#brand-input", "#headline-input", "#cta-input"].forEach((selector) =>
    $(selector).addEventListener("input", () => {
      markSaving();
      if (activeProject?.hasResults) renderConcepts(false, generatedImages);
    }),
  );
  $$('[data-headline-mode]').forEach((button) => button.addEventListener("click", () => setHeadlineMode(button.dataset.headlineMode)));
  $("#generate-headline").addEventListener("click", () => suggestHeadline());
  $("#brand-logo-input").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeProject) return;
    try {
      activeProject.brandLogo = await optimizeBrandLogo(file);
      renderBrandLogoPreview();
      markSaving();
      if (activeProject.hasResults) renderConcepts(false, generatedImages);
      showToast("Logo siap digunakan", "Logo sudah diperkecil dan latar solidnya dihapus otomatis.", "✓");
    } catch (error) {
      showToast("Logo belum dapat digunakan", error.message, "!");
    } finally {
      event.target.value = "";
    }
  });
  $("#remove-brand-logo").addEventListener("click", () => {
    if (!activeProject) return;
    activeProject.brandLogo = "";
    renderBrandLogoPreview();
    markSaving();
    if (activeProject.hasResults) renderConcepts(false, generatedImages);
  });
  $("#magic-prompt").addEventListener("click", async () => {
    const button = $("#magic-prompt");
    const prompt = $("#prompt-input");
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Menyempurnakan...";
    try {
      const data = await requestJson("/api/prompt-enhance", {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.value.trim(),
          projectName: activeProject?.name || "",
          category: activeProject?.category || "Lainnya",
          style: $(".style-option.selected")?.dataset.style || "Eksploratif",
          format: $("#format-select").value,
          brand: $("#brand-input").value.trim(),
          headline: $("#headline-input").value.trim(),
          cta: $("#cta-input").value.trim(),
        }),
      });
      prompt.value = String(data.prompt || "").slice(0, 1000);
      updateCharacterCount();
      markSaving();
      showToast("Prompt disempurnakan", "Arahan kini mengikuti kategori, brand, format, dan tujuan proyek ini.", "✦");
    } catch (error) {
      showToast("Prompt belum dapat disempurnakan", error.message || "Periksa koneksi server lalu coba lagi.", "!");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
  $$(".style-option").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".style-option").forEach((option) => option.classList.remove("selected"));
      button.classList.add("selected");
      markSaving();
    }),
  );
  $("#format-select").addEventListener("change", () => {
    markSaving();
    if (activeProject?.hasResults) renderConcepts(false, generatedImages);
  });
  $("#quality-select").addEventListener("change", () => {
    if (!isSubscriber() && $("#quality-select").value !== "1mp") {
      $("#quality-select").value = "1mp";
      openUpgradeModal("Kualitas 2MP dan 4MP tersedia pada Layera Pro.");
    }
    updateGenerationControls();
    markSaving();
  });
  $("#reset-controls").addEventListener("click", () => {
    const preferredStyle = accountPreferences?.defaultStyle || "Eksploratif";
    $$(".style-option").forEach((option) => option.classList.toggle("selected", option.dataset.style === preferredStyle));
    $("#format-select").value = accountPreferences?.defaultFormat || "Instagram Post · 4:5";
    $("#color-control").value = accountPreferences?.primaryColor || "#5a3529";
    $("#color-value").textContent = $("#color-control").value.toUpperCase();
    markSaving();
    if (activeProject?.hasResults) renderConcepts(false, generatedImages);
  });
  $("#color-control").addEventListener("input", () => {
    $("#color-value").textContent = $("#color-control").value.toUpperCase();
    markSaving();
  });
  $("#generate-button").addEventListener("click", startGeneration);

  $$(".view-toggles button").forEach((button) =>
    button.addEventListener("click", () => {
      $$(".view-toggles button").forEach((toggle) => toggle.classList.remove("active"));
      button.classList.add("active");
      $("#results-grid").classList.toggle("large", button.dataset.cols === "2");
    }),
  );
  $("#clear-selection").addEventListener("click", clearSelection);
  $("#save-library-button").addEventListener("click", saveSelectedToLibrary);
  $("#use-design-button").addEventListener("click", useSelectedDesign);
  $("#close-drawer").addEventListener("click", closeRefineDrawer);
  $("#drawer-scrim").addEventListener("click", closeRefineDrawer);
  $$(".refine-chips button").forEach((button) =>
    button.addEventListener("click", () => {
      const input = $("#refine-input");
      input.value = input.value ? `${input.value}, ${button.textContent.toLowerCase()}` : button.textContent;
    }),
  );
  $("#regenerate-button").addEventListener("click", regenerateSelected);
  $("#export-button").addEventListener("click", exportSelectedImage);
  $("#library-preview-close").addEventListener("click", () => closeLibraryPreview({ restoreFocus: true }));
  $("#library-preview-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLibraryPreview({ restoreFocus: true });
  });
  $("#library-zoom").addEventListener("input", (event) => updateLibraryPreviewZoom(event.target.value));
  $("#library-zoom-out").addEventListener("click", () => updateLibraryPreviewZoom(libraryPreviewZoom - 0.1));
  $("#library-zoom-in").addEventListener("click", () => updateLibraryPreviewZoom(libraryPreviewZoom + 0.1));
  $$('[data-grade]', $("#library-preview-modal")).forEach((input) => input.addEventListener("input", updateLibraryColorGrade));
  $("#reset-color-grade").addEventListener("click", () => {
    $$('[data-grade]', $("#library-preview-modal")).forEach((input) => { input.value = String(defaultColorGrade[input.dataset.grade]); });
    updateLibraryColorGrade();
  });
  $("#library-preview-download").addEventListener("click", () => {
    if (activeLibraryPreviewId) downloadLibraryVersion(activeLibraryPreviewId);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeAccountMenu({ restoreFocus: true });
    closeProjectModal();
    closeAllProjectsModal({ restoreFocus: true });
    closeHelpModal({ restoreFocus: true });
    closeAccountModal();
    closeUpgradeModal();
    closeRefineDrawer();
    closeLibraryPreview({ restoreFocus: true });
    $(".sidebar").classList.remove("mobile-open");
  });
}

async function bootstrap() {
  const accountPopover = $("#account-popover");
  accountPopover.setAttribute("aria-hidden", "true");
  document.body.appendChild(accountPopover);
  bindEvents();
  updateCharacterCount();
  localStorage.removeItem("kanvas_session");

  try {
    const session = await requestJson("/api/auth/me");
    await enterApp(session);
  } catch (error) {
    const message = error.status && error.status !== 401 ? error.message : "";
    showAuthScreen(message);
  }
  document.documentElement.dataset.appReady = "true";
}

if (typeof document !== "undefined") bootstrap();
