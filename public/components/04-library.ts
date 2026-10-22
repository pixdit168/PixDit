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
      const conceptIndex = variationIndex(item.conceptIndex);
      const label = variationName(conceptIndex);
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
              ${imageSource ? `<img class="generated-image" src="${escapeHtml(imageSource)}" alt="${escapeHtml(label)}" style="filter:${escapeHtml(getColorGradeFilter(current.colorGrade))}" />` : ""}
              <div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy)}</div>
            </div>
            <span class="library-version-badge">${isOriginal ? "ORIGINAL" : `VERSI ${versions.indexOf(current) + 1}`}</span>
          </div>
          <div class="library-card-body">
            <div class="library-card-title"><div><small>${escapeHtml(item.projectName || "Proyek Kanvas")}</small><h3>${escapeHtml(label)}</h3></div><span class="original-lock" title="Gambar awal terkunci">◆ Aman</span></div>
            <p>${escapeHtml(item.category || "Bisnis lokal")} · ${versions.length} versi</p>
            <div class="version-strip" aria-label="Pilih versi">
              ${versions.map((version, index) => `<button class="version-pill ${version.id === current.id ? "active" : ""}" data-version-id="${escapeHtml(version.id)}" type="button" title="${escapeHtml(version.refinement || "Gambar original")}">${index === 0 ? "Original" : `V${index + 1}`}</button>`).join("")}
            </div>
            <div class="library-card-actions">
              <button class="secondary-button library-preview-button" type="button">Preview</button>
              <button class="secondary-button library-download" type="button">Unduh</button>
              <button class="dark-button library-edit" type="button">✦ Edit salinan</button>
              <button class="library-delete" type="button" aria-label="Hapus ${escapeHtml(label)} dari Koleksi">Hapus</button>
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
    $(".library-delete", card).addEventListener("click", () => openDeleteLibraryModal(itemId));
  });
}

function openDeleteLibraryModal(itemId) {
  const item = getLibraryItem(itemId);
  if (!item || libraryDeletionInProgress) return;
  pendingDeleteLibraryId = itemId;
  $("#delete-library-name").textContent = `${item.projectName || "Desain"} · ${variationName(variationIndex(item.conceptIndex))}`;
  $("#delete-library-error").textContent = "";
  $("#delete-library-error").classList.add("is-hidden");
  $("#delete-library-modal").classList.remove("is-hidden");
  $("#delete-library-modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#cancel-delete-library").focus(), 50);
}

function closeDeleteLibraryModal({ restoreFocus = false, force = false } = {}) {
  if (libraryDeletionInProgress && !force) return;
  const itemId = pendingDeleteLibraryId;
  pendingDeleteLibraryId = null;
  $("#delete-library-modal")?.classList.add("is-hidden");
  $("#delete-library-modal")?.setAttribute("aria-hidden", "true");
  if (restoreFocus && itemId) setTimeout(() => $(`.library-card[data-library-id="${CSS.escape(itemId)}"] .library-delete`)?.focus(), 0);
}

async function deletePendingLibraryItem() {
  const itemId = pendingDeleteLibraryId;
  const item = getLibraryItem(itemId);
  if (libraryDeletionInProgress) return;
  if (!item) return closeDeleteLibraryModal();
  libraryDeletionInProgress = true;
  const button = $("#confirm-delete-library");
  button.disabled = true;
  button.textContent = "Menghapus...";
  $("#cancel-delete-library").disabled = true;
  $("#delete-library-close").disabled = true;
  $("#delete-library-error").classList.add("is-hidden");
  clearTimeout(accountStateTimer);
  const account = currentUser;
  try {
    await queueAccountStateWrite(async () => {
      await requestJson("/api/state", {
        method: "PUT",
        body: JSON.stringify({ projects, library: libraryItems.filter((candidate) => candidate.id !== itemId) }),
      });
      if (currentUser === account) libraryItems = libraryItems.filter((candidate) => candidate.id !== itemId);
    });
    if (currentUser !== account) return;
    if (activeLibraryPreviewId === itemId) closeLibraryPreview();
    if (activeLibraryItemId === itemId) closeRefineDrawer();
    renderLibrary();
    showToast("Desain dihapus", "Desain dan versi editnya dihapus dari Koleksi. Hasil di proyek tetap tersimpan.", "✓");
    libraryDeletionInProgress = false;
    closeDeleteLibraryModal();
    $("#library-to-projects").focus();
  } catch (error) {
    if (currentUser !== account) return;
    if (error.status === 401) {
      libraryDeletionInProgress = false;
      showAuthScreen("Sesi kamu telah berakhir. Silakan masuk kembali.");
      return;
    }
    $("#delete-library-error").textContent = error.message || "Desain belum dapat dihapus. Silakan coba kembali.";
    $("#delete-library-error").classList.remove("is-hidden");
  } finally {
    libraryDeletionInProgress = false;
    button.disabled = false;
    button.textContent = "Hapus desain";
    $("#cancel-delete-library").disabled = false;
    $("#delete-library-close").disabled = false;
    if (currentUser !== account) closeDeleteLibraryModal();
  }
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
  const conceptIndex = variationIndex(item.conceptIndex);
  const poster = $("#library-preview-poster");
  const posterCopy = getLibraryPosterCopy(item);
  const versionIndex = item.versions.findIndex((candidate) => candidate.id === version.id);
  const grade = normalizeColorGrade(version.colorGrade);
  version.colorGrade = grade;
  $("#library-preview-title").textContent = variationName(conceptIndex);
  $("#library-preview-version").textContent = `${item.projectName || "Proyek Kanvas"} · ${versionIndex === 0 ? "Original" : `Versi ${versionIndex + 1}`}`;
  poster.className = `poster poster-${conceptIndex + 1} ${getPosterFormatClass(item.format)} api-poster`;
  poster.innerHTML = `<img class="generated-image" src="${escapeHtml(version.url)}" alt="Preview penuh ${escapeHtml(variationName(conceptIndex))}" style="filter:${escapeHtml(getColorGradeFilter(grade))}" /><div class="${posterCopyClass(posterCopy)}">${posterCopyMarkup(posterCopy)}</div>`;
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
