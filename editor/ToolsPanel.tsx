export function ToolsPanel({
  onText,
  onShape,
  onUpload,
  onDecoration,
  onGroup,
  onUngroup,
  busy,
  groupable,
}: {
  onText: () => void;
  onShape: (shape: "rect" | "ellipse" | "star") => void;
  onUpload: (file: File) => void;
  onDecoration: (kind: "badge" | "sticker") => void;
  onGroup: () => void;
  onUngroup: () => void;
  busy: boolean;
  groupable: boolean;
}) {
  return (
    <section className="design-tools" aria-label="Tambah elemen">
      <h3>Tambah elemen</h3>
      <button disabled={busy} onClick={onText}>
        ＋ Teks
      </button>
      <label className="design-upload">
        ＋ Gambar / logo
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </label>
      <div className="design-button-row">
        <button disabled={busy} onClick={() => onDecoration("badge")}>
          Badge promo
        </button>
        <button disabled={busy} onClick={() => onDecoration("sticker")}>
          Stiker
        </button>
      </div>
      <div className="design-button-row">
        <button disabled={busy} onClick={() => onShape("rect")}>
          Kotak
        </button>
        <button disabled={busy} onClick={() => onShape("ellipse")}>
          Lingkaran
        </button>
        <button disabled={busy} onClick={() => onShape("star")}>
          Bintang
        </button>
      </div>
      <div className="design-button-row">
        <button disabled={busy || !groupable} onClick={onGroup}>
          Grup
        </button>
        <button disabled={busy} onClick={onUngroup}>
          Lepas grup
        </button>
      </div>
    </section>
  );
}
