function renderConcepts(loading = false, images = generatedImages) {
  const formatClass = getPosterFormatClass($("#format-select")?.value || activeProject?.format);
  const completedIndexes = Array.from({ length: MAX_VARIATIONS }, (_, index) => index).filter((index) => images[index]);
  const requestedIndexes = Array.from({ length: selectedGenerationCount }, (_, index) => index);
  const visibleIndexes = loading ? requestedIndexes : (completedIndexes.length ? completedIndexes : requestedIndexes);
  $("#results-grid").innerHTML = visibleIndexes
    .map((index) => {
      const image = images[index];
      const conceptName = variationName(index);
      const imageSource = image && (image.displayUrl || image.url);
      const isLoading = loading && !imageSource && !(image && image.error);
      const hasApiImage = Boolean(imageSource);
      const posterCopy = isLoading ? { brand: "", headline: "", cta: "", logos: [] } : getWorkspacePosterCopy(index);
      return `
        <article class="concept-card ${selectedConcept === index ? "selected" : ""} ${isLoading ? "loading" : ""} ${image && image.error ? "generation-error" : ""}" data-concept="${index}" tabindex="${isLoading ? -1 : 0}" role="button" aria-label="Pilih variasi ${index + 1}: ${escapeHtml(conceptName)}">
          <span class="concept-check">✓</span>
          <div class="poster poster-${index + 1} ${formatClass} ${hasApiImage ? "api-poster" : ""}">
            ${hasApiImage ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="Hasil visual ${escapeHtml(conceptName)}" />` : ""}
            <div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy, { draggableLogo: hasApiImage && !isLoading, logoScope: "project", logoKey: index })}</div>
          </div>
          <div class="concept-meta"><span>${escapeHtml(conceptName)}</span><small>${image && image.error ? "Gagal · coba lagi" : "Variasi visual"}</small></div>
          ${hasApiImage&&!isLoading?`<button type="button" class="dark-button design-result-edit" data-edit-design="${index}">Edit desain</button>`:""}
        </article>`;
    })
    .join("");

  bindLogoEditing($("#results-grid"));
  $$("[data-edit-design]",$("#results-grid")).forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();openDesignForResult(Number(button.dataset.editDesign));}));
  updateAdaptiveLogos($("#results-grid"));

  $$(".concept-card:not(.loading)").forEach((card) => {
    if (!card.classList.contains("generation-error")) {
      const select = () => selectConcept(Number(card.dataset.concept));
      card.addEventListener("click", select);
      card.addEventListener("keydown", (event) => {
        if(event.target.closest("button"))return;
        if (event.key === "Enter" || event.key === " ") select();
      });
    }
  });
}

function getEditableLogoPosition(logo) {
  const logoIndex = Number(logo.dataset.logoIndex) || 0;
  if (logo.dataset.logoScope === "library") {
    const item = getLibraryItem(logo.dataset.logoKey);
    return getLibraryPosterCopy(item).logos[logoIndex]?.position || normalizeLogoPosition(null, logoIndex);
  }
  return getProjectLogoPosition(activeProject, Number(logo.dataset.logoKey), logoIndex);
}

function storeEditableLogoPosition(logo, value) {
  const normalized = normalizeLogoPosition(value);
  const logoIndex = Number(logo.dataset.logoIndex) || 0;
  if (logo.dataset.logoScope === "library") {
    const item = getLibraryItem(logo.dataset.logoKey);
    if (!item) return normalized;
    const posterCopy = getLibraryPosterCopy(item);
    posterCopy.logos[logoIndex] = { ...posterCopy.logos[logoIndex], position: normalized };
    item.posterCopy = posterCopy;
    return normalized;
  }
  return setProjectLogoPosition(activeProject, Number(logo.dataset.logoKey), normalized, logoIndex);
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
  $("#selected-name").textContent = variationName(index);
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

async function saveSelectedToLibrary() {
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
    if (await persistAccountState()) showToast("Teks poster diperbarui", "Copy terbaru tersimpan ke akun tanpa membuat ulang key visual.", "✓");
    return;
  }

  const image = generatedImages[selectedConcept] || {};
  if (!image.url) {
    showToast("Belum ada key visual AI", "Buat gambar terlebih dahulu sebelum menyimpan desain ke Library.", "!");
    return;
  }
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
    conceptName: variationName(selectedConcept),
    agentTier: image.agentTier || selectedAgentTier,
    sourceUrl,
    designId:image.designId,
    createdAt,
    currentVersionId: originalVersionId,
    versions: [{ id: originalVersionId, url: sourceUrl, refinement: "", createdAt, immutable: true, colorGrade: { ...defaultColorGrade }, designId:image.designId, designVersionId:image.designVersionId, designRevision:image.designRevision }],
  });
  saveLibrary();
  renderLibrary();
  $("#save-library-button").textContent = "Menyimpan ke Koleksi...";
  if (await persistAccountState()) {
    $("#save-library-button").textContent = "✓ Sudah di Library";
    showToast("Tersimpan ke Library", "Original tersimpan di akun. Editing berikutnya akan dibuat sebagai versi baru.", "◇");
  } else {
    $("#save-library-button").textContent = "Coba simpan lagi";
  }
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

  const requestedQuality = $("#quality-select").value;
  const requestedCount = selectedGenerationCount === 10 ? 10 : 1;
  const requestedAgentTier = selectedAgentTier;
  const creationMode = activeProject?.creationMode === "product" ? "product" : "prompt";
  const productImages = creationMode === "product" ? getProductImages(activeProject) : [];
  if (creationMode === "product" && !productImages.length) {
    showToast("Gambar produk belum dipilih", "Upload gambar produk atau pilih opsi Prompt dari awal.", "!");
    $("#product-image-input").focus();
    return;
  }
  const brandLogo = getBrandLogos(activeProject)[0] || "";
  if ((productImages.length || brandLogo) && !selectedModelSupportsReferenceImages()) {
    showToast("Model tidak mendukung gambar referensi", "Pilih Agent Pro atau model Agent Free yang menerima foto produk dan logo.", "!");
    return;
  }
  if (!isSubscriber() && usageState?.generation?.exhausted) {
    openUpgradeModal("Kuota 1 gambar gratis minggu ini sudah habis. Upgrade ke Pixgin Pro untuk membuat dan mengedit gambar tanpa batas.");
    return;
  }
  if (window.location.protocol === "file:") {
    showToast("Server AI belum berjalan", "Jalankan npm start lalu buka http://localhost:8000.", "!");
    return;
  }

  const previousImages = [...generatedImages];
  const imageModelLabel = requestedAgentTier === "pro" ? "Agent Pro" : "Agent Free";
  generationAbortController = new AbortController();
  generationCancelRequested = false;
  generationInProgress = true;
  closeAgentMenu();
  renderAgentSelector();
  generatedImages = Array(requestedCount).fill(null);
  clearSelection();
  $("#empty-results").classList.add("is-hidden");
  $("#generation-progress").classList.remove("is-hidden");
  $("#generate-button").disabled = true;
  $("#cancel-generation").disabled = false;
  $("#cancel-generation").textContent = "Batalkan";
  renderConcepts(true, generatedImages);
  $("#results-subtitle").textContent = `${imageModelLabel} membuat ${requestedCount} variasi dari brief-mu.`;
  const progressTitle = $("#progress-title");
  if (progressTitle) progressTitle.textContent = `${imageModelLabel} sedang membuat key visual...`;
  setGenerationProgress(3, `Menyiapkan ${imageModelLabel} untuk ${requestedCount} gambar`);

  try {
    const selectedStyle = activeProject?.style || "Eksploratif";
    const response = await fetch("/api/generate", {
      method: "POST",
      signal: generationAbortController.signal,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        requestId,
        prompt,
        projectName: activeProject?.name || "Proyek Kanvas",
        category: activeProject?.category || "Bisnis lokal",
        format: $("#format-select").value,
        style: selectedStyle,
        styleExplicit: false,
        primaryColor: $("#color-control").value,
        primaryColorExplicit: false,
        imageCount: requestedCount,
        quality: requestedQuality,
        agentTier: requestedAgentTier,
        creationMode,
        compositionMode: "ai",
        generationMode:selectedGenerationMode(),
        productImages,
        brandLogo,
        brandName: $("#brand-input").value.trim() || activeProject?.name || "",
      }),
    });

    if (response.status === 401) {
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      throw new Error("Sesi login telah berakhir.");
    }

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = await response.json();
      } catch {
        errorData.message = `Server merespons dengan status ${response.status}.`;
      }
      const requestError = new Error(errorData.message || "Generasi gambar gagal.") as Error & { data?: any };
      requestError.data = errorData;
      throw requestError;
    }

    if (!response.body) throw new Error("Browser tidak mendukung streaming hasil gambar.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    let completedImages = 0;
    const designPreviews:Promise<void>[]=[];

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
          setGenerationProgress(5, `Brief diterima utuh (${event.promptLength} karakter) · ${event.agentLabel || imageModelLabel}`);
        }
        if (event.type === "progress") {
          const percent = Math.min(92, 8 + (completedImages / requestedCount) * 82);
          setGenerationProgress(percent, `${event.name || imageModelLabel} sedang dibuat`);
        }
        if (event.type === "image") {
          generatedImages[event.index] = {
            url: event.url,
            displayUrl: event.displayUrl,
            name: variationName(event.index),
            agentTier: event.agentTier || requestedAgentTier,
            compositionMode: event.compositionMode || "ai",
            designId:event.designId,
          };
          if(event.designId&&event.document)designPreviews.push(prepareEditablePreview(generatedImages[event.index],event.document));
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
          await Promise.allSettled(designPreviews);
          finishGeneration(event.success, event.failed, event.firstError, event.usage);
        }
      }
    }

    if (!completed) {
      throw new Error("Koneksi terputus sebelum semua gambar selesai.");
    }
  } catch (error) {
    const cancelled = generationCancelRequested || error?.name === "AbortError";
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
    if (cancelled) {
      const completedImages = generatedImages.filter((image) => image?.url).length;
      $("#results-subtitle").textContent = completedImages
        ? `${completedImages} gambar selesai sebelum generasi dibatalkan.`
        : "Generasi dibatalkan. Brief-mu tetap tersimpan.";
      showToast("Generasi dibatalkan", completedImages ? "Hasil yang sudah selesai tetap tersedia." : "Tidak ada gambar baru yang disimpan.", "×");
    } else {
      $("#results-subtitle").textContent = "Generasi belum selesai. Brief-mu tetap tersimpan.";
      const fallback = "Periksa konfigurasi agent, saldo, atau status layanan AI.";
      showToast("Generasi AI gagal", error.message || fallback, "!");
    }
  } finally {
    generationInProgress = false;
    generationAbortController = null;
    generationCancelRequested = false;
    renderGenerationCountSelector();
    renderAgentSelector();
  }
}

function cancelGeneration() {
  if (!generationInProgress || !generationAbortController) return;
  generationCancelRequested = true;
  const button = $("#cancel-generation");
  button.disabled = true;
  button.textContent = "Membatalkan...";
  setGenerationProgress(Number.parseInt($("#progress-percent").textContent, 10) || 0, "Menghentikan proses generasi");
  generationAbortController.abort();
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
    activeProject.style = activeProject.style || "Eksploratif";
    activeProject.primaryColor = $("#color-control").value;
    activeProject.quality = $("#quality-select").value;
    activeProject.brandLogos = getBrandLogos(activeProject);
    delete activeProject.brandLogo;
    activeProject.generationCount = selectedGenerationCount;
    activeProject.agentTier = selectedAgentTier;
    activeProject.creationMode = activeProject.creationMode === "product" ? "product" : "prompt";
    activeProject.productImages = getProductImages(activeProject);
    delete activeProject.productImage;
    activeProject.generatedImages = generatedImages.map((image) => (image && image.url ? {
      url: image.url,
      displayUrl: image.displayUrl || image.url,
      name: image.name || "",
      agentTier: image.agentTier || selectedAgentTier,
      compositionMode: image.compositionMode || "legacy",
      designId:image.designId,designVersionId:image.designVersionId,designRevision:image.designRevision,
    } : null));
    saveProjects();
  }
  if (successCount > 0) {
    const message = failedCount > 0 ? `${failedCount} gambar gagal, tetapi hasil yang selesai tetap dapat dipilih.` : "Pilih satu desain yang paling mewakili bisnismu.";
    showToast(`${successCount} gambar sudah siap`, message, "✦");
  } else {
    const cardError = generatedImages.find((image) => image?.error)?.message || "";
    const conciseError = String(firstError || cardError).split("\n")[0].slice(0, 220);
    const agentMessage = "Periksa API token, model, billing, atau rate limit agent gambar.";
    showToast("Belum ada gambar yang selesai", conciseError || agentMessage, "!");
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
  const projectId = activeProject.id;
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
    if (activeProject?.id !== projectId || activeProject.headlineMode !== "ai") return false;
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
    activeProject.style = activeProject.style || "Eksploratif";
    if (!generatedImages.some((image) => image?.compositionMode === "ai")) {
      const posterCopy = getWorkspacePosterCopy();
      activeProject.brandName = posterCopy.brand;
      activeProject.headline = posterCopy.headline;
      activeProject.headlineMode = activeProject.headlineMode === "ai" ? "ai" : "manual";
      activeProject.cta = posterCopy.cta;
    }
    activeProject.primaryColor = $("#color-control").value;
    activeProject.quality = $("#quality-select").value;
    activeProject.brandLogos = getBrandLogos(activeProject);
    delete activeProject.brandLogo;
    activeProject.generationCount = selectedGenerationCount;
    activeProject.agentTier = selectedAgentTier;
    activeProject.creationMode = activeProject.creationMode === "product" ? "product" : "prompt";
    activeProject.productImages = getProductImages(activeProject);
    delete activeProject.productImage;
    saveProjects();
    $("#save-status").innerHTML = "<i></i> Tersimpan";
  }, 700);
}
