import { memo, useMemo, useRef, useState } from "react";
import type { DesignObject } from "../shared/design-document";
import { layerEntries, type LayerEntry } from "../shared/design-layers";

const LayerRow = memo(function LayerRow({
  entry,
  selected,
  onSelect,
  onToggle,
  onReorder,
  onRename,
}: {
  entry: LayerEntry;
  selected: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onToggle: (id: string, key: "visible" | "locked") => void;
  onReorder: (id: string, direction: number) => void;
  onRename: (id: string, name: string) => void;
}) {
  const { object } = entry;
  const [renaming, setRenaming] = useState(false);
  const cancelled = useRef(false);
  return (
    <div
      role="listitem"
      data-layer-id={object.id}
      data-selected={selected}
      className={`design-layer ${selected ? "selected" : ""} ${!entry.effectiveVisible ? "is-muted" : ""}`}
      style={{ marginLeft: entry.depth * 12 }}
    >
      <input
        type="checkbox"
        aria-label={`Pilih ${object.name}`}
        checked={selected}
        onChange={() => onSelect(object.id, true)}
      />
      {renaming ? (
        <input
          className="design-layer-name"
          autoFocus
          aria-label="Nama layer"
          defaultValue={object.name}
          maxLength={80}
          onBlur={(event) => {
            if (!cancelled.current) onRename(object.id, event.target.value);
            setRenaming(false);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              cancelled.current = true;
              setRenaming(false);
            }
          }}
        />
      ) : (
        <button
          className="design-layer-select"
          title={object.name}
          onClick={(event) =>
            onSelect(
              object.id,
              event.shiftKey || event.ctrlKey || event.metaKey,
            )
          }
          onDoubleClick={() => {
            if (!entry.effectiveLocked) {
              cancelled.current = false;
              setRenaming(true);
            }
          }}
        >
          {object.type === "group" ? "▣ " : ""}
          {object.name}
        </button>
      )}
      <button
        disabled={entry.parentLocked}
        aria-label={`${object.visible ? "Sembunyikan" : "Tampilkan"} ${object.name}`}
        onClick={() => onToggle(object.id, "visible")}
      >
        {object.visible ? "◉" : "○"}
      </button>
      <button
        disabled={entry.parentLocked}
        aria-label={`${object.locked ? "Buka kunci" : "Kunci"} ${object.name}`}
        onClick={() => onToggle(object.id, "locked")}
      >
        {entry.effectiveLocked ? "🔒" : "◇"}
      </button>
      <button
        disabled={entry.effectiveLocked}
        aria-label={`Ubah nama ${object.name}`}
        onClick={() => {
          cancelled.current = false;
          setRenaming(true);
        }}
      >
        ✎
      </button>
      <button
        disabled={entry.effectiveLocked}
        aria-label={`Ke depan ${object.name}`}
        onClick={() => onReorder(object.id, 1)}
      >
        ↑
      </button>
      <button
        disabled={entry.effectiveLocked}
        aria-label={`Ke belakang ${object.name}`}
        onClick={() => onReorder(object.id, -1)}
      >
        ↓
      </button>
    </div>
  );
});

export function LayersPanel({
  objects,
  selected,
  onSelect,
  onToggle,
  onReorder,
  onRename,
  onDuplicate,
  onDelete,
  busy,
}: {
  objects: DesignObject[];
  selected: string[];
  busy: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onToggle: (id: string, key: "visible" | "locked") => void;
  onReorder: (id: string, direction: number) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const rows = useMemo(() => {
    const entries = layerEntries(objects),
      byId = new Map(entries.map((entry) => [entry.object.id, entry]));
    const visit = (siblings: DesignObject[]): LayerEntry[] =>
      [...siblings]
        .reverse()
        .flatMap((object) => [
          byId.get(object.id)!,
          ...visit(object.children || []),
        ]);
    return visit(objects);
  }, [objects]);
  const selection = useMemo(() => new Set(selected), [selected]);
  return (
    <section className="design-layers">
      <h3>
        Layer{" "}
        <span className="design-layer-count" aria-live="polite">
          {rows.length}
        </span>
      </h3>
      <fieldset disabled={busy}>
        <div role="list" aria-label="Daftar layer">
          {rows.map((entry) => (
            <LayerRow
              key={entry.object.id}
              entry={entry}
              selected={selection.has(entry.object.id)}
              onSelect={onSelect}
              onToggle={onToggle}
              onReorder={onReorder}
              onRename={onRename}
            />
          ))}
        </div>
        <div className="design-button-row">
          <button disabled={!selected.length} onClick={onDuplicate}>
            Duplikat
          </button>
          <button disabled={!selected.length} onClick={onDelete}>
            Hapus
          </button>
        </div>
      </fieldset>
      <p>
        Layer teratas tampil di depan. Gunakan ↑ / ↓ untuk mengubah urutan. Isi
        gambar utuh tetap satu layer; tambahkan elemen baru di atasnya.
      </p>
    </section>
  );
}
