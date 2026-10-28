import { useEffect, useState } from "react";
import type { DesignObject } from "../shared/design-document";
export function PropertiesPanel({
  object,
  onPatch,
  onEditText,
  onRemoveBackground,
  onRestore,
  onReplace,
  onAlign,
  busy,
  hasOriginal,
  lockedByParent,
}: {
  object?: DesignObject;
  onPatch: (patch: Partial<DesignObject>) => void;
  onEditText: () => void;
  onRemoveBackground: () => void;
  onRestore: () => void;
  onReplace: (file: File) => void;
  onAlign: (axis: "x" | "y") => void;
  busy: boolean;
  hasOriginal: boolean;
  lockedByParent: boolean;
}) {
  const [draft, setDraft] = useState<Partial<DesignObject>>({});
  useEffect(() => setDraft(object || {}), [object]);
  if (!object)
    return (
      <aside className="design-properties">
        <h3>Properti</h3>
        <p>
          Pilih elemen di kanvas atau daftar layer. Shift+klik untuk memilih
          beberapa elemen.
        </p>
      </aside>
    );
  const commit = () => {
    const changed = Object.fromEntries(
      Object.entries(draft).filter(
        ([key, value]) => value !== object[key as keyof DesignObject],
      ),
    );
    if (Object.keys(changed).length) onPatch(changed);
  };
  const number = (
    key: keyof DesignObject,
    label: string,
    min: number,
    max: number,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        value={Number(draft[key] ?? 0)}
        min={min}
        max={max}
        step="any"
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: Math.min(max, Math.max(min, Number(e.target.value))),
          })
        }
        onBlur={commit}
      />
    </label>
  );
  return (
    <aside className="design-properties">
      <h3>Properti</h3>
      <h4>{object.name}</h4>
      <fieldset disabled={busy || object.locked || lockedByParent}>
        <label>
          Nama elemen
          <input
            value={draft.name || ""}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onBlur={commit}
          />
        </label>
        <div className="design-property-grid">
          {number("x", "X", -16000, 16000)}
          {number("y", "Y", -16000, 16000)}
          {object.type === "group" ? (
            <>
              {number("scaleX", "Skala X", 0.01, 100)}
              {number("scaleY", "Skala Y", 0.01, 100)}
            </>
          ) : (
            <>
              {number("width", "Lebar", 1, 16000)}
              {number("height", "Tinggi", 1, 16000)}
            </>
          )}
          {number("rotation", "Rotasi", -3600, 3600)}
          <label>
            Opasitas
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={draft.opacity ?? 1}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  opacity: Math.max(0, Math.min(1, Number(e.target.value))),
                })
              }
              onBlur={commit}
            />
          </label>
        </div>
        <div className="design-button-row">
          <button onClick={() => onAlign("x")}>Tengah horizontal</button>
          <button onClick={() => onAlign("y")}>Tengah vertikal</button>
        </div>
        {object.type === "text" && (
          <>
            <button onClick={onEditText}>Edit teks di kanvas</button>
            <label>
              Isi teks
              <textarea
                value={draft.text || ""}
                maxLength={4000}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onBlur={commit}
              />
            </label>
            {number("fontSize", "Ukuran huruf", 8, 600)}
            <label>
              Jenis huruf
              <select
                value={draft.fontFamily || "Arial"}
                onChange={(e) => onPatch({ fontFamily: e.target.value })}
              >
                {["Arial", "Georgia", "Verdana"].map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
            </label>
            <label>
              Warna
              <input
                type="color"
                value={draft.color?.slice(0, 7) || "#ffffff"}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                onBlur={commit}
              />
            </label>
            <label>
              Rata
              <select
                value={draft.align || "left"}
                onChange={(e) => onPatch({ align: e.target.value as "left" })}
              >
                <option value="left">Kiri</option>
                <option value="center">Tengah</option>
                <option value="right">Kanan</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={object.bold}
                onChange={(e) => onPatch({ bold: e.target.checked })}
              />{" "}
              Tebal
            </label>
            <label>
              <input
                type="checkbox"
                checked={object.italic}
                onChange={(e) => onPatch({ italic: e.target.checked })}
              />{" "}
              Miring
            </label>
          </>
        )}
        {object.type === "shape" && (
          <>
            <label>
              Isi
              <input
                type="color"
                value={draft.fill?.slice(0, 7) || "#ffffff"}
                onChange={(e) => setDraft({ ...draft, fill: e.target.value })}
                onBlur={commit}
              />
            </label>
            <label>
              Garis
              <input
                type="color"
                value={draft.stroke?.slice(0, 7) || "#ffffff"}
                onChange={(e) => setDraft({ ...draft, stroke: e.target.value })}
                onBlur={commit}
              />
            </label>
            {number("strokeWidth", "Tebal garis", 0, 100)}
            {object.shape === "rect" &&
              number("cornerRadius", "Sudut bulat", 0, 2000)}
          </>
        )}
        {object.type === "image" && (
          <>
            <label className="design-upload">
              Ganti gambar / logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onReplace(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button onClick={onRemoveBackground}>
              Hapus latar AI · 3 kredit
            </button>
            {hasOriginal && (
              <button onClick={onRestore}>Pulihkan gambar asli</button>
            )}
            <p>
              Hapus latar bersifat opsional. Upload asli tetap disimpan. Huruf
              dalam logo raster diubah dengan mengganti aset logo.
            </p>
          </>
        )}
      </fieldset>
      {(object.locked || lockedByParent) && (
        <p>Elemen terkunci. Buka kuncinya dari daftar layer.</p>
      )}
    </aside>
  );
}
