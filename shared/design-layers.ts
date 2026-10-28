import {
  baseObject,
  mapObjects,
  type DesignObject,
} from "./design-document.js";

export type LayerEntry = {
  object: DesignObject;
  parentId: string | null;
  ancestors: string[];
  depth: number;
  parentLocked: boolean;
  effectiveLocked: boolean;
  effectiveVisible: boolean;
};

// Arrays are the stacking order: the final sibling is painted on top.
export function layerEntries(objects: DesignObject[]): LayerEntry[] {
  const entries: LayerEntry[] = [];
  const visit = (
    siblings: DesignObject[],
    ancestors: string[],
    locked: boolean,
    visible: boolean,
  ) => {
    for (const object of siblings) {
      const entry = {
        object,
        parentId: ancestors.at(-1) || null,
        ancestors,
        depth: ancestors.length,
        parentLocked: locked,
        effectiveLocked: locked || object.locked,
        effectiveVisible: visible && object.visible,
      };
      entries.push(entry);
      if (object.children)
        visit(
          object.children,
          [...ancestors, object.id],
          entry.effectiveLocked,
          entry.effectiveVisible,
        );
    }
  };
  visit(objects, [], false, true);
  return entries;
}

export function selectedLayerRoots(
  objects: DesignObject[],
  ids: readonly string[],
) {
  const selected = new Set(ids);
  return layerEntries(objects).filter(
    (entry) =>
      selected.has(entry.object.id) &&
      !entry.ancestors.some((id) => selected.has(id)),
  );
}

function editSiblings(
  objects: DesignObject[],
  parentId: string | null,
  edit: (siblings: DesignObject[]) => DesignObject[],
): DesignObject[] {
  if (parentId === null) return edit(objects);
  return mapObjects(objects, (object) =>
    object.id === parentId
      ? { ...object, children: edit(object.children || []) }
      : object,
  );
}

export function patchLayers(
  objects: DesignObject[],
  patches: { id: string; patch: Partial<DesignObject> }[],
) {
  const editable = new Set(
    layerEntries(objects)
      .filter((entry) => !entry.effectiveLocked)
      .map((entry) => entry.object.id),
  );
  const byId = new Map(patches.map((value) => [value.id, value.patch]));
  return mapObjects(objects, (object) =>
    editable.has(object.id) && byId.has(object.id)
      ? { ...object, ...byId.get(object.id) }
      : object,
  );
}

export function toggleLayer(
  objects: DesignObject[],
  id: string,
  key: "visible" | "locked",
) {
  const entry = layerEntries(objects).find((value) => value.object.id === id);
  if (!entry || entry.parentLocked) return objects;
  return mapObjects(objects, (object) =>
    object.id === id ? { ...object, [key]: !object[key] } : object,
  );
}

export function reorderLayer(
  objects: DesignObject[],
  id: string,
  direction: number,
) {
  const entry = layerEntries(objects).find((value) => value.object.id === id);
  if (!entry || entry.effectiveLocked) return objects;
  return editSiblings(objects, entry.parentId, (siblings) => {
    const index = siblings.findIndex((object) => object.id === id),
      target = index + Math.sign(direction);
    if (target < 0 || target >= siblings.length || target === index)
      return siblings;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

export function deleteLayers(objects: DesignObject[], ids: readonly string[]) {
  const removing = new Set(
    selectedLayerRoots(objects, ids)
      .filter((entry) => !entry.effectiveLocked)
      .map((entry) => entry.object.id),
  );
  const visit = (siblings: DesignObject[]): DesignObject[] => {
    let changed = false;
    const next = siblings.flatMap((object) => {
      if (removing.has(object.id)) {
        changed = true;
        return [];
      }
      const children = object.children && visit(object.children);
      if (children && children !== object.children) {
        changed = true;
        return [{ ...object, children }];
      }
      return [object];
    });
    return changed ? next : siblings;
  };
  return visit(objects);
}

export function duplicateLayers(
  objects: DesignObject[],
  ids: readonly string[],
  uid: () => string,
) {
  const copying = new Set(
      selectedLayerRoots(objects, ids)
        .filter((entry) => !entry.effectiveLocked)
        .map((entry) => entry.object.id),
    ),
    selected: string[] = [];
  const clone = (object: DesignObject): DesignObject => ({
    ...object,
    id: uid(),
    ...(object.children ? { children: object.children.map(clone) } : {}),
  });
  const visit = (siblings: DesignObject[]): DesignObject[] => {
    let changed = false;
    const next = siblings.flatMap((object) => {
      if (copying.has(object.id)) {
        const copy = {
          ...clone(object),
          name: `${object.name} — salinan`,
          x: object.x + 20,
          y: object.y + 20,
        };
        selected.push(copy.id);
        changed = true;
        return [object, copy];
      }
      const children = object.children && visit(object.children);
      if (children && children !== object.children) {
        changed = true;
        return [{ ...object, children }];
      }
      return [object];
    });
    return changed ? next : siblings;
  };
  return { objects: visit(objects), selected };
}

export function groupLayers(
  objects: DesignObject[],
  ids: readonly string[],
  bounds: { x: number; y: number; width: number; height: number },
  id: string,
) {
  const entries = selectedLayerRoots(objects, ids).filter(
    (entry) => !entry.effectiveLocked,
  );
  if (
    entries.length < 2 ||
    entries.some((entry) => entry.parentId !== entries[0].parentId)
  )
    return objects;
  const members = new Set(entries.map((entry) => entry.object.id));
  // The existing schema bounds group nesting, independently of the number of layers.
  if (
    layerEntries(objects).some(
      (entry) =>
        (members.has(entry.object.id) ||
          entry.ancestors.some((id) => members.has(id))) &&
        (entry.depth >= 5 ||
          (entry.object.type === "group" && entry.depth >= 4)),
    )
  )
    return objects;
  return editSiblings(objects, entries[0].parentId, (siblings) => {
    const items = siblings.filter((object) => members.has(object.id)),
      last = siblings.reduce(
        (index, object, i) => (members.has(object.id) ? i : index),
        -1,
      );
    const group = {
      ...baseObject(
        id,
        "group",
        "Grup",
        bounds.x,
        bounds.y,
        Math.max(1, bounds.width),
        Math.max(1, bounds.height),
      ),
      children: items.map((object) => ({
        ...object,
        x: object.x - bounds.x,
        y: object.y - bounds.y,
      })),
    };
    return siblings.flatMap((object, index) =>
      index === last ? [group] : members.has(object.id) ? [] : [object],
    );
  });
}

export function ungroupLayers(
  objects: DesignObject[],
  ids: readonly string[],
  project: (group: DesignObject, child: DesignObject) => DesignObject,
) {
  const groups = new Set(
    selectedLayerRoots(objects, ids)
      .filter(
        (entry) => !entry.effectiveLocked && entry.object.type === "group",
      )
      .map((entry) => entry.object.id),
  );
  const selected: string[] = [];
  const visit = (siblings: DesignObject[]): DesignObject[] => {
    let changed = false;
    const next = siblings.flatMap((object) => {
      if (groups.has(object.id)) {
        changed = true;
        return (object.children || []).map((child) => {
          selected.push(child.id);
          return {
            ...project(object, child),
            opacity: object.opacity * child.opacity,
            visible: object.visible && child.visible,
          };
        });
      }
      const children = object.children && visit(object.children);
      if (children && children !== object.children) {
        changed = true;
        return [{ ...object, children }];
      }
      return [object];
    });
    return changed ? next : siblings;
  };
  return { objects: visit(objects), selected };
}

// Badges/stickers are ordinary groups with editable text and shapes, not flattened bitmaps.
export function createDecoration(
  kind: "badge" | "sticker",
  width: number,
  height: number,
  uid: () => string,
): DesignObject {
  const w = width * 0.32,
    h = kind === "badge" ? height * 0.12 : width * 0.32;
  return {
    ...baseObject(
      uid(),
      "group",
      kind === "badge" ? "Badge promo" : "Stiker",
      width * 0.15,
      height * 0.2,
      w,
      h,
    ),
    children: [
      {
        ...baseObject(uid(), "shape", "Bentuk", 0, 0, w, h),
        shape: kind === "badge" ? "rect" : "star",
        fill: kind === "badge" ? "#bb9bff" : "#f7cc69",
        cornerRadius: kind === "badge" ? 16 : 0,
      },
      {
        ...baseObject(
          uid(),
          "text",
          "Teks badge",
          w * 0.1,
          h * 0.32,
          w * 0.8,
          h * 0.4,
        ),
        text: kind === "badge" ? "PROMO" : "BARU",
        fontFamily: "Arial",
        fontSize: Math.max(8, w * 0.16),
        bold: true,
        color: "#251638",
        align: "center",
      },
    ],
  };
}
