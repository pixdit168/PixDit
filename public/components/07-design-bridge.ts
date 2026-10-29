let designEditorModule: Promise<any> | null = null;
let editableDesignAvailable: boolean | null = null;
function loadDesignEditor() {
  if ((window as any).PixginDesignEditor)
    return Promise.resolve((window as any).PixginDesignEditor);
  if (designEditorModule) return designEditorModule;
  designEditorModule = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/editor.css";
    const script = document.createElement("script");
    script.src = "/editor.js";
    script.async = true;
    const loadedCss = new Promise<void>((done, fail) => {
      css.onload = () => done();
      css.onerror = () => fail(new Error("Stylesheet editor gagal dimuat."));
    });
    const loadedScript = new Promise<void>((done, fail) => {
      script.onload = () => done();
      script.onerror = () => fail(new Error("Editor gagal dimuat."));
    });
    document.head.append(css, script);
    Promise.all([loadedCss, loadedScript])
      .then(() => resolve((window as any).PixginDesignEditor))
      .catch((error) => {
        css.remove();
        script.remove();
        designEditorModule = null;
        reject(error);
      });
  });
  return designEditorModule;
}
function selectedGenerationMode() {
  return $("#generation-mode")?.value === "editable" ? "editable" : "poster";
}
function generationModeNote() {
  return selectedGenerationMode() === "editable"
    ? "Susunan layer dibuat lokal tanpa panggilan planner AI. Hanya model gambar yang dipanggil. Teks dari kolom atau tanda kutip di brief dan upload menjadi layer terpisah."
    : "Agent Free/Pro membuat gambar langsung, tanpa planner AI tambahan. Buka Edit desain untuk menambahkan teks, logo, gambar, dan bentuk di atas hasilnya.";
}
function renderGenerationMode() {
  const select = $("#generation-mode");
  if (!select) return;
  // Older projects inherited editable mode automatically. Require an explicit choice.
  const preferred = activeProject?.editableGenerationOptIn === true && activeProject?.generationMode === "editable" ? "editable" : "poster";
  select.value = editableDesignAvailable === false ? "poster" : preferred;
  $("#generation-mode-note").textContent =
    editableDesignAvailable === false
      ? "Editor perlu setup Supabase (supabase/designs.sql). Poster utuh tetap tersedia."
      : generationModeNote();
  $("#generation-wording").classList.toggle(
    "is-hidden",
    selectedGenerationMode() !== "editable",
  );
  $("#design-wording-manual").checked =
    activeProject?.designWordingManual === true;
  $("#design-wording-fields").classList.toggle(
    "is-hidden",
    !$("#design-wording-manual").checked,
  );
  for (const role of ["brand", "headline", "body", "cta"])
    $("#design-wording-" + role).value =
      activeProject?.designWording?.[role] ?? "";
}
function bindDesignBridge() {
  $("#generation-mode").addEventListener("change", () => {
    if (activeProject) {
      activeProject.generationMode = selectedGenerationMode();
      activeProject.editableGenerationOptIn = selectedGenerationMode() === "editable";
    }
    $("#generation-mode-note").textContent = generationModeNote();
    $("#generation-wording").classList.toggle(
      "is-hidden",
      selectedGenerationMode() !== "editable",
    );
    renderProductModelNotice();
    markSaving();
  });
  $("#design-wording-manual").addEventListener("change", () => {
    if (activeProject)
      activeProject.designWordingManual = $("#design-wording-manual").checked;
    $("#design-wording-fields").classList.toggle(
      "is-hidden",
      !$("#design-wording-manual").checked,
    );
    markSaving();
  });
  for (const role of ["brand", "headline", "body", "cta"])
    $("#design-wording-" + role).addEventListener("input", () => {
      if (activeProject) {
        activeProject.designWording = {
          ...(activeProject.designWording || {}),
          [role]: $("#design-wording-" + role).value,
        };
      }
      markSaving();
    });
}
async function prepareEditablePreview(image, documentData) {
  const account = currentUser;
  try {
    const editor = await loadDesignEditor();
    if (currentUser !== account) return;
    const preview = await editor.renderPreview(documentData, true);
    const result = await requestJson(`/api/designs/${image.designId}/preview`, {
      method: "POST",
      body: JSON.stringify({ expectedRevision: 1, preview }),
    });
    if (currentUser !== account) return;
    image.url = result.version.previewUrl;
    image.displayUrl = result.version.previewUrl;
    image.designVersionId = result.version.id;
    image.designRevision = result.version.revision;
  } catch (error) {
    image.previewError = true;
    if (currentUser === account)
      showToast(
        "Desain tersimpan, preview tertunda",
        `${error.message} Buka Edit desain untuk mencoba lagi.`,
        "!",
      );
  }
}
async function openDesignForItem(itemId) {
  const item = getLibraryItem(itemId),
    version = getCurrentLibraryVersion(item);
  if (!item || !version?.url) return;
  const account = currentUser;
  try {
    const editor = await loadDesignEditor();
    if (currentUser !== account) return;
    let designId = version.designId || version.editorDesignId;
    if (!designId) {
      // Existing posters remain a locked background, not falsely extracted objects.
      let sourcePreview;
      const copy = getLibraryPosterCopy(item),
        grade = normalizeColorGrade(version.colorGrade);
      if (
        copy.brand ||
        copy.headline ||
        copy.cta ||
        copy.logos.length ||
        JSON.stringify(grade) !== JSON.stringify(defaultColorGrade)
      ) {
        const source = await loadPosterImage(version.url),
          canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.filter = getColorGradeFilter(grade);
        context.drawImage(source, 0, 0);
        context.filter = "none";
        if (copy.brand || copy.headline || copy.cta) {
          const layout = getCanvasPosterLayout(item.conceptIndex);
          drawCanvasPosterOverlay(
            context,
            canvas.width,
            canvas.height,
            layout.overlay,
          );
          drawCanvasPosterText(
            context,
            canvas.width,
            canvas.height,
            copy,
            layout,
          );
        }
        for (const logo of getPosterLogos(copy))
          await drawAdaptiveCanvasLogo(
            context,
            canvas.width,
            canvas.height,
            logo,
          );
        sourcePreview = canvas.toDataURL("image/jpeg", 0.9);
      }
      const result = await requestJson("/api/designs", {
        method: "POST",
        body: JSON.stringify({
          sourceUrl: version.url,
          sourcePreview,
          title: item.projectName || "Desain",
        }),
      });
      if (currentUser !== account) return;
      designId = result.design.id;
      version.editorDesignId = designId; // Import link only; original rendering is unchanged.
      saveLibrary();
    }
    $("#toast")?.classList.remove("show");
    await editor.open({
      designId: designId || version.editorDesignId,
      csrfToken,
      onUsage: (usage) => {
        usageState = usage;
        updatePlanInterface();
      },
      onSaved: ({ designId, version: saved }) => {
        if (currentUser !== account || getLibraryItem(itemId) !== item) return;
        let existing = item.versions.find(
          (v) =>
            v.designId === designId &&
            (v.designVersionId === saved.id ||
              (!v.designVersionId && saved.original)),
        );
        if (!existing) {
          existing = {
            id: `${item.id}-design-${saved.id}`,
            createdAt: saved.createdAt,
            immutable: false,
            refinement: "Edit desain",
            colorGrade: { ...defaultColorGrade },
          };
          item.versions.push(existing);
        }
        Object.assign(existing, {
          url: saved.previewUrl,
          designId,
          designVersionId: saved.id,
          designRevision: saved.revision,
          compositionMode: "editable",
        });
        item.currentVersionId = existing.id;
        saveLibrary();
        renderLibrary();
      },
    });
  } catch (error) {
    showToast("Editor belum dapat dibuka", error.message, "!");
  }
}
async function openDesignForResult(index) {
  selectConcept(index);
  let item = findSavedSelection();
  if (!item) {
    saveSelectedToLibrary();
    item = findSavedSelection();
  }
  if (item) await openDesignForItem(item.id);
}
async function downloadEditableDesign(
  designId,
  versionId,
  fileName,
  revision?,
  colorGrade = defaultColorGrade,
) {
  const editor = await loadDesignEditor();
  const result = await requestJson(`/api/designs/${designId}/versions`);
  const version =
    result.versions.find((value) => value.id === versionId) ||
    result.versions.find((value) => value.revision === revision) ||
    result.versions[0];
  if (!version) throw new Error("Versi desain tidak ditemukan.");
  let data = await editor.renderPreview(version.document, false);
  const grade = normalizeColorGrade(colorGrade);
  if (JSON.stringify(grade) !== JSON.stringify(defaultColorGrade)) {
    const image = await loadPosterImage(data),
      canvas = document.createElement("canvas");
    canvas.width = version.document.width;
    canvas.height = version.document.height;
    const context = canvas.getContext("2d");
    context.filter = getColorGradeFilter(grade);
    context.drawImage(image, 0, 0);
    data = canvas.toDataURL("image/png");
  }
  const raw = atob(data.split(",")[1]),
    bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" })),
    link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
