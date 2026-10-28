export type DesignAsset = {
  id: string;
  url: string;
  width: number;
  height: number;
  originalAssetId?: string;
};
export type DesignObject = {
  id: string;
  type: "image" | "text" | "shape" | "group";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  skewX?: number;
  skewY?: number;
  assetId?: string;
  fit?: "contain" | "cover";
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  shape?: "rect" | "ellipse" | "star";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  children?: DesignObject[];
};
export type DesignDocument = {
  schemaVersion: 1;
  width: number;
  height: number;
  background: string;
  objects: DesignObject[];
  assets: Record<string, DesignAsset>;
};
export type DesignRecord = {
  id: string;
  title: string;
  revision: number;
  document: DesignDocument;
  previewUrl?: string;
  updatedAt: string;
};
export type DesignVersion = {
  id: string;
  number: number;
  revision: number;
  document: DesignDocument;
  previewUrl?: string;
  original: boolean;
  createdAt: string;
};
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isColor = (value: unknown) =>
  typeof value === "string" &&
  /^(#[0-9a-f]{6}(?:[0-9a-f]{2})?|transparent)$/i.test(value);
export const baseObject = (
  id: string,
  type: DesignObject["type"],
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DesignObject => ({
  id,
  type,
  name,
  x,
  y,
  width,
  height,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  visible: true,
  locked: false,
});
export function walkObjects(
  objects: DesignObject[],
  fn: (object: DesignObject) => void,
) {
  for (const object of objects) {
    fn(object);
    if (object.children) walkObjects(object.children, fn);
  }
}
export function assetIds(document: DesignDocument) {
  const ids = new Set<string>();
  walkObjects(document.objects, (object) => {
    if (object.type === "image" && object.assetId) ids.add(object.assetId);
  });
  return [...ids];
}
export function mapObjects(
  objects: DesignObject[],
  fn: (object: DesignObject) => DesignObject,
): DesignObject[] {
  let changed = false;
  const next = objects.map((object) => {
    const children = object.children && mapObjects(object.children, fn);
    const result = fn(
      children && children !== object.children
        ? { ...object, children }
        : object,
    );
    if (result !== object) changed = true;
    return result;
  });
  return changed ? next : objects;
}
export function findObject(document: DesignDocument, id: string) {
  let found: DesignObject | undefined;
  walkObjects(document.objects, (object) => {
    if (object.id === id) found = object;
  });
  return found;
}
export function normalizeDesign(input: any): DesignDocument {
  const bad = () => {
    throw Object.assign(new Error("Dokumen desain tidak valid."), {
      statusCode: 400,
    });
  };
  const finite = (v: any, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (
    !input ||
    input.schemaVersion !== 1 ||
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    !finite(input.width, 64, 4096) ||
    !finite(input.height, 64, 4096) ||
    input.width * input.height > 8_000_000 ||
    !isColor(input.background)
  )
    bad();
  const ids = new Set<string>();
  const parse = (values: any, depth: number): DesignObject[] => {
    if (!Array.isArray(values) || depth > 5) return bad();
    return values.map((value) => {
      if (
        !value ||
        typeof value.id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(value.id) ||
        ids.has(value.id) ||
        !["image", "text", "shape", "group"].includes(value.type)
      )
        bad();
      ids.add(value.id);
      for (const key of ["x", "y"])
        if (!finite(value[key], -16384, 16384)) bad();
      for (const key of ["width", "height"])
        if (!finite(value[key], 1, 16384)) bad();
      if (
        !finite(value.rotation ?? 0, -3600, 3600) ||
        !finite(value.scaleX ?? 1, 0.01, 100) ||
        !finite(value.scaleY ?? 1, 0.01, 100) ||
        !finite(value.opacity ?? 1, 0, 1)
      )
        bad();
      const object = {
        ...baseObject(
          value.id,
          value.type,
          String(value.name || "Elemen").slice(0, 80),
          value.x,
          value.y,
          value.width,
          value.height,
        ),
        rotation: value.rotation ?? 0,
        scaleX: value.scaleX ?? 1,
        scaleY: value.scaleY ?? 1,
        opacity: value.opacity ?? 1,
        visible: value.visible !== false,
        locked: value.locked === true,
      };
      if (
        !finite(value.skewX ?? 0, -100, 100) ||
        !finite(value.skewY ?? 0, -100, 100)
      )
        bad();
      Object.assign(object, {
        skewX: value.skewX ?? 0,
        skewY: value.skewY ?? 0,
      });
      if (value.type === "image") {
        if (!UUID.test(value.assetId || "")) bad();
        return {
          ...object,
          assetId: value.assetId,
          fit:
            value.fit === "cover" ? ("cover" as const) : ("contain" as const),
        };
      }
      if (value.type === "text") {
        if (
          typeof value.text !== "string" ||
          value.text.length > 4000 ||
          !finite(value.fontSize, 8, 600) ||
          !isColor(value.color)
        )
          bad();
        return {
          ...object,
          text: value.text,
          fontSize: value.fontSize,
          fontFamily: ["Arial", "Georgia", "Verdana"].includes(value.fontFamily)
            ? value.fontFamily
            : "Arial",
          bold: value.bold === true,
          italic: value.italic === true,
          color: value.color,
          align: ["left", "center", "right"].includes(value.align)
            ? value.align
            : "left",
        };
      }
      if (value.type === "shape") {
        if (
          !["rect", "ellipse", "star"].includes(value.shape) ||
          !isColor(value.fill) ||
          !isColor(value.stroke || "transparent") ||
          !finite(value.strokeWidth ?? 0, 0, 100) ||
          !finite(value.cornerRadius ?? 0, 0, 2000)
        )
          bad();
        return {
          ...object,
          shape: value.shape,
          fill: value.fill,
          stroke: value.stroke || "transparent",
          strokeWidth: value.strokeWidth ?? 0,
          cornerRadius: value.cornerRadius ?? 0,
        };
      }
      return { ...object, children: parse(value.children, depth + 1) };
    });
  };
  // Asset descriptors are rehydrated from authenticated storage, never trusted from a client.
  const document: DesignDocument = {
    schemaVersion: 1,
    width: input.width,
    height: input.height,
    background: input.background,
    objects: parse(input.objects, 0),
    assets: {},
  };
  if (new TextEncoder().encode(JSON.stringify(document)).length > 500_000)
    bad();
  return document;
}

export type EditorHistory = {
  document: DesignDocument;
  past: DesignDocument[];
  future: DesignDocument[];
};
export type EditorAction =
  | { type: "commit" | "reset"; document: DesignDocument }
  | { type: "undo" | "redo" };
export function designReducer(
  state: EditorHistory,
  action: EditorAction,
): EditorHistory {
  if (action.type === "reset")
    return { document: action.document, past: [], future: [] };
  if (action.type === "commit")
    return JSON.stringify(state.document) === JSON.stringify(action.document)
      ? state
      : {
          document: action.document,
          past: [...state.past.slice(-39), state.document],
          future: [],
        };
  if (action.type === "undo" && state.past.length)
    return {
      document: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [state.document, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      document: state.future[0],
      past: [...state.past, state.document],
      future: state.future.slice(1),
    };
  return state;
}
