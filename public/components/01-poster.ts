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

const MAX_VARIATIONS = 10;
const variationName = (index) => `Variasi ${String(index + 1).padStart(2, "0")}`;
const variationIndex = (value) => Math.max(0, Math.min(MAX_VARIATIONS - 1, Math.trunc(Number(value) || 0)));

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
  if (["ai","editable"].includes(project?.generatedImages?.[conceptIndex]?.compositionMode)) return { brand: "", headline: "", cta: "", logos: [] };
  const defaults = copyDefaults[project?.category] || copyDefaults.Lainnya;
  const hasValue = (key) => project && Object.prototype.hasOwnProperty.call(project, key);
  return {
    brand: String(hasValue("brandName") ? project.brandName : (project?.name || "Brand lokal")).trim().slice(0, 60),
    headline: String(hasValue("headline") ? project.headline : defaults.headline).trim().slice(0, 100),
    cta: String(hasValue("cta") ? project.cta : defaults.cta).trim().slice(0, 50),
    logos: getBrandLogos(project).map((image, index) => ({ image, position: getProjectLogoPosition(project, conceptIndex, index) })),
  };
}

function getWorkspacePosterCopy(conceptIndex = selectedConcept ?? 0) {
  if (["ai","editable"].includes(generatedImages[conceptIndex]?.compositionMode)) return { brand: "", headline: "", cta: "", logos: [] };
  if (!$("#brand-input")) return getPosterCopy(activeProject, conceptIndex);
  return {
    brand: $("#brand-input").value.trim().slice(0, 60),
    headline: $("#headline-input").value.trim().slice(0, 100),
    cta: $("#cta-input").value.trim().slice(0, 50),
    logos: getBrandLogos(activeProject).map((image, index) => ({ image, position: getProjectLogoPosition(activeProject, conceptIndex, index) })),
  };
}

function getLibraryPosterCopy(item) {
  if(getCurrentLibraryVersion(item)?.designId)return {brand:"",headline:"",cta:"",logos:[]};
  if (item?.posterCopy) {
    return {
      brand: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "brand") ? item.posterCopy.brand : (item.projectName || "Brand lokal")),
      headline: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "headline") ? item.posterCopy.headline : copyDefaults.Lainnya.headline),
      cta: String(Object.prototype.hasOwnProperty.call(item.posterCopy, "cta") ? item.posterCopy.cta : copyDefaults.Lainnya.cta),
      logos: getPosterLogos(item.posterCopy, item.brandLogo || "", item.logoPosition),
    };
  }
  return getPosterCopy({ name: item?.projectName, category: item?.category });
}

function posterCopyMarkup(copy, { draggableLogo = false, logoScope = "", logoKey = "" as string | number } = {}) {
  const headline = escapeHtml(copy.headline).replace(/\n/g, "<br>");
  const editorData = draggableLogo ? `data-logo-draggable="true" data-logo-scope="${escapeHtml(logoScope)}" data-logo-key="${escapeHtml(String(logoKey))}"` : "";
  const logos = getPosterLogos(copy).map(({ image, position }, index) => {
    const logoStyle = `left:${position.x * 100}%;top:${position.y * 100}%;width:${position.width * 100}%;`;
    return `<div class="poster-brand-logo${draggableLogo ? " draggable" : ""}" style="${logoStyle}" data-logo-plate="pending" data-logo-index="${index}" ${editorData}><img src="${escapeHtml(image)}" alt="Logo brand ${index + 1}" draggable="false" />${draggableLogo ? '<i class="logo-resize-handle" role="button" aria-label="Ubah ukuran logo" title="Drag untuk mengubah ukuran"></i>' : ""}</div>`;
  }).join("");
  return `${logos}${copy.brand ? `<small>${escapeHtml(copy.brand)}</small>` : ""}${headline ? `<strong>${headline}</strong>` : ""}${copy.cta ? `<span>${escapeHtml(copy.cta)}</span>` : ""}`;
}

function posterCopyClass(copy) {
  return (copy.brand || copy.headline || copy.cta) ? "poster-copy" : "poster-copy no-text";
}

function sanitizeLogoDataUrl(value = "") {
  const logo = String(value);
  return /^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(logo) ? logo : "";
}

const MAX_BRAND_LOGOS = 1;
const MAX_LEGACY_BRAND_LOGOS = 3;

function getBrandLogos(project) {
  const values = Array.isArray(project?.brandLogos) && project.brandLogos.length ? project.brandLogos : (project?.brandLogo ? [project.brandLogo] : []);
  return values.slice(0, MAX_LEGACY_BRAND_LOGOS).map(sanitizeLogoDataUrl).filter(Boolean);
}

function getPosterLogos(copy, legacyLogo = "", legacyPosition = null) {
  if (Array.isArray(copy?.logos)) {
    return copy.logos.slice(0, MAX_LEGACY_BRAND_LOGOS).map((entry, index) => ({
      image: sanitizeLogoDataUrl(entry?.image || ""),
      position: normalizeLogoPosition(entry?.position, index),
    })).filter((entry) => entry.image);
  }
  const image = sanitizeLogoDataUrl(copy?.logo || legacyLogo);
  return image ? [{ image, position: normalizeLogoPosition(copy?.logoPosition || legacyPosition) }] : [];
}

function sanitizeProductImageDataUrl(value = "") {
  const image = String(value);
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(image) && image.length <= 1_400_000 ? image : "";
}

const MAX_PRODUCT_IMAGES = 5;

function getProductImages(project) {
  const values = Array.isArray(project?.productImages) && project.productImages.length ? project.productImages : (project?.productImage ? [project.productImage] : []);
  return values.slice(0, MAX_PRODUCT_IMAGES).map(sanitizeProductImageDataUrl).filter(Boolean);
}

function normalizeLogoPosition(value, logoIndex = 0) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const safeWidth = Number.isFinite(width) ? Math.min(0.42, Math.max(0.1, width)) : 0.22;
  return {
    x: Number.isFinite(x) ? Math.min(1 - safeWidth, Math.max(0, x)) : 0.71,
    y: Number.isFinite(y) ? Math.min(0.9, Math.max(0, y)) : 0.06 + logoIndex * 0.2,
    width: safeWidth,
  };
}

function getProjectLogoPosition(project, conceptIndex = 0, logoIndex = 0) {
  const key = String(Math.max(0, Number(conceptIndex) || 0));
  const perConcept = project?.logoPositions && typeof project.logoPositions === "object" ? project.logoPositions[key] : null;
  const position = Array.isArray(perConcept) ? perConcept[logoIndex] : (logoIndex === 0 ? perConcept : null);
  return normalizeLogoPosition(position || (logoIndex === 0 ? project?.logoPosition : null), logoIndex);
}

function setProjectLogoPosition(project, conceptIndex, value, logoIndex = 0) {
  if (!project) return normalizeLogoPosition(value);
  const key = String(Math.max(0, Number(conceptIndex) || 0));
  if (!project.logoPositions || typeof project.logoPositions !== "object" || Array.isArray(project.logoPositions)) project.logoPositions = {};
  const normalized = normalizeLogoPosition(value);
  const existing = project.logoPositions[key];
  const positions = Array.isArray(existing) ? [...existing] : (existing ? [existing] : []);
  positions[logoIndex] = normalized;
  project.logoPositions[key] = positions;
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
  const busy = surface.variance > 0.04;
  const weakShare = logo.luminances.filter((value) => contrastRatio(value, surface.average) < 3).length / logo.luminances.length;
  if (weakShare < 0.1 && !busy) return { plate: "none", busy: false };
  const score = (plateLuminance) => logo.luminances.reduce((sum, value) => sum + (contrastRatio(value, plateLuminance) >= 3 ? 1 : 0), 0) / logo.luminances.length;
  return { plate: score(1) >= score(0.005) ? "light" : "dark", busy };
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
  const scheduler = scheduleAdaptiveLogos as typeof scheduleAdaptiveLogos & { frameId?: number };
  cancelAnimationFrame(scheduler.frameId || 0);
  scheduler.frameId = requestAnimationFrame(() => updateAdaptiveLogos(root));
}
