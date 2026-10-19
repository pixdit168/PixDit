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

function bindProjectCards(grid, { beforeOpen }: { beforeOpen?: any } = {}) {
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

function renderProjectCards(grid, projectList, options = {}) {
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
  const savedImageCount = Array.isArray(activeProject.generatedImages) ? activeProject.generatedImages.length : 0;
  selectedGenerationCount = Number(activeProject.generationCount) === 10 || savedImageCount === 10 ? 10 : 1;
  if (!isSubscriber()) selectedGenerationCount = 1;
  selectedAgentTier = activeProject.agentTier === "free" ? "free" : (isSubscriber() ? "pro" : "free");
  activeProject.creationMode = activeProject.creationMode === "product" ? "product" : "prompt";
  activeProject.brandLogos = getBrandLogos(activeProject);
  delete activeProject.activeBrandLogoIndex;
  delete activeProject.brandLogo;
  activeProject.productImages = getProductImages(activeProject);
  delete activeProject.productImage;
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
  renderGenerationCountSelector();
  renderAgentSelector();
  renderCreationMode();
  updateGenerationControls();
  renderBrandLogoPreview();
  clearSelection();
  showView("workspace");

  if (activeProject.hasResults) {
    $("#empty-results").classList.add("is-hidden");
    renderConcepts(false, generatedImages);
    const resultCount = generatedImages.filter((image) => image?.url).length;
    $("#results-subtitle").textContent = `${resultCount || selectedGenerationCount} gambar dibuat dari brief-mu.`;
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
