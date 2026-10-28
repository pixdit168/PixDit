import { createRoot } from "react-dom/client";
import type { DesignDocument } from "../shared/design-document";
import { EditorCanvas } from "./EditorCanvas";
export function renderPreview(
  document: DesignDocument,
  preview = false,
  format: "png" | "jpeg" = "png",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const host = window.document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-20000px;top:0;pointer-events:none;";
    window.document.body.appendChild(host);
    const root = createRoot(host);
    let done = false;
    const clean = () => {
      setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        clean();
        reject(new Error("Aset/font belum selesai dimuat. Coba lagi."));
      }
    }, 30000);
    root.render(
      <EditorCanvas
        document={document}
        readOnly
        onError={(message) => {
          if (!done) {
            done = true;
            clearTimeout(timeout);
            clean();
            reject(new Error(message));
          }
        }}
        onReady={(stage) => {
          if (done) return;
          requestAnimationFrame(() => {
            if (done) return;
            try {
              const canvas = stage.toCanvas({ pixelRatio: 1 });
              if (!preview && format === "jpeg") {
                const context = canvas.getContext("2d")!;
                context.globalCompositeOperation = "destination-over";
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);
              }
              let data = canvas.toDataURL(
                preview ? "image/webp" : `image/${format}`,
                0.9,
              );
              if (preview && data.length > 3_100_000)
                data = canvas.toDataURL("image/webp", 0.65);
              if (preview && data.length > 3_100_000)
                throw new Error(
                  "Preview terlalu besar. Kurangi ukuran artboard.",
                );
              done = true;
              clearTimeout(timeout);
              clean();
              resolve(data);
            } catch (error) {
              done = true;
              clearTimeout(timeout);
              clean();
              reject(error);
            }
          });
        }}
      />,
    );
  });
}
