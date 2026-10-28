import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import {
  baseObject,
  designReducer,
  findObject,
  mapObjects,
  type DesignDocument,
  type DesignObject,
  type DesignRecord,
  type DesignVersion,
  type DesignAsset,
} from "../shared/design-document";
import {
  api,
  ApiError,
  loadDesign,
  saveVersion,
  uploadAsset,
  type EditorOptions,
} from "./api";
import { EditorCanvas } from "./EditorCanvas";
import { EditorToolbar } from "./EditorToolbar";
import { ToolsPanel } from "./ToolsPanel";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { useDraft } from "./useDraft";
import { renderPreview } from "./preview";
import {
  layerEntries,
  selectedLayerRoots,
  patchLayers,
  toggleLayer,
  reorderLayer,
  duplicateLayers,
  deleteLayers,
  groupLayers,
  ungroupLayers,
  createDecoration,
} from "../shared/design-layers";
const uid = () => crypto.randomUUID();
export function App({
  initial,
  options,
  onClose,
  registerClose,
}: {
  initial: DesignRecord;
  options: EditorOptions;
  onClose: () => void;
  registerClose: (fn: (force?: boolean) => boolean) => void;
}) {
  const [history, dispatch] = useReducer(designReducer, {
    document: initial.document,
    past: [],
    future: [],
  });
  const doc = history.document;
  const [selected, setSelected] = useState<string[]>([]),
    [zoom, setZoom] = useState(window.innerWidth < 600 ? 0.25 : 0.5),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    value: string;
    style: React.CSSProperties;
  } | null>(null);
  const stage = useRef<Konva.Stage | null>(null),
    abort = useRef<AbortController | null>(null),
    root = useRef<HTMLDivElement>(null);
  const [versions, setVersions] = useState<DesignVersion[]>([]);
  const draft = useDraft(initial, doc, options.csrfToken);
  const current = useRef(doc);
  current.current = doc;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const commit = useCallback((document: DesignDocument) => {
    current.current = document;
    draft.current.current = document;
    dispatch({ type: "commit", document });
  }, []);
  const layerMap = useMemo(
    () =>
      new Map(
        layerEntries(doc.objects).map((entry) => [entry.object.id, entry]),
      ),
    [doc.objects],
  );
  const patch = useCallback(
    (patches: { id: string; patch: Partial<DesignObject> }[]) =>
      commit({
        ...current.current,
        objects: patchLayers(current.current.objects, patches),
      }),
    [commit],
  );
  const finishEditing = useCallback(() => {
    const edit = editingRef.current;
    if (!edit) return;
    patch([{ id: edit.id, patch: { text: edit.value } }]);
    setEditing(null);
  }, [patch]);
  const close = (force = false) => {
    if (!force && busyRef.current) return false;
    if (
      !force &&
      (draft.dirty() || editingRef.current) &&
      !window.confirm(
        "Tutup editor? Perubahan yang belum tersimpan mungkin hilang.",
      )
    )
      return false;
    abort.current?.abort();
    onClose();
    return true;
  };
  useEffect(() => {
    registerClose(close);
  });
  useEffect(() => {
    root.current?.focus();
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    void api<{ versions: DesignVersion[] }>(
      `/api/designs/${draft.record.current.id}/versions`,
      options.csrfToken,
    )
      .then((result) => setVersions(result.versions))
      .catch(() => {});
  }, [draft.record.current.id, options.csrfToken]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.dirty() || editingRef.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  const onReady = useCallback((value: Konva.Stage) => {
    stage.current = value;
  }, []);
  const select = useCallback(
    (id: string | null, multi: boolean) => {
      finishEditing();
      setSelected((old) =>
        id
          ? multi
            ? old.includes(id)
              ? old.filter((value) => value !== id)
              : [...old, id]
            : [id]
          : [],
      );
    },
    [finishEditing],
  );
  const add = (object: DesignObject, assets = doc.assets) => {
    commit({ ...doc, assets, objects: [...doc.objects, object] });
    setSelected([object.id]);
  };
  const duplicate = () => {
    const result = duplicateLayers(doc.objects, selected, uid);
    commit({ ...doc, objects: result.objects });
    setSelected(result.selected);
  };
  const remove = () => {
    commit({
      ...doc,
      objects: deleteLayers(doc.objects, selected),
    });
    setSelected([]);
  };
  const toggle = useCallback(
    (id: string, key: "visible" | "locked") =>
      commit({
        ...current.current,
        objects: toggleLayer(current.current.objects, id, key),
      }),
    [commit],
  );
  const reorder = useCallback(
    (id: string, direction: number) => {
      commit({
        ...current.current,
        objects: reorderLayer(current.current.objects, id, direction),
      });
    },
    [commit],
  );
  const rename = useCallback(
    (id: string, name: string) =>
      patch([{ id, patch: { name: name.trim().slice(0, 80) || "Elemen" } }]),
    [patch],
  );
  const group = () => {
    const entries = selectedLayerRoots(doc.objects, selected).filter(
      (entry) => !entry.effectiveLocked,
    );
    if (entries.length < 2) return;
    if (entries.some((entry) => entry.parentId !== entries[0].parentId)) {
      setError("Pilih layer di dalam grup yang sama untuk menggabungkannya.");
      return;
    }
    const items = entries.map((entry) => entry.object);
    const parent = entries[0].parentId
      ? stage.current?.findOne(`#${entries[0].parentId}`)
      : stage.current;
    const rectangles = items
      .map((object) =>
        stage.current
          ?.findOne(`#${object.id}`)
          ?.getClientRect({ relativeTo: parent as Konva.Group | Konva.Stage }),
      )
      .filter((rect): rect is Konva.IRect => !!rect);
    if (!rectangles.length) return;
    const x = Math.min(...rectangles.map((rect) => rect.x)),
      y = Math.min(...rectangles.map((rect) => rect.y)),
      width = Math.max(...rectangles.map((rect) => rect.x + rect.width)) - x,
      height = Math.max(...rectangles.map((rect) => rect.y + rect.height)) - y;
    const id = uid();
    const objects = groupLayers(
      doc.objects,
      selected,
      { x, y, width, height },
      id,
    );
    if (objects === doc.objects) {
      setError(
        "Grup terlalu dalam. Lepaskan grup bagian dalam sebelum menggabungkannya lagi.",
      );
      return;
    }
    commit({ ...doc, objects });
    setSelected([id]);
  };
  const ungroup = () => {
    const result = ungroupLayers(doc.objects, selected, (object, child) => {
      const transform = new Konva.Transform()
        .translate(object.x, object.y)
        .rotate((object.rotation * Math.PI) / 180)
        .skew(object.skewX || 0, object.skewY || 0)
        .scale(object.scaleX, object.scaleY)
        .translate(child.x, child.y)
        .rotate((child.rotation * Math.PI) / 180)
        .skew(child.skewX || 0, child.skewY || 0)
        .scale(child.scaleX, child.scaleY);
      return { ...child, ...transform.decompose() };
    });
    commit({ ...doc, objects: result.objects });
    setSelected(result.selected);
  };
  const editText = (id: string, node?: Konva.Text) => {
    const object = findObject(doc, id);
    const target =
      node || (stage.current?.findOne(`#${id}`) as Konva.Text | undefined);
    if (
      !object ||
      object.type !== "text" ||
      layerMap.get(id)?.effectiveLocked ||
      !target
    )
      return;
    const rect = target.getStage()!.container().getBoundingClientRect(),
      matrix = target.getAbsoluteTransform().getMatrix();
    setEditing({
      id,
      value: object.text || "",
      style: {
        position: "fixed",
        left: rect.left,
        top: rect.top,
        width: object.width,
        height: Math.max(object.height, object.fontSize! * 1.4),
        transformOrigin: "0 0",
        transform: `matrix(${matrix.join(",")})`,
        fontFamily: object.fontFamily,
        fontSize: object.fontSize,
        lineHeight: 1.2,
        fontWeight: object.bold ? 700 : 400,
        fontStyle: object.italic ? "italic" : "normal",
        color: object.color,
        textAlign: object.align,
        background: "rgba(25,15,45,.88)",
        zIndex: 220,
        padding: 0,
        margin: 0,
        border: "1px solid #d3aaff",
        resize: "none",
      },
    });
  };
  // Reposition the HTML text input when the stage scrolls, resizes, or zoom changes.
  useEffect(() => {
    if (!editing) return;
    const update = () => {
      const object = findObject(current.current, editing.id);
      const node = stage.current?.findOne(`#${editing.id}`) as
        | Konva.Text
        | undefined;
      if (!object || !node) return;
      const rect = node.getStage()!.container().getBoundingClientRect();
      const matrix = node.getAbsoluteTransform().getMatrix();
      setEditing((old) =>
        old
          ? {
              ...old,
              style: {
                ...old.style,
                left: rect.left,
                top: rect.top,
                transform: `matrix(${matrix.join(",")})`,
              },
            }
          : old,
      );
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editing?.id, zoom]);
  const withBusy = async (work: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        draft.markConflict();
      else setError((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = () =>
    void withBusy(async () => {
      finishEditing();
      const record = await draft.flush();
      const result = await saveVersion(
        record.id,
        record.revision,
        options.csrfToken,
        current.current,
      );
      options.onSaved?.({ designId: record.id, version: result.version });
      setVersions(
        (
          await api<{ versions: DesignVersion[] }>(
            `/api/designs/${record.id}/versions`,
            options.csrfToken,
          )
        ).versions,
      );
    });
  const exportImage = (format: "png" | "jpeg") =>
    void withBusy(async () => {
      finishEditing();
      const data = await renderPreview(current.current, false, format);
      const raw = atob(data.split(",")[1]),
        bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0)),
        blob = new Blob([bytes], { type: `image/${format}` }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `${draft.record.current.title.replace(/[^a-zA-Z0-9-]/g, "-") || "pixgin"}.${format === "jpeg" ? "jpg" : "png"}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  const fork = () =>
    void withBusy(async () => {
      const result = await api<{ design: DesignRecord }>(
        "/api/designs",
        options.csrfToken,
        "POST",
        {
          title: `${draft.record.current.title} — salinan`,
          document: current.current,
        },
      );
      draft.reset(result.design);
      dispatch({ type: "reset", document: result.design.document });
      const version = await saveVersion(
        result.design.id,
        1,
        options.csrfToken,
        result.design.document,
        true,
      );
      options.onSaved?.({
        designId: result.design.id,
        version: version.version,
      });
    });
  const reload = () =>
    void withBusy(async () => {
      if (!window.confirm("Muat draf server dan buang perubahan lokal?"))
        return;
      const result = await loadDesign(
        draft.record.current.id,
        options.csrfToken,
      );
      draft.reset(result.design);
      dispatch({ type: "reset", document: result.design.document });
      setSelected([]);
    });
  const object =
    selected.length === 1 ? findObject(doc, selected[0]) : undefined;
  const alignObject = (axis: "x" | "y") => {
    if (!object) return;
    const parentId = layerMap.get(object.id)?.parentId;
    const parent = parentId ? layerMap.get(parentId)?.object : undefined;
    const container = parentId
      ? stage.current?.findOne(`#${parentId}`)
      : stage.current;
    const bounds = stage.current
      ?.findOne(`#${object.id}`)
      ?.getClientRect({ relativeTo: container as Konva.Group | Konva.Stage });
    if (!bounds) return;
    patch([
      {
        id: object.id,
        patch:
          axis === "x"
            ? {
                x:
                  object.x +
                  ((parent?.width || doc.width) - bounds.width) / 2 -
                  bounds.x,
              }
            : {
                y:
                  object.y +
                  ((parent?.height || doc.height) - bounds.height) / 2 -
                  bounds.y,
              },
      },
    ]);
  };
  const upload = (file: File) =>
    void withBusy(async () => {
      const asset = await uploadAsset(file, options.csrfToken);
      const width = doc.width * 0.35;
      add(
        {
          ...baseObject(
            uid(),
            "image",
            file.name.slice(0, 80),
            doc.width * 0.1,
            doc.height * 0.15,
            width,
            (width * asset.height) / asset.width,
          ),
          assetId: asset.id,
          fit: "contain",
        },
        { ...doc.assets, [asset.id]: asset },
      );
    });
  const removeBackground = () => {
    if (object?.type !== "image") return;
    if (
      !window.confirm(
        "Hapus latar dengan AI memakai 3 kredit jika berhasil? Upload asli tetap disimpan.",
      )
    )
      return;
    void withBusy(async () => {
      abort.current = new AbortController();
      const result = await api<{ asset: DesignAsset; usage: unknown }>(
        `/api/design-assets/${object.assetId}/remove-background`,
        options.csrfToken,
        "POST",
        {},
        abort.current.signal,
      );
      options.onUsage?.(result.usage);
      commit({
        ...doc,
        assets: { ...doc.assets, [result.asset.id]: result.asset },
        objects: mapObjects(doc.objects, (item) =>
          item.id === object.id ? { ...item, assetId: result.asset.id } : item,
        ),
      });
      abort.current = null;
    });
  };
  const restore = () => {
    const id = object?.assetId && doc.assets[object.assetId]?.originalAssetId;
    if (!id || !object) return;
    void withBusy(async () => {
      const { asset } = await api<{ asset: DesignAsset }>(
        `/api/design-assets/${id}/info`,
        options.csrfToken,
      );
      commit({
        ...doc,
        assets: { ...doc.assets, [id]: asset },
        objects: mapObjects(doc.objects, (item) =>
          item.id === object.id ? { ...item, assetId: id } : item,
        ),
      });
    });
  };
  return (
    <div
      className="pixgin-design-editor"
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Editor desain Pixgin"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          if (editing) {
            setEditing(null);
            return;
          }
          close();
          return;
        }
        if (event.key === "Tab") {
          const controls = [
            ...root.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            ),
          ].filter((node) => node.getClientRects().length);
          const first = controls[0],
            last = controls[controls.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === root.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (
          (event.target as HTMLElement).closest("input,textarea,select") ||
          busy
        )
          return;
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z"
        ) {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? "redo" : "undo" });
          setSelected([]);
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          remove();
        }
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          patch(
            selectedLayerRoots(doc.objects, selected).map(
              ({ object: { id } }) => ({
                id,
                patch: {
                  x:
                    (findObject(doc, id)?.x || 0) +
                    (event.key === "ArrowLeft"
                      ? -step
                      : event.key === "ArrowRight"
                        ? step
                        : 0),
                  y:
                    (findObject(doc, id)?.y || 0) +
                    (event.key === "ArrowUp"
                      ? -step
                      : event.key === "ArrowDown"
                        ? step
                        : 0),
                },
              }),
            ),
          );
        }
      }}
    >
      <EditorToolbar
        title={draft.record.current.title}
        status={busy ? "Memproses…" : draft.status}
        zoom={zoom}
        onZoom={setZoom}
        onUndo={() => {
          dispatch({ type: "undo" });
          setSelected([]);
        }}
        onRedo={() => {
          dispatch({ type: "redo" });
          setSelected([]);
        }}
        canUndo={!!history.past.length}
        canRedo={!!history.future.length}
        onSave={save}
        onExport={() => exportImage("png")}
        onExportJpg={() => exportImage("jpeg")}
        onClose={() => close()}
        busy={busy}
        onRetry={draft.retry}
        conflict={draft.conflict}
        onReload={reload}
        onCopy={fork}
      />
      {error && (
        <p className="design-notice" role="alert">
          {error}
        </p>
      )}
      <main className="design-editor-body">
        <aside className="design-left">
          <ToolsPanel
            busy={busy}
            groupable={selected.length > 1}
            onText={() =>
              add({
                ...baseObject(
                  uid(),
                  "text",
                  "Teks",
                  doc.width * 0.1,
                  doc.height * 0.1,
                  doc.width * 0.7,
                  doc.height * 0.15,
                ),
                text: "Tulis teksmu",
                fontSize: Math.max(16, doc.width * 0.05),
                fontFamily: "Arial",
                color: "#ffffff",
                bold: true,
                align: "left",
              })
            }
            onShape={(shape) =>
              add({
                ...baseObject(
                  uid(),
                  "shape",
                  "Dekorasi",
                  doc.width * 0.2,
                  doc.height * 0.2,
                  doc.width * 0.25,
                  doc.height * 0.2,
                ),
                shape,
                fill: "#bb9bff",
                stroke: "transparent",
                strokeWidth: 0,
                cornerRadius: 0,
              })
            }
            onUpload={upload}
            onDecoration={(kind) =>
              add(createDecoration(kind, doc.width, doc.height, uid))
            }
            onGroup={group}
            onUngroup={ungroup}
          />
          <LayersPanel
            busy={busy}
            objects={doc.objects}
            selected={selected}
            onSelect={select}
            onToggle={toggle}
            onReorder={reorder}
            onRename={rename}
            onDuplicate={duplicate}
            onDelete={remove}
          />
          <h3>Versi tersimpan</h3>
          {versions.map((version) => (
            <button
              className="design-version"
              key={version.id}
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Muat versi ini ke draf? Original dan versi tersimpan tidak berubah.",
                  )
                ) {
                  commit(version.document);
                  setSelected([]);
                }
              }}
            >
              {version.original ? "Original" : `Versi ${version.number}`} ·
              revisi {version.revision}
            </button>
          ))}
        </aside>
        <div className="design-workspace">
          <EditorCanvas
            document={doc}
            selected={selected}
            zoom={zoom}
            editing={editing?.id}
            readOnly={busy}
            onSelect={select}
            onPatch={patch}
            onEditText={editText}
            onReady={onReady}
            onError={setError}
          />
        </div>
        <PropertiesPanel
          object={object}
          lockedByParent={!!(object && layerMap.get(object.id)?.parentLocked)}
          onPatch={(value) =>
            object && patch([{ id: object.id, patch: value }])
          }
          onEditText={() => object && editText(object.id)}
          onRemoveBackground={removeBackground}
          onReplace={(file) => {
            if (!object) return;
            void withBusy(async () => {
              const asset = await uploadAsset(file, options.csrfToken);
              commit({
                ...doc,
                assets: { ...doc.assets, [asset.id]: asset },
                objects: mapObjects(doc.objects, (item) =>
                  item.id === object.id ? { ...item, assetId: asset.id } : item,
                ),
              });
            });
          }}
          onRestore={restore}
          onAlign={alignObject}
          busy={busy}
          hasOriginal={
            !!(object?.assetId && doc.assets[object.assetId]?.originalAssetId)
          }
        />
      </main>
      {editing && (
        <textarea
          autoFocus
          aria-label="Edit teks langsung"
          className="design-inline-text"
          style={editing.style}
          value={editing.value}
          maxLength={4000}
          onChange={(event) =>
            setEditing({ ...editing, value: event.target.value })
          }
          onBlur={finishEditing}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              setEditing(null);
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              finishEditing();
            }
          }}
        />
      )}
    </div>
  );
}
