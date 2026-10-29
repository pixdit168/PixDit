function openRefineDrawer(itemId) {
  const item = getLibraryItem(itemId);
  if (!item) {
    showToast("Simpan ke Library terlebih dahulu", "Editing hanya tersedia untuk salinan yang sudah masuk Library.", "!");
    return;
  }
  activeLibraryItemId = itemId;
  const conceptIndex = variationIndex(item.conceptIndex);
  const currentVersion = getCurrentLibraryVersion(item);
  const imageSource = currentVersion?.url || "";
  const poster = $("#drawer-poster");
  poster.className = `poster poster-${conceptIndex + 1} ${getPosterFormatClass(item.format)} ${imageSource ? "api-poster" : ""}`;
  const drawerCopy = getLibraryPosterCopy(item);
  poster.innerHTML = `${imageSource ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="" style="filter:${escapeHtml(getColorGradeFilter(currentVersion?.colorGrade))}" />` : ""}<div class="${posterCopyClass(drawerCopy)}">${posterCopyMarkup(drawerCopy, { draggableLogo: Boolean(imageSource && drawerCopy.logos.length), logoScope: "library", logoKey: item.id })}</div>`;
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
  if (!isSubscriber() && usageState?.refinement?.exhausted) {
    openUpgradeModal("Kuota 3 edit gratis minggu ini sudah habis. Upgrade ke Pixgin Pro untuk mendapatkan 200 kredit per bulan.");
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
        agentTier: libraryItem.agentTier || (isSubscriber() ? "pro" : "free"),
        sourceUrl: getCurrentLibraryVersion(libraryItem)?.url || libraryItem.sourceUrl,
      }),
    });
    if (response.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      throw new Error("Sesi login telah berakhir.");
    }
    const data = await response.json();
    if (!response.ok) {
      const requestError = new Error(data.message || "Variasi baru gagal dibuat.") as Error & { data?: any };
      requestError.data = data;
      throw requestError;
    }
    if (data.usage) {
      usageState = data.usage;
      updatePlanInterface();
    }

    if (getLibraryItem(libraryItem.id) !== libraryItem) {
      showToast("Desain sudah dihapus", "Hasil edit tidak ditambahkan karena desain telah dihapus dari Koleksi.", "!");
      return;
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
    libraryItem.agentTier = data.agentTier || libraryItem.agentTier || (isSubscriber() ? "pro" : "free");
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
  return new Promise<HTMLImageElement>((resolve, reject) => {
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

function drawCanvasPosterOverlay(context, width, height, type) {
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

async function drawAdaptiveCanvasLogo(context, width, height, posterLogo) {
  const logoUrl = sanitizeLogoDataUrl(posterLogo.image || "");
  if (!logoUrl) return;
  const logo = await loadPosterImage(logoUrl);
  const position = normalizeLogoPosition(posterLogo.position);
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
      ? "#101419"
      : "#ffffff";
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
    drawCanvasPosterOverlay(context, width, height, layout.overlay);
    drawCanvasPosterText(context, width, height, posterCopy, layout);
  }
  for (const posterLogo of getPosterLogos(posterCopy)) {
    try {
      await drawAdaptiveCanvasLogo(context, width, height, posterLogo);
    } catch {
      // Ekspor logo lain tetap dapat dilanjutkan jika satu logo tidak dapat dibaca.
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
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
    showToast("Pilih satu variasi dulu", "Klik gambar yang paling kamu suka sebelum mengekspor.", "↓");
    return;
  }

  const image = generatedImages[selectedConcept];
  if (!image || !image.url) {
    showToast("Belum ada file AI", "Buat gambar melalui server AI agar dapat mengunduh hasilnya.", "!");
    return;
  }

  const safeName = (activeProject?.name || "kanvas")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    if(image.designId){await downloadEditableDesign(image.designId,image.designVersionId,`${safeName}-variasi-${String(selectedConcept+1).padStart(2,"0")}`,image.designRevision);return;}
    await downloadComposedPoster(image.url, getWorkspacePosterCopy(selectedConcept), `${safeName}-variasi-${String(selectedConcept + 1).padStart(2, "0")}`, selectedConcept);
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
  const safeName = `${item.projectName || "kanvas"}-${variationName(variationIndex(item.conceptIndex))}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    if(version.designId){await downloadEditableDesign(version.designId,version.designVersionId,`${safeName}-v${versionIndex}`,version.designRevision,version.colorGrade);return;}
    await downloadComposedPoster(version.url, getLibraryPosterCopy(item), `${safeName}-v${versionIndex}`, item.conceptIndex, version.colorGrade);
    showToast("Poster siap", `Versi ${versionIndex} sudah digabungkan dengan teks poster.`, "↓");
  } catch (error) {
    showToast("Unduhan gagal", error.message || "Versi ini tidak dapat disusun.", "!");
  }
}
