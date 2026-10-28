import type { DesignObject } from "../shared/design-document";
export function LayersPanel({
  objects,
  selected,
  onSelect,
  onToggle,
  onReorder,
  onDuplicate,
  onDelete,
  busy,
}: {
  objects: DesignObject[];
  selected: string[];
  onSelect: (id: string, multi: boolean) => void;
  onToggle: (id: string, key: "visible" | "locked") => void;
  onReorder: (id: string, direction: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <section className="design-layers">
      <h3>Layer</h3>
      <fieldset disabled={busy}>
        {[...objects].reverse().map((object) => (
          <div
            key={object.id}
            className={`design-layer ${selected.includes(object.id) ? "selected" : ""}`}
          >
            <input
              type="checkbox"
              aria-label={`Pilih ${object.name}`}
              checked={selected.includes(object.id)}
              onChange={() => onSelect(object.id, true)}
            />
            <button
              onClick={(e) =>
                onSelect(object.id, e.shiftKey || e.ctrlKey || e.metaKey)
              }
              title={object.name}
            >
              {object.type === "group" ? "▣ " : ""}
              {object.name}
            </button>
            <button
              aria-label={`${object.visible ? "Sembunyikan" : "Tampilkan"} ${object.name}`}
              onClick={() => onToggle(object.id, "visible")}
            >
              {object.visible ? "◉" : "○"}
            </button>
            <button
              aria-label={`${object.locked ? "Buka kunci" : "Kunci"} ${object.name}`}
              onClick={() => onToggle(object.id, "locked")}
            >
              {object.locked ? "🔒" : "◇"}
            </button>
            <button
              aria-label="Ke depan"
              onClick={() => onReorder(object.id, 1)}
            >
              ↑
            </button>
            <button
              aria-label="Ke belakang"
              onClick={() => onReorder(object.id, -1)}
            >
              ↓
            </button>
          </div>
        ))}
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
        Kunci latar dibuka lewat tombol 🔒. Isi poster lama tetap satu gambar;
        pemisahan otomatis tidak diaktifkan.
      </p>
    </section>
  );
}
