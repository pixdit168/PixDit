function bindEvents() {
  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedAccountState()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("resize", () => scheduleAdaptiveLogos(document), { passive: true });
  $$('[data-auth-home]').forEach((brandLink) => {
    brandLink.addEventListener("click", (event) => {
      event.preventDefault();
      closeAuthPanel();
    });
  });
  $("#auth-open").addEventListener("click", () => openAuthPanel());
  $("#hero-login").addEventListener("click", () => openAuthPanel());
  $("#auth-panel-close").addEventListener("click", closeAuthPanel);
  $("#auth-panel").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAuthPanel();
  });
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#login-form .auth-submit");
    button.disabled = true;
    setAuthError();
    try {
      await authStartup;
      const session = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("#email").value.trim(),
          password: $("#password").value,
          remember: false,
        }),
      });
      await enterApp(session);
      $("#password").value = "";
    } catch (error) {
      if (error.data?.verificationRequired) {
        $("#password").value = "";
        showEmailVerification(error.data.email);
      }
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
      await authStartup;
      const session = await requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: $("#register-name").value.trim(),
          email: $("#register-email").value.trim(),
          password,
          remember: false,
          ...getSignupDeviceIdentity(),
        }),
      });
      showEmailVerification(session.email, session.resendAfterSeconds || 60);
      $("#register-form").reset();
    } catch (error) {
      setAuthError(error.message || "Akun belum dapat dibuat.");
    } finally {
      button.disabled = false;
    }
  });
  $("#verification-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#verification-form .auth-submit");
    button.disabled = true;
    setAuthError();
    try {
      await authStartup;
      const session = await requestJson("/api/auth/verify-email", {
        method: "POST", body: JSON.stringify({ email: verificationEmail, token: $("#verification-code").value.trim() }),
      });
      $("#verification-code").value = "";
      await enterApp(session);
      showToast("Email terverifikasi", "Ruang kreatif pribadimu siap digunakan.", "✓");
    } catch (error) {
      setAuthError(error.message || "Email belum dapat diverifikasi.");
    } finally {
      button.disabled = false;
    }
  });
  $("#resend-verification").addEventListener("click", async () => {
    $("#resend-verification").disabled = true;
    setAuthError();
    try {
      await authStartup;
      const result = await requestJson("/api/auth/resend-verification", { method: "POST", body: JSON.stringify({ email: verificationEmail }) });
      verificationResendUntil = Date.now() + (result.resendAfterSeconds || 60) * 1000;
      $("#verification-status").textContent = "Kode baru telah diminta. Periksa kotak masuk dan folder spam, lalu gunakan kode terbaru.";
    } catch (error) {
      verificationResendUntil = Date.now() + (error.data?.resendAfterSeconds || 60) * 1000;
      setAuthError(error.message || "Kode belum dapat dikirim ulang.");
    } finally {
      updateVerificationResend();
    }
  });
  $("#verification-back").addEventListener("click", () => {
    $("#email").value = verificationEmail;
    $("#verification-code").value = "";
    showAuthMode("login");
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
    if (popover.contains(event.target) || (event.target as Element).closest("#profile-button, #mobile-profile-button")) return;
    closeAccountMenu();
  });
  document.addEventListener("click", (event) => {
    if ((event.target as Element).closest(".project-options-button, .project-action-menu")) return;
    $$(".project-action-menu").forEach((menu) => menu.classList.add("is-hidden"));
    $$(".project-options-button").forEach((button) => button.setAttribute("aria-expanded", "false"));
  });
  document.addEventListener("click", (event) => {
    if (!(event.target as Element).closest("#agent-dropdown")) closeAgentMenu();
  });
  window.addEventListener("resize", () => {
    closeAccountMenu();
    closeAgentMenu();
  });

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
  $("#delete-library-close").addEventListener("click", () => closeDeleteLibraryModal({ restoreFocus: true }));
  $("#cancel-delete-library").addEventListener("click", () => closeDeleteLibraryModal({ restoreFocus: true }));
  $("#confirm-delete-library").addEventListener("click", deletePendingLibraryItems);
  $("#library-select-all").addEventListener("change", (event) => selectAllLibraryItems(event.target.checked));
  $("#library-clear-selection").addEventListener("click", () => selectAllLibraryItems(false));
  $("#library-delete-selected").addEventListener("click", openDeleteLibraryModal);
  $("#delete-library-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDeleteLibraryModal({ restoreFocus: true });
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
      brandLogos: [],
      logoPositions: {},
      headlineMode: "ai",
      styleExplicit: Boolean(accountPreferences?.defaultStyle && accountPreferences.defaultStyle !== "Eksploratif"),
      primaryColorExplicit: Boolean(accountPreferences?.primaryColor && accountPreferences.primaryColor !== "#5a3529"),
      quality: "1mp",
      generationCount: 1,
      agentTier: isSubscriber() ? "pro" : "free",
      creationMode: "prompt",
      productImages: [],
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
  $$('[data-headline-mode]').forEach((button) => button.addEventListener("click", () => {
    setHeadlineMode(button.dataset.headlineMode);
    if (button.dataset.headlineMode === "ai" && $("#prompt-input").value.trim()) void suggestHeadline();
  }));
  $$(".creation-mode-option").forEach((button) => {
    button.addEventListener("click", () => selectCreationMode(button.dataset.creationMode));
  });
  $("#product-image-input").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeProject) return;
    try {
      if (getProductImages(activeProject).length + files.length > MAX_PRODUCT_IMAGES) throw new Error(`Maksimal ${MAX_PRODUCT_IMAGES} gambar produk per proyek.`);
      const optimized = await Promise.all(files.map(optimizeProductImage));
      addProductImages(activeProject, optimized);
      activeProject.creationMode = "product";
      renderCreationMode();
      markSaving();
      showToast("Gambar produk siap", `${activeProject.productImages.length} gambar siap digunakan.`, "✓");
    } catch (error) {
      showToast("Gambar produk belum dapat digunakan", error.message, "!");
    } finally {
      event.target.value = "";
    }
  });
  $("#product-image-preview").addEventListener("click", (event) => {
    if (!activeProject) return;
    const button = event.target.closest("[data-remove-product-image]");
    if (!button) return;
    removeProductImage(activeProject, Number(button.dataset.removeProductImage));
    renderProductImagePreview();
    markSaving();
  });
  $("#brand-logo-input").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeProject) return;
    try {
      if (getBrandLogos(activeProject).length + files.length > MAX_BRAND_LOGOS) throw new Error(`Maksimal ${MAX_BRAND_LOGOS} logo per proyek.`);
      const optimized = await Promise.all(files.map(optimizeBrandLogo));
      addBrandLogos(activeProject, optimized);
      renderBrandLogoPreview();
      markSaving();
      showToast("Logo siap digunakan", "AI akan menempatkannya saat gambar baru dibuat.", "✓");
    } catch (error) {
      showToast("Logo belum dapat digunakan", error.message, "!");
    } finally {
      event.target.value = "";
    }
  });
  $("#brand-logo-preview").addEventListener("click", (event) => {
    if (!activeProject) return;
    const removeButton = event.target.closest("[data-remove-brand-logo]");
    if (!removeButton) return;
    removeBrandLogo(activeProject, Number(removeButton.dataset.removeBrandLogo));
    renderBrandLogoPreview();
    markSaving();
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
          style: "",
          format: $("#format-select").value,
          brand: activeProject?.brandName || activeProject?.name || "",
          headline: "",
          cta: "",
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
  $("#format-select").addEventListener("change", () => {
    markSaving();
    if (activeProject?.hasResults) renderConcepts(false, generatedImages);
  });
  $("#quality-select").addEventListener("change", () => {
    if (!isSubscriber() && $("#quality-select").value !== "1mp") {
      $("#quality-select").value = "1mp";
      openUpgradeModal("Kualitas Detail dan Maksimal tersedia pada Pixgin Pro.");
    }
    updateGenerationControls();
    markSaving();
  });
  $$(".generation-count-option").forEach((button) => {
    button.addEventListener("click", () => selectGenerationCount(button.dataset.imageCount));
  });
  $("#agent-trigger").addEventListener("click", toggleAgentMenu);
  $$(".agent-option").forEach((button) => {
    button.addEventListener("click", () => selectAgentTier(button.dataset.agentTier));
  });
  $("#generate-button").addEventListener("click", startGeneration);
  $("#cancel-generation").addEventListener("click", cancelGeneration);

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
    const deleteLibraryModal = $("#delete-library-modal");
    if (!deleteLibraryModal.classList.contains("is-hidden")) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteLibraryModal({ restoreFocus: true });
      }
      if (event.key === "Tab") {
        const buttons = $$("button:not(:disabled)", deleteLibraryModal);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const outsideDialog = !deleteLibraryModal.contains(document.activeElement);
        if (!buttons.length) event.preventDefault();
        else if (event.shiftKey && (document.activeElement === first || outsideDialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || outsideDialog)) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    if (event.key !== "Escape") return;
    closeAuthPanel();
    closeAccountMenu({ restoreFocus: true });
    closeAgentMenu({ restoreFocus: true });
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
  // Reset the UI before accepting clicks, never after asynchronous session cleanup.
  showAuthScreen();
  authStartup = clearPreviousSession();
  bindEvents();
  updateCharacterCount();
  localStorage.removeItem("kanvas_session");

  await authStartup;
  document.documentElement.dataset.appReady = "true";
}

if (typeof document !== "undefined") bootstrap();
