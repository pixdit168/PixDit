type CanvasElement = { id: string; kind: string; name: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean; url?: string; text?: string; fontSize?: number; fontFamily?: string; color?: string; bold?: boolean; align?: string };
type EditableCanvas = { version: number; width: number; height: number; layers: CanvasElement[]; grading?: { brightness: number; contrast: number; saturation: number; warmth: number }[] };
let layerEditor: { itemId: string; baseVersionId: string; document: EditableCanvas; selected: string | null; past: string[]; future: string[]; saved: string; busy: boolean; controller: AbortController | null; trigger: HTMLElement | null; composedSource?: string } | null = null;
const editorImages = new Map<string, { image: HTMLImageElement; pixels: Uint8ClampedArray }>();
let editorRenderId = 0;
const canvasElementId = (kind: string) => `${kind}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

function canvasSnapshot() { return JSON.stringify(layerEditor?.document); }
function canvasCheckpoint() {
  if (!layerEditor || layerEditor.busy) return;
  layerEditor.past.push(canvasSnapshot());
  while (layerEditor.past.length > 1 && (layerEditor.past.length > 40 || layerEditor.past.reduce((size, snapshot) => size + snapshot.length, 0) > 8_000_000)) layerEditor.past.shift();
  layerEditor.future = [];
}
function canvasUndo(redo = false) {
  if (!layerEditor || layerEditor.busy) return;
  const source = redo ? layerEditor.future : layerEditor.past;
  const target = redo ? layerEditor.past : layerEditor.future;
  if (!source.length) return;
  target.push(canvasSnapshot());
  layerEditor.document = JSON.parse(source.pop());
  layerEditor.selected = null;
  renderLayerEditor();
}
function selectedCanvasElement() { return layerEditor?.document.layers.find(layer => layer.id === layerEditor.selected); }

async function getEditorImage(url: string) {
  if (editorImages.has(url)) return editorImages.get(url);
  if (!url.startsWith("/generated/") && !/^data:image\/(png|jpeg|webp);base64,/.test(url)) throw new Error("Sumber elemen tidak valid.");
  const image = await loadPosterImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const entry = { image, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
  editorImages.set(url, entry);
  return entry;
}

function canvasTextLines(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > width) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);
  }
  return lines;
}

async function drawEditableCanvas(documentData: EditableCanvas, canvas: HTMLCanvasElement) {
  canvas.width = documentData.width; canvas.height = documentData.height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const layer of documentData.layers) {
    if (!layer.visible) continue;
    context.save();
    context.globalAlpha = layer.opacity;
    context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
    context.rotate(layer.rotation * Math.PI / 180);
    context.translate(-layer.width / 2, -layer.height / 2);
    if (layer.kind === "image") {
      const entry = await getEditorImage(layer.url);
      context.drawImage(entry.image, 0, 0, layer.width, layer.height);
    } else {
      context.fillStyle = layer.color;
      context.font = `${layer.bold ? "700" : "400"} ${layer.fontSize}px ${layer.fontFamily}`;
      context.textBaseline = "top";
      context.textAlign = layer.align as CanvasTextAlign;
      const x = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
      canvasTextLines(context, layer.text, layer.width).forEach((line, index) => context.fillText(line, x, index * layer.fontSize * 1.2));
    }
    context.restore();
  }
  for (const grade of documentData.grading || []) {
    const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height; copy.getContext("2d").drawImage(canvas, 0, 0);
    context.save(); context.clearRect(0, 0, canvas.width, canvas.height); context.filter = getColorGradeFilter(grade); context.drawImage(copy, 0, 0); context.restore();
  }
}

// Inverse rotation and per-pixel alpha hit testing avoid selecting empty PNG padding.
function canvasLocalPoint(layer: CanvasElement, x: number, y: number) {
  const dx = x - layer.x - layer.width / 2, dy = y - layer.y - layer.height / 2;
  const angle = -layer.rotation * Math.PI / 180;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle) + layer.width / 2, y: dx * Math.sin(angle) + dy * Math.cos(angle) + layer.height / 2 };
}
function hitCanvasElement(documentData: EditableCanvas, x: number, y: number) {
  for (const layer of [...documentData.layers].reverse()) {
    if (!layer.visible || layer.locked || layer.opacity <= 0) continue;
    const point = canvasLocalPoint(layer, x, y);
    if (point.x < 0 || point.y < 0 || point.x >= layer.width || point.y >= layer.height) continue;
    const entry = layer.kind === "image" ? editorImages.get(layer.url) : null;
    if (layer.kind === "image" && (!entry || entry.pixels[(Math.floor(point.y / layer.height * entry.image.naturalHeight) * entry.image.naturalWidth + Math.floor(point.x / layer.width * entry.image.naturalWidth)) * 4 + 3] < 16)) continue;
    return layer;
  }
  return null;
}

async function openLayerEditor(itemId: string) {
  const item = getLibraryItem(itemId), version = getCurrentLibraryVersion(item);
  if (!version?.url) return showToast("Gambar belum tersedia", "Simpan hasil AI ke Koleksi terlebih dahulu.", "!");
  if (layerEditor && !closeLayerEditor()) return;
  layerEditor = { itemId, baseVersionId: version.id, document: null, selected: null, past: [], future: [], saved: "null", busy: true, controller: null, trigger: document.activeElement as HTMLElement };
  const state = layerEditor;
  $("#canvas-editor").classList.remove("is-hidden");
  $("#canvas-editor").setAttribute("aria-hidden", "false");
  $("#canvas-editor-close").focus();
  $("#canvas-editor-error").textContent = "";
  $("#canvas-editor-layers").innerHTML = "";
  $("#canvas-element-controls").classList.add("is-hidden");
  $("#canvas-editor-selection").classList.add("is-hidden");
  ($("#canvas-editor-canvas") as HTMLCanvasElement).width = 1;
  void renderLayerEditor();
  try {
    const source = await getEditorImage(version.url);
    if (layerEditor !== state) return;
    let baseUrl = version.url;
    const copy = getLibraryPosterCopy(item), grade = normalizeColorGrade(version.colorGrade);
    if (!version.canvasDocument && !version.layerDocument && (copy.brand || copy.headline || copy.cta || copy.logos.length || JSON.stringify(grade) !== JSON.stringify(defaultColorGrade))) {
      const composed = document.createElement("canvas"); composed.width = source.image.naturalWidth; composed.height = source.image.naturalHeight;
      const context = composed.getContext("2d", { willReadFrequently: true });
      context.filter = getColorGradeFilter(grade); context.drawImage(source.image, 0, 0); context.filter = "none";
      if (copy.brand || copy.headline || copy.cta) { const layout = getCanvasPosterLayout(item.conceptIndex); drawCanvasPosterOverlay(context, composed.width, composed.height, layout.overlay); drawCanvasPosterText(context, composed.width, composed.height, copy, layout); }
      for (const logo of getPosterLogos(copy)) await drawAdaptiveCanvasLogo(context, composed.width, composed.height, logo);
      baseUrl = composed.toDataURL("image/jpeg", .9);
      state.composedSource = baseUrl;
    }
    if (layerEditor !== state) return;
    state.document = JSON.parse(JSON.stringify(version.canvasDocument || version.layerDocument || { version: 1, width: source.image.naturalWidth, height: source.image.naturalHeight, layers: [{ id: "original", kind: "image", name: "Gambar utuh (belum dipisah)", url: baseUrl, x: 0, y: 0, width: source.image.naturalWidth, height: source.image.naturalHeight, rotation: 0, opacity: 1, visible: true, locked: true }] }));
    if (version.canvasDocument && JSON.stringify(grade) !== JSON.stringify(defaultColorGrade)) state.document.grading = [...(state.document.grading || []), grade].slice(-12);
    state.saved = canvasSnapshot();
  } catch (error) { $("#canvas-editor-error").textContent = error.message; }
  finally { if (layerEditor === state) { state.busy = false; renderLayerEditor(); } }
}

function closeLayerEditor(force = false) {
  if (!layerEditor) return true;
  if (!force && layerEditor.busy && !layerEditor.controller) return false;
  if (!force && canvasSnapshot() !== layerEditor.saved && !window.confirm("Tutup editor tanpa menyimpan perubahan?")) return false;
  layerEditor.controller?.abort();
  const trigger = layerEditor.trigger;
  layerEditor = null;
  editorImages.clear();
  editorRenderId++;
  $("#canvas-editor").classList.add("is-hidden");
  $("#canvas-editor").setAttribute("aria-hidden", "true");
  if (!force && trigger?.isConnected) trigger.focus();
  return true;
}

async function renderLayerEditor() {
  if (!layerEditor) return;
  const state = layerEditor, token = ++editorRenderId;
  const data = state.document;
  $("#canvas-editor-status").textContent = state.busy ? "Memproses…" : "Klik elemen untuk memilih; tarik untuk memindahkan. Original tetap aman.";
  for (const button of $$("#canvas-editor button:not(#canvas-editor-close)")) button.disabled = state.busy || !data;
  $("#canvas-editor-undo").disabled = state.busy || !state.past.length;
  $("#canvas-editor-redo").disabled = state.busy || !state.future.length;
  $("#canvas-editor-cancel").classList.toggle("is-hidden", !state.controller);
  $("#canvas-editor-cancel").disabled = !state.controller;
  const baseVersion = getLibraryItem(state.itemId)?.versions.find(version => version.id === state.baseVersionId);
  const cached = Boolean(baseVersion?.canvasDocument || baseVersion?.layerDocument);
  $("#canvas-editor-decompose").textContent = cached ? "Pulihkan layer tersimpan · gratis" : "Pisahkan elemen AI · 3 kredit";
  $("#canvas-layer-count").disabled = state.busy || cached;
  if (!data) return;
  $("#canvas-editor-save").disabled = state.busy;
  $("#canvas-editor-stage").style.aspectRatio = `${data.width}/${data.height}`;
  $("#canvas-editor-layers").innerHTML = [...data.layers].reverse().map(layer => `<div class="canvas-layer-row ${layer.id === state.selected ? "selected" : ""}"><button type="button" data-layer-select="${escapeHtml(layer.id)}">${escapeHtml(layer.name)}</button><button type="button" data-layer-visible="${escapeHtml(layer.id)}" aria-label="${layer.visible ? "Sembunyikan" : "Tampilkan"} ${escapeHtml(layer.name)}">${layer.visible ? "◉" : "○"}</button><button type="button" data-layer-lock="${escapeHtml(layer.id)}" aria-label="${layer.locked ? "Buka kunci" : "Kunci"} ${escapeHtml(layer.name)}">${layer.locked ? "🔒" : "◇"}</button></div>`).join("");
  $$("#canvas-editor-layers button").forEach(button => button.disabled = state.busy);
  const selected = selectedCanvasElement();
  $("#canvas-element-controls").classList.toggle("is-hidden", !selected);
  if (selected) {
    $("#canvas-element-name").textContent = selected.name;
    for (const key of ["x", "y", "width", "height", "rotation", "opacity"]) $("#canvas-element-" + key).value = String(selected[key]);
    $("#canvas-text-controls").classList.toggle("is-hidden", selected.kind !== "text");
    $("#canvas-replace-text").classList.toggle("is-hidden", selected.kind !== "image");
    if (selected.kind === "text") for (const key of ["text", "fontSize", "fontFamily", "color", "align"]) $("#canvas-element-" + key).value = String(selected[key]);
    if (selected.kind === "text") $("#canvas-element-bold").checked = selected.bold;
    $$("#canvas-element-controls input, #canvas-element-controls textarea, #canvas-element-controls select, #canvas-element-controls button").forEach(control => control.disabled = state.busy || selected.locked);
  }
  const staging = document.createElement("canvas");
  try {
    await drawEditableCanvas(data, staging);
    if (layerEditor !== state || token !== editorRenderId) return;
    const canvas = $("#canvas-editor-canvas") as HTMLCanvasElement;
    canvas.width = data.width; canvas.height = data.height;
    canvas.getContext("2d").drawImage(staging, 0, 0);
    const selection = $("#canvas-editor-selection");
    selection.classList.toggle("is-hidden", !selected || !selected.visible);
    if (selected) { selection.style.left = `${selected.x / data.width * 100}%`; selection.style.top = `${selected.y / data.height * 100}%`; selection.style.width = `${selected.width / data.width * 100}%`; selection.style.height = `${selected.height / data.height * 100}%`; selection.style.transform = `rotate(${selected.rotation}deg)`; }
  } catch (error) { if (layerEditor === state) $("#canvas-editor-error").textContent = error.message; }
}

async function decomposeCanvasElements() {
  const state = layerEditor;
  if (!state || state.busy) return;
  if (canvasSnapshot() !== state.saved && !window.confirm("Pisahkan ulang dan buang perubahan yang belum disimpan?")) return;
  state.busy = true; state.controller = new AbortController();
  $("#canvas-editor-error").textContent = "";
  renderLayerEditor();
  try {
    clearTimeout(accountStateTimer);
    await queueAccountStateWrite(() => requestJson("/api/state", { method: "PUT", body: JSON.stringify({ projects, library: libraryItems }) }));
    const result = await requestJson("/api/layers/decompose", { method: "POST", signal: state.controller.signal, body: JSON.stringify({ itemId: state.itemId, baseVersionId: state.baseVersionId, count: Number($("#canvas-layer-count").value), composedSource: state.composedSource }) });
    if (layerEditor !== state) return;
    const item = getLibraryItem(state.itemId), version = item?.versions.find(version => version.id === state.baseVersionId);
    if (!version) throw new Error("Desain sudah dihapus dari Koleksi.");
    version.layerDocument = result.document;
    state.document = JSON.parse(JSON.stringify(result.document)); state.selected = null; state.past = []; state.future = []; state.saved = canvasSnapshot();
    usageState = result.usage; updatePlanInterface();
  } catch (error) { if (layerEditor === state) { $("#canvas-editor-error").textContent = error.name === "AbortError" ? "Pemisahan dibatalkan. Original tidak berubah." : error.message; if (error.data?.upgradeRequired) openUpgradeModal(error.message); } }
  finally { if (layerEditor === state) { state.busy = false; state.controller = null; renderLayerEditor(); } }
}

function addCanvasText(replace = false) {
  if (!layerEditor || layerEditor.busy || layerEditor.document.layers.length >= 32) return;
  const old = replace ? selectedCanvasElement() : null;
  if (old?.locked) return;
  canvasCheckpoint();
  if (old) old.visible = false;
  const data = layerEditor.document;
  const text: CanvasElement = { id: canvasElementId("text"), kind: "text", name: "Teks", text: "Tulis teksmu", x: old?.x ?? data.width * .1, y: old?.y ?? data.height * .1, width: old?.width ?? data.width * .7, height: old?.height ?? data.height * .2, rotation: old?.rotation ?? 0, opacity: 1, visible: true, locked: false, fontSize: Math.max(16, Math.round(data.width * .05)), fontFamily: "Arial", color: "#ffffff", bold: true, align: "left" };
  data.layers.push(text); layerEditor.selected = text.id; renderLayerEditor();
}

async function saveCanvasVersion() {
  const state = layerEditor;
  if (!state?.document || state.busy) return;
  state.busy = true; $("#canvas-editor-error").textContent = ""; renderLayerEditor();
  try {
    clearTimeout(accountStateTimer);
    await queueAccountStateWrite(() => requestJson("/api/state", { method: "PUT", body: JSON.stringify({ projects, library: libraryItems }) }));
    const canvas = document.createElement("canvas");
    await drawEditableCanvas(state.document, canvas);
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = false;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) { transparent = true; break; }
    const preview = canvas.toDataURL(transparent ? "image/png" : "image/jpeg", .9);
    const result = await requestJson("/api/layers/save", { method: "POST", body: JSON.stringify({ itemId: state.itemId, baseVersionId: state.baseVersionId, document: state.document, preview }) });
    if (layerEditor !== state) return;
    const item = getLibraryItem(state.itemId);
    if (!item) throw new Error("Desain sudah dihapus dari Koleksi.");
    item.versions.push(result.version); item.currentVersionId = result.version.id;
    state.baseVersionId = result.version.id; state.document = JSON.parse(JSON.stringify(result.version.canvasDocument)); state.saved = canvasSnapshot();
    renderLibrary(); showToast("Versi kanvas tersimpan", "Elemen dapat diedit lagi; gambar original tetap aman.", "✓");
  } catch (error) { $("#canvas-editor-error").textContent = error.message; }
  finally { if (layerEditor === state) { state.busy = false; renderLayerEditor(); } }
}

async function editGeneratedElements(index: number) {
  selectConcept(index);
  let item = findSavedSelection();
  if (!item) { saveSelectedToLibrary(); item = findSavedSelection(); }
  if (item) openLayerEditor(item.id);
}

function bindLayerEditorEvents() {
  $("#canvas-editor-close").addEventListener("click", () => closeLayerEditor());
  $("#canvas-editor-decompose").addEventListener("click", decomposeCanvasElements);
  $("#canvas-editor-cancel").addEventListener("click", () => layerEditor?.controller?.abort());
  $("#canvas-editor-save").addEventListener("click", saveCanvasVersion);
  $("#canvas-editor-undo").addEventListener("click", () => canvasUndo());
  $("#canvas-editor-redo").addEventListener("click", () => canvasUndo(true));
  $("#canvas-editor-add-text").addEventListener("click", () => addCanvasText());
  $("#canvas-replace-text").addEventListener("click", () => addCanvasText(true));
  $("#canvas-editor-upload").addEventListener("change", async (event) => {
    const state = layerEditor, file = event.target.files?.[0];
    if (!state || state.busy || !file || state.document.layers.length >= 32) return;
    try {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000) throw new Error("Gunakan PNG/JPG/WebP maksimal 10 MB.");
      const blobUrl = URL.createObjectURL(file);
      let source: HTMLImageElement;
      try { source = await loadPosterImage(blobUrl); } finally { URL.revokeObjectURL(blobUrl); }
      if (layerEditor !== state) return;
      const canvas = document.createElement("canvas"), scale = Math.min(1, 1024 / Math.max(source.naturalWidth, source.naturalHeight));
      canvas.width = Math.round(source.naturalWidth * scale); canvas.height = Math.round(source.naturalHeight * scale); canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/png");
      if (url.length > 1_000_000) throw new Error("Gambar terlalu besar. Gunakan gambar yang lebih kecil.");
      canvasCheckpoint();
      const width = state.document.width * .3;
      const layer: CanvasElement = { id: canvasElementId("image"), kind: "image", name: file.name.slice(0, 60), url, x: state.document.width * .1, y: state.document.height * .1, width, height: width * canvas.height / canvas.width, rotation: 0, opacity: 1, visible: true, locked: false };
      state.document.layers.push(layer); state.selected = layer.id; renderLayerEditor();
    } catch (error) { $("#canvas-editor-error").textContent = error.message; }
    finally { event.target.value = ""; }
  });
  $("#canvas-editor-download").addEventListener("click", async () => {
    if (!layerEditor?.document || layerEditor.busy) return;
    try {
      const canvas = document.createElement("canvas"); await drawEditableCanvas(layerEditor.document, canvas);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG tidak dapat dibuat.");
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "pixgin-edit-elemen.png"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { $("#canvas-editor-error").textContent = error.message; }
  });
  $("#canvas-editor-layers").addEventListener("click", event => {
    if (!layerEditor || layerEditor.busy) return;
    const button = event.target.closest("button");
    const id = button?.dataset.layerSelect || button?.dataset.layerVisible || button?.dataset.layerLock;
    const layer = layerEditor.document.layers.find(layer => layer.id === id);
    if (!layer) return;
    layerEditor.selected = layer.id;
    if (button.dataset.layerVisible) { canvasCheckpoint(); layer.visible = !layer.visible; }
    if (button.dataset.layerLock) { canvasCheckpoint(); layer.locked = !layer.locked; }
    renderLayerEditor();
  });
  for (const key of ["x", "y", "width", "height", "rotation", "opacity", "text", "fontSize", "fontFamily", "color", "align", "bold"]) {
    $("#canvas-element-" + key).addEventListener("change", event => {
      const layer = selectedCanvasElement();
      if (!layer || layer.locked || layerEditor.busy) return;
      const value = ["text", "fontFamily", "color", "align"].includes(key) ? event.target.value : key === "bold" ? event.target.checked : Number(event.target.value);
      if (typeof value === "number" && !Number.isFinite(value)) return;
      canvasCheckpoint();
      const ranges = { width: [1, layerEditor.document.width * 3], height: [1, layerEditor.document.height * 3], rotation: [-360, 360], opacity: [0, 1], fontSize: [8, 600], x: [-layerEditor.document.width, layerEditor.document.width * 2], y: [-layerEditor.document.height, layerEditor.document.height * 2] };
      layer[key] = ranges[key] ? Math.min(ranges[key][1], Math.max(ranges[key][0], value)) : typeof value === "string" ? value.slice(0, 2000) : value;
      renderLayerEditor();
    });
  }
  $("#canvas-element-delete").addEventListener("click", deleteCanvasElement);
  for (const [id, delta] of [["#canvas-element-up", 1], ["#canvas-element-down", -1]] as const) $(id).addEventListener("click", () => {
    if (!layerEditor || layerEditor.busy || selectedCanvasElement()?.locked) return;
    const list = layerEditor.document.layers, index = list.findIndex(layer => layer.id === layerEditor.selected), next = index + delta;
    if (index < 0 || next < 0 || next >= list.length) return;
    canvasCheckpoint(); [list[index], list[next]] = [list[next], list[index]]; renderLayerEditor();
  });
  let drag: { pointer: number; id: string; startX: number; startY: number; x: number; y: number; width: number; height: number; resize: boolean; changed: boolean } = null;
  const stage = $("#canvas-editor-stage");
  const point = event => { const rect = stage.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * layerEditor.document.width, y: (event.clientY - rect.top) / rect.height * layerEditor.document.height }; };
  stage.addEventListener("pointerdown", event => {
    if (!layerEditor?.document || layerEditor.busy || (event.button !== 0 && event.pointerType !== "touch")) return;
    const p = point(event), resize = event.target.id === "canvas-editor-resize", layer = resize ? selectedCanvasElement() : hitCanvasElement(layerEditor.document, p.x, p.y);
    layerEditor.selected = layer?.id || null;
    if (layer && !layer.locked) { event.preventDefault(); stage.setPointerCapture(event.pointerId); drag = { pointer: event.pointerId, id: layer.id, startX: p.x, startY: p.y, x: layer.x, y: layer.y, width: layer.width, height: layer.height, resize, changed: false }; }
    renderLayerEditor();
  });
  stage.addEventListener("pointermove", event => {
    if (!drag || drag.pointer !== event.pointerId || !layerEditor) return;
    const layer = selectedCanvasElement(), p = point(event);
    if (!layer || layer.id !== drag.id) return;
    if (!drag.changed) { if (Math.abs(p.x - drag.startX) + Math.abs(p.y - drag.startY) < 2) return; canvasCheckpoint(); drag.changed = true; }
    if (drag.resize) { const scale = Math.max(.05, Math.min(3, 1 + (p.x - drag.startX) / drag.width)); layer.width = Math.min(layerEditor.document.width * 3, Math.max(1, drag.width * scale)); layer.height = Math.min(layerEditor.document.height * 3, Math.max(1, drag.height * scale)); }
    else { layer.x = Math.max(-layerEditor.document.width, Math.min(layerEditor.document.width - 1, drag.x + p.x - drag.startX)); layer.y = Math.max(-layerEditor.document.height, Math.min(layerEditor.document.height - 1, drag.y + p.y - drag.startY)); }
    renderLayerEditor();
  });
  const release = event => { if (drag?.pointer === event.pointerId) drag = null; };
  stage.addEventListener("pointerup", release); stage.addEventListener("pointercancel", release); stage.addEventListener("lostpointercapture", release);
  $("#canvas-editor").addEventListener("keydown", event => {
    if (!layerEditor) return;
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); closeLayerEditor(); return; }
    if (event.key === "Tab") { const controls = $$("button:not(:disabled):not(.is-hidden), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)", $("#canvas-editor")).filter(control => control.getClientRects().length); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    if (event.target.closest("input, textarea, select")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); canvasUndo(event.shiftKey); }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteCanvasElement(); }
    const layer = selectedCanvasElement();
    if (layer && !layer.locked && !layerEditor.busy && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); canvasCheckpoint(); const step = event.shiftKey ? 10 : 1; layer.x += event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0; layer.y += event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0; renderLayerEditor(); }
  });
  window.addEventListener("beforeunload", event => { if (layerEditor?.document && (layerEditor.busy || canvasSnapshot() !== layerEditor.saved)) { event.preventDefault(); event.returnValue = ""; } });
}

function deleteCanvasElement() {
  if (!layerEditor || layerEditor.busy || !selectedCanvasElement() || selectedCanvasElement().locked) return;
  canvasCheckpoint(); layerEditor.document.layers = layerEditor.document.layers.filter(layer => layer.id !== layerEditor.selected); layerEditor.selected = null; renderLayerEditor();
}
