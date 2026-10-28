import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { loadDesign, type EditorOptions } from "./api";
import { renderPreview } from "./preview";
import "./style.css";
let root: Root | null = null,
  host: HTMLElement | null = null,
  closeRequest: ((force?: boolean) => boolean) | null = null,
  opening = 0;
async function open(options: EditorOptions) {
  if (closeRequest && !closeRequest()) return;
  const sequence = ++opening;
  const result = await loadDesign(options.designId, options.csrfToken);
  if (sequence !== opening) return;
  const trigger = document.activeElement as HTMLElement | null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const cleanup = () => {
    const oldRoot = root,
      oldHost = host;
    root = null;
    host = null;
    closeRequest = null;
    setTimeout(() => {
      oldRoot?.unmount();
      oldHost?.remove();
      if (trigger?.isConnected) trigger.focus();
    }, 0);
  };
  root.render(
    <App
      initial={result.design}
      options={options}
      onClose={cleanup}
      registerClose={(fn) => {
        closeRequest = fn;
      }}
    />,
  );
}
declare global {
  interface Window {
    PixginDesignEditor: {
      open: typeof open;
      close: (force?: boolean) => boolean;
      renderPreview: typeof renderPreview;
    };
  }
}
window.PixginDesignEditor = {
  open,
  close: (force = false) => {
    opening++;
    return closeRequest ? closeRequest(force) : true;
  },
  renderPreview,
};
