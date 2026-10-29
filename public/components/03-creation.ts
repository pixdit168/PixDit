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
    headlineMode: "ai",
    styleExplicit: false,
    primaryColorExplicit: false,
    logoPositions: {},
    inspirationSource: source.id,
  };
  projects.unshift(project);
  saveProjects();
  renderProjects();
  openProject(project.id);
  showToast("Inspirasi siap dikembangkan", "AI akan menyusun desain langsung dari brief-mu.", "✦");
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

function renderGenerationCountSelector() {
  const selector = $("#generation-count-selector");
  if (!selector) return;
  $$(".generation-count-option", selector).forEach((button) => {
    const count = Number(button.dataset.imageCount) === 10 ? 10 : 1;
    const selected = selectedGenerationCount === count;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.disabled = generationInProgress;
  });
}

function selectGenerationCount(value) {
  if (generationInProgress) return;
  const count = Number(value) === 10 ? 10 : 1;
  if (count === 10 && !isSubscriber()) {
    openUpgradeModal("Pembuatan 10 gambar sekaligus tersedia pada Pixgin Pro. Paket Gratis tetap dapat membuat 1 gambar.");
    return;
  }
  selectedGenerationCount = count;
  if (activeProject) activeProject.generationCount = count;
  renderGenerationCountSelector();
  updateGenerationControls();
  markSaving();
}

function getSelectedAgentHealth() {
  return apiHealth.agents?.[selectedAgentTier] || null;
}

function closeAgentMenu({ restoreFocus = false } = {}) {
  const menu = $("#agent-menu");
  const trigger = $("#agent-trigger");
  if (!menu || !trigger) return;
  const wasOpen = !menu.classList.contains("is-hidden");
  menu.classList.add("is-hidden");
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && wasOpen) trigger.focus();
}

function toggleAgentMenu() {
  if (generationInProgress) return;
  const menu = $("#agent-menu");
  const trigger = $("#agent-trigger");
  if (!menu || !trigger) return;
  const shouldOpen = menu.classList.contains("is-hidden");
  menu.classList.toggle("is-hidden", !shouldOpen);
  trigger.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) $(".agent-option.selected", menu)?.focus();
}

function renderAgentStatus() {
  const status = $("#api-status");
  if (!status) return;
  if (!apiHealth.online) return;
  const health = getSelectedAgentHealth();
  const label = selectedAgentTier === "pro" ? "Agent Pro" : "Agent Free";
  status.className = `private-note api-status ${health?.configured ? "connected" : "offline"}`;
  status.innerHTML = health?.configured
    ? `<span>●</span> ${label} aktif`
    : `<span>●</span> Server aktif · ${label} belum dikonfigurasi`;
}

function renderAgentSelector() {
  if (!isSubscriber() && selectedAgentTier === "pro") selectedAgentTier = "free";
  const proSelected = selectedAgentTier === "pro";
  const trigger = $("#agent-trigger");
  if (!trigger) return;
  $("#agent-label").textContent = proSelected ? "Agent Pro" : "Agent Free";
  $("#agent-description").textContent = proSelected ? "Reasoning dan presisi lebih tinggi" : "Eksplorasi cepat untuk semua plan";
  $("#agent-plan-note").textContent = isSubscriber() ? "Pilih Agent Free atau Agent Pro" : "Agent Pro khusus Pixgin Pro";
  trigger.disabled = generationInProgress;
  $$(".agent-option").forEach((button) => {
    const selected = button.dataset.agentTier === selectedAgentTier;
    button.classList.toggle("selected", selected);
    button.classList.toggle("locked", button.dataset.agentTier === "pro" && !isSubscriber());
    button.setAttribute("aria-selected", String(selected));
    button.disabled = generationInProgress;
  });
  renderAgentStatus();
  renderProductModelNotice();
}

function selectedModelSupportsReferenceImages() {
  if(selectedGenerationMode()==="editable")return true;
  return String(getSelectedAgentHealth()?.model || "").toLowerCase() !== "prunaai/z-image-turbo";
}

function renderProductModelNotice() {
  const unsupported = !selectedModelSupportsReferenceImages();
  const message = unsupported ? "Model ini tidak menerima gambar referensi, termasuk foto produk dan logo. Pilih Agent Pro atau model Free lain yang mendukung gambar." : "";
  for (const selector of ["#product-model-notice", "#logo-model-notice"]) {
    const notice = $(selector);
    if (!notice) continue;
    notice.classList.toggle("is-hidden", !unsupported);
    notice.textContent = message;
  }
}

function selectAgentTier(value) {
  if (generationInProgress) return;
  const tier = value === "pro" ? "pro" : "free";
  if (tier === "pro" && !isSubscriber()) {
    closeAgentMenu();
    openUpgradeModal("Agent Pro tersedia pada Pixgin Pro. Kamu tetap dapat memakai Agent Free untuk membuat satu gambar.");
    return;
  }
  selectedAgentTier = tier;
  if (activeProject) activeProject.agentTier = tier;
  closeAgentMenu();
  renderAgentSelector();
  markSaving();
}

function renderCreationMode() {
  if (!activeProject) return;
  const mode = activeProject.creationMode === "product" ? "product" : "prompt";
  $$(".creation-mode-option").forEach((button) => {
    const selected = button.dataset.creationMode === mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  $("#product-upload-panel").classList.toggle("is-hidden", mode !== "product");
  $("#creation-mode-note").textContent = mode === "product" ? "Kembangkan gambar produk yang diupload" : "Buat visual sepenuhnya dari brief";
  $("label[for='prompt-input']").textContent = mode === "product" ? "Bagaimana produk ini ingin dikembangkan?" : "Apa yang ingin kamu buat?";
  $("#prompt-input").placeholder = mode === "product"
    ? "Jelaskan suasana, audiens, penempatan produk, pencahayaan, dan tujuan promosinya..."
    : "Ceritakan produk atau layanan, audiens, suasana, dan tujuan promosimu...";
  renderProductImagePreview();
}

function selectCreationMode(value) {
  if (!activeProject || generationInProgress) return;
  activeProject.creationMode = value === "product" ? "product" : "prompt";
  renderCreationMode();
  markSaving();
}

function addProductImages(project, images) {
  const existing = getProductImages(project);
  if (existing.length + images.length > MAX_PRODUCT_IMAGES) throw new Error(`Maksimal ${MAX_PRODUCT_IMAGES} gambar produk per proyek.`);
  project.productImages = [...existing, ...images];
  delete project.productImage;
}

function removeProductImage(project, index) {
  project.productImages = getProductImages(project).filter((_, imageIndex) => imageIndex !== index);
  delete project.productImage;
}

function addBrandLogos(project, logos) {
  const existing = getBrandLogos(project);
  if (existing.length + logos.length > MAX_BRAND_LOGOS) throw new Error(`Maksimal ${MAX_BRAND_LOGOS} logo per proyek.`);
  project.brandLogos = [...existing, ...logos];
  delete project.brandLogo;
}

function removeBrandLogo(project, index) {
  project.brandLogos = getBrandLogos(project).filter((_, logoIndex) => logoIndex !== index);
  if (project.logoPositions && typeof project.logoPositions === "object") {
    for (const [key, positions] of Object.entries(project.logoPositions)) {
      if (Array.isArray(positions)) project.logoPositions[key] = positions.filter((_, logoIndex) => logoIndex !== index);
      else if (index === 0) delete project.logoPositions[key];
    }
  }
  if (index === 0) delete project.logoPosition;
  delete project.brandLogo;
}

function sourceImageCardMarkup(image, index, type) {
  const isLogo = type === "logo";
  const label = `${isLogo ? "Logo" : "Gambar"} ${index + 1}`;
  const removeAttribute = isLogo ? "data-remove-brand-logo" : "data-remove-product-image";
  return `<div class="source-image-card ${isLogo ? "brand-logo-preview" : "product-image-preview"}"><span>${label}</span><img src="${image}" alt="${label}" /><button class="close-button" type="button" ${removeAttribute}="${index}" aria-label="Hapus ${label}">×</button></div>`;
}

function renderProductImagePreview() {
  const images = getProductImages(activeProject);
  const preview = $("#product-image-preview");
  if (!preview) return;
  preview.classList.toggle("is-hidden", images.length === 0);
  preview.innerHTML = images.map((image, index) => sourceImageCardMarkup(image, index, "product")).join("");
  $("#product-image-input").disabled = images.length >= MAX_PRODUCT_IMAGES;
  $(".product-upload-button").classList.toggle("at-capacity", images.length >= MAX_PRODUCT_IMAGES);
  $("#product-upload-label").textContent = images.length >= MAX_PRODUCT_IMAGES ? "Maksimal 5 gambar" : "Upload gambar";
}

async function optimizeProductImage(file) {
  const supportedType = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file?.type);
  const supportedName = /\.(?:png|jpe?g|webp)$/i.test(file?.name || "");
  if (!file || !supportedType || !supportedName) throw new Error("Gunakan file PNG, JPG, JPEG, atau WEBP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Ukuran gambar produk maksimal 12 MB.");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadPosterImage(sourceUrl);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensi gambar produk tidak dapat dibaca.");
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Dimensi gambar produk terlalu besar.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    for (const targetPixels of [1_000_000, 700_000, 500_000, 350_000]) {
      const scale = Math.min(1, Math.sqrt(targetPixels / (image.naturalWidth * image.naturalHeight)));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        if (result.length <= 500_000) return result;
      }
    }
    throw new Error("Gambar produk tidak dapat diperkecil ke ukuran aman.");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
function openUpgradeModal(message = "") {
  const exhausted = !isSubscriber() && (usageState?.generation?.exhausted || usageState?.refinement?.exhausted);
  $("#upgrade-modal-title").textContent = !message && exhausted ? "Kuota gratis minggu ini sudah habis." : "Buka lebih banyak dengan Pixgin Pro.";
  if (message) {
    $("#upgrade-modal-message").textContent = message;
  } else if (exhausted && usageState?.generation?.resetAt) {
    const resetDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(usageState.generation.resetAt));
    $("#upgrade-modal-message").textContent = `Paket Gratis menyediakan 1 gambar dan 3 edit setiap minggu. Kuota berikutnya hadir pada ${resetDate}.\n\nUpgrade ke Pixgin Pro untuk mendapatkan 200 kredit per bulan seharga Rp139.000/bulan.`;
  } else {
    $("#upgrade-modal-message").textContent = "Paket Gratis: 1 gambar dan 3 edit setiap minggu. Pixgin Pro: 200 kredit per bulan untuk membuat dan mengedit gambar, Agent Pro, semua kualitas, dan hingga 10 variasi sekaligus seharga Rp139.000/bulan.";
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
  const logos = getBrandLogos(activeProject);
  const preview = $("#brand-logo-preview");
  if (!preview) return;
  preview.classList.toggle("is-hidden", logos.length === 0);
  preview.innerHTML = logos.map((logo, index) => sourceImageCardMarkup(logo, index, "logo")).join("");
  $("#brand-logo-input").disabled = logos.length >= MAX_BRAND_LOGOS;
  $(".logo-upload-button").classList.toggle("at-capacity", logos.length >= MAX_BRAND_LOGOS);
  $("#brand-logo-upload-label").textContent = logos.length >= MAX_BRAND_LOGOS ? "Maksimal 1 logo" : "Upload logo";
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
