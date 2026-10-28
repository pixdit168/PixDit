import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  baseObject,
  normalizeDesign,
  mapObjects,
  type DesignObject,
} from "../shared/design-document.js";
import {
  createDecoration,
  deleteLayers,
  duplicateLayers,
  groupLayers,
  layerEntries,
  patchLayers,
  reorderLayer,
  selectedLayerRoots,
  toggleLayer,
  ungroupLayers,
} from "../shared/design-layers.js";

const shape = (id: string): DesignObject => ({
  ...baseObject(id, "shape", id, 10, 20, 50, 50),
  shape: "rect",
  fill: "#bb99ff",
});
const fixture = () => [
  {
    ...baseObject("group", "group", "Group", 100, 100, 300, 300),
    children: [shape("one"), shape("two")],
  },
  shape("outside"),
];

test("layer counts are data driven: documents beyond 128 layers remain valid", () => {
  for (const count of [50, 100, 129, 500]) {
    const objects = Array.from({ length: count }, (_, i) =>
      i % 4 === 0
        ? createDecoration("badge", 640, 800, randomUUID)
        : i % 4 === 1
          ? {
              ...baseObject(`text-${i}`, "text", "Text", 0, 0, 100, 40),
              text: "Native text",
              fontSize: 20,
              color: "#ffffff",
            }
          : i % 4 === 2
            ? {
                ...baseObject(`image-${i}`, "image", "Photo", 0, 0, 50, 50),
                assetId: randomUUID(),
              }
            : shape(`shape-${i}`),
    );
    const normalized = normalizeDesign({
      schemaVersion: 1,
      width: 640,
      height: 800,
      background: "#201832",
      objects,
    });
    assert.equal(
      layerEntries(normalized.objects).length,
      layerEntries(objects).length,
    );
    assert.equal(normalized.objects.length, count);
  }
});

test("nested layer order, renaming, visibility and inherited locking are consistent", () => {
  let objects = fixture();
  objects = reorderLayer(objects, "one", 1);
  assert.deepEqual(
    objects[0].children.map((node) => node.id),
    ["two", "one"],
  );
  objects = patchLayers(objects, [
    { id: "one", patch: { name: "Renamed", x: 75 } },
  ]);
  assert.equal(objects[0].children[1].name, "Renamed");
  objects = toggleLayer(objects, "group", "visible");
  assert.equal(
    layerEntries(objects).find((entry) => entry.object.id === "one")
      .effectiveVisible,
    false,
  );
  objects = toggleLayer(objects, "group", "locked");
  assert.equal(
    layerEntries(objects).find((entry) => entry.object.id === "one")
      .effectiveLocked,
    true,
  );
  assert.strictEqual(
    patchLayers(objects, [{ id: "one", patch: { x: 999 } }]),
    objects,
  );
  assert.strictEqual(reorderLayer(objects, "one", -1), objects);
  assert.strictEqual(deleteLayers(objects, ["one"]), objects);
  assert.strictEqual(toggleLayer(objects, "one", "locked"), objects);
  objects = toggleLayer(objects, "group", "locked");
  assert.equal(
    patchLayers(objects, [{ id: "one", patch: { x: 50 } }])[0].children[1].x,
    50,
  );
});

test("duplicate/delete handle selected group children without duplicating an ancestor twice", () => {
  const original = fixture();
  const copy = duplicateLayers(original, ["group", "one"], randomUUID);
  assert.equal(copy.objects.length, 3);
  assert.equal(copy.selected.length, 1);
  const ids = layerEntries(copy.objects).map((entry) => entry.object.id);
  assert.equal(ids.length, new Set(ids).size);
  const childCopy = duplicateLayers(original, ["one"], randomUUID);
  assert.equal(childCopy.objects[0].children.length, 3);
  assert.equal(
    deleteLayers(childCopy.objects, childCopy.selected)[0].children.length,
    2,
  );
  assert.deepEqual(
    selectedLayerRoots(original, ["group", "one"]).map(
      (entry) => entry.object.id,
    ),
    ["group"],
  );
});

test("nested grouping/ungrouping keeps sibling stacking and parent opacity", () => {
  const original = fixture();
  const grouped = groupLayers(
    original,
    ["one", "two"],
    { x: 10, y: 20, width: 50, height: 50 },
    "nested",
  );
  assert.equal(grouped[0].children[0].id, "nested");
  const modified = patchLayers(grouped, [
    { id: "nested", patch: { opacity: 0.5 } },
  ]);
  const ungrouped = ungroupLayers(modified, ["nested"], (parent, child) => ({
    ...child,
    x: parent.x + child.x,
    y: parent.y + child.y,
  }));
  assert.deepEqual(
    ungrouped.objects[0].children.map((node) => [
      node.id,
      node.x,
      node.y,
      node.opacity,
    ]),
    [
      ["one", 10, 20, 0.5],
      ["two", 10, 20, 0.5],
    ],
  );
  assert.strictEqual(
    groupLayers(
      original,
      ["one", "outside"],
      { x: 0, y: 0, width: 100, height: 100 },
      "invalid",
    ),
    original,
  );
});

test("unchanged branches retain identity for canvas and layer-panel memoization", () => {
  const original = fixture();
  assert.strictEqual(
    mapObjects(original, (node) => node),
    original,
  );
  const next = patchLayers(original, [{ id: "one", patch: { x: 45 } }]);
  assert.strictEqual(next[1], original[1]);
  assert.strictEqual(next[0].children[1], original[0].children[1]);
  assert.notStrictEqual(next[0], original[0]);
});

test("badge and sticker text stays native, independently editable and serializable", () => {
  for (const kind of ["badge", "sticker"] as const) {
    const object = createDecoration(kind, 640, 800, randomUUID);
    assert.equal(object.type, "group");
    assert.deepEqual(
      object.children.map((child) => child.type),
      ["shape", "text"],
    );
    const text = object.children[1];
    const edited = patchLayers(
      [object],
      [{ id: text.id, patch: { text: "Diskon 25%" } }],
    );
    const document = normalizeDesign({
      schemaVersion: 1,
      width: 640,
      height: 800,
      background: "#201832",
      objects: edited,
    });
    assert.equal(document.objects[0].children[1].text, "Diskon 25%");
  }
});

test("grouping cannot create a draft that exceeds the existing nesting schema", () => {
  let objects: DesignObject[] = [shape("leaf1"), shape("leaf2")];
  for (let i = 4; i >= 0; i--)
    objects = [
      {
        ...baseObject(`g${i}`, "group", `Group ${i}`, 0, 0, 100, 100),
        children: objects,
      },
    ];
  normalizeDesign({
    schemaVersion: 1,
    width: 640,
    height: 800,
    background: "#ffffff",
    objects,
  });
  assert.strictEqual(
    groupLayers(
      objects,
      ["leaf1", "leaf2"],
      { x: 0, y: 0, width: 100, height: 100 },
      "too-deep",
    ),
    objects,
  );
});
