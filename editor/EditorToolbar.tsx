export function EditorToolbar({
  title,
  status,
  zoom,
  onZoom,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSave,
  onExport,
  onExportJpg,
  onClose,
  busy,
  onRetry,
  conflict,
  onReload,
  onCopy,
}: {
  title: string;
  status: string;
  zoom: number;
  onZoom: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onExport: () => void;
  onExportJpg: () => void;
  onClose: () => void;
  busy: boolean;
  onRetry: () => void;
  conflict: boolean;
  onReload: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <header className="design-toolbar">
        <div>
          <span>PIXGIN STUDIO</span>
          <h2>{title}</h2>
          <p role="status">{status}</p>
        </div>
        <div className="design-toolbar-actions">
          <button disabled={!canUndo || busy} onClick={onUndo}>
            Urungkan
          </button>
          <button disabled={!canRedo || busy} onClick={onRedo}>
            Ulangi
          </button>
          <label>
            Zoom
            <select
              aria-label="Zoom kanvas"
              value={zoom}
              onChange={(e) => onZoom(Number(e.target.value))}
            >
              {[0.15, 0.25, 0.4, 0.5, 0.75, 1, 1.5, 2].map((scale) => (
                <option key={scale} value={scale}>
                  {Math.round(scale * 100)}%
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} onClick={onExport}>
            Unduh PNG
          </button>
          <button disabled={busy} onClick={onExportJpg}>
            Unduh JPG
          </button>
          <button
            className="design-primary"
            disabled={busy || conflict}
            onClick={onSave}
          >
            Simpan versi
          </button>
          <button className="design-close-button" aria-label="Tutup editor desain" onClick={onClose}>
            ×
          </button>
        </div>
      </header>
      {status.startsWith("Gagal") && (
        <div className="design-notice" role="alert">
          {status}
          <button onClick={onRetry}>Coba simpan lagi</button>
        </div>
      )}
      {conflict && (
        <div className="design-notice" role="alert">
          Desain berubah di sesi lain. Perubahan lokal tetap ada.
          <button onClick={onReload}>Muat versi server</button>
          <button onClick={onCopy}>Simpan salinan</button>
        </div>
      )}
    </>
  );
}
