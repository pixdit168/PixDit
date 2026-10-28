import { useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Group,
  Rect,
  Ellipse,
  Star,
  Text,
  Image as CanvasImage,
  Line,
} from "react-konva";
import Konva from "konva";
import {
  assetIds,
  type DesignDocument,
  type DesignObject,
} from "../shared/design-document";
import { SelectionControls } from "./SelectionControls";
import { selectedLayerRoots } from "../shared/design-layers";
const cache = new Map<string, Promise<HTMLImageElement>>();
const EMPTY_SELECTION: string[] = [];
function imageFor(url: string) {
  if (!/^\/api\/design-assets\/[0-9a-f-]+$/i.test(url))
    return Promise.reject(new Error("Sumber aset tidak valid."));
  if (!cache.has(url))
    cache.set(
      url,
      new Promise((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
          cache.delete(url);
          reject(new Error("Aset gagal dimuat. Periksa sesi dan coba lagi."));
        };
        image.src = url;
      }),
    );
  return cache.get(url)!;
}
export type CanvasProps = {
  document: DesignDocument;
  selected?: string[];
  zoom?: number;
  editing?: string | null;
  onSelect?: (id: string | null, multi: boolean) => void;
  onPatch?: (patches: { id: string; patch: Partial<DesignObject> }[]) => void;
  onEditText?: (id: string, node: Konva.Text) => void;
  onReady?: (stage: Konva.Stage) => void;
  onError?: (message: string) => void;
  readOnly?: boolean;
};
export function EditorCanvas(props: CanvasProps) {
  const {
    document: doc,
    selected = EMPTY_SELECTION,
    zoom = 1,
    readOnly = false,
  } = props;
  const stageRef = useRef<Konva.Stage>(null);
  const [stage, setStage] = useState<Konva.Stage | null>(null);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [ready, setReady] = useState(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const callbacks = useRef(props);
  callbacks.current = props;
  const rootIds = useMemo(
    () =>
      selectedLayerRoots(doc.objects, selected)
        .filter((entry) => !entry.effectiveLocked && entry.effectiveVisible)
        .map((entry) => entry.object.id),
    [doc.objects, selected],
  );
  const updateGuides = (next: { x?: number; y?: number }) =>
    setGuides((old) => (old.x === next.x && old.y === next.y ? old : next));
  const key = assetIds(doc)
    .map((id) => `${id}:${doc.assets[id]?.url}`)
    .join("|");
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    Promise.all([
      Promise.all(
        assetIds(doc).map(
          async (id) => [id, await imageFor(doc.assets[id]?.url)] as const,
        ),
      ),
      document.fonts.ready,
    ])
      .then(([entries]) => {
        if (!cancelled) {
          setImages(Object.fromEntries(entries));
          setReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) props.onError?.(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  useEffect(() => {
    if (stageRef.current) {
      setStage(stageRef.current);
      if (ready) props.onReady?.(stageRef.current);
    }
  }, [ready, props.onReady]);
  const finish = (node: Konva.Node) => {
    const ids = rootIds.includes(node.id()) ? rootIds : [node.id()];
    callbacks.current.onPatch?.(
      ids.flatMap((id) => {
        const n = stageRef.current!.findOne(`#${id}`);
        if (!n || n.getAttr("editorLocked")) return [];
        return [
          {
            id,
            patch: {
              x: n.x(),
              y: n.y(),
              rotation: n.rotation(),
              scaleX: Math.max(0.01, n.scaleX()),
              scaleY: Math.max(0.01, n.scaleY()),
            },
          },
        ];
      }),
    );
    updateGuides({});
  };
  const render = (
    object: DesignObject,
    parentLocked = false,
    ancestorSelected = false,
    nested = false,
  ): React.ReactNode => {
    const locked = parentLocked || object.locked || readOnly;
    const interactive = !locked && !ancestorSelected;
    const selectedDescendant =
      object.children &&
      selectedLayerRoots(object.children, selected).length > 0;
    const common = {
      id: object.id,
      name: "design-object",
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      opacity: object.opacity,
      visible: object.visible && props.editing !== object.id,
      draggable: interactive && !selectedDescendant,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (interactive) {
          e.cancelBubble = true;
          callbacks.current.onSelect?.(
            object.id,
            e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey,
          );
        }
      },
      onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
        if (interactive) {
          e.cancelBubble = true;
          callbacks.current.onSelect?.(object.id, false);
        }
      },
      onDragStart: (event: Konva.KonvaEventObject<DragEvent>) => {
        event.cancelBubble = true;
        if (!selected.includes(object.id))
          callbacks.current.onSelect?.(object.id, false);
      },
      onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true;
        const node = e.target;
        const guide: { x?: number; y?: number } = {};
        if (
          !nested &&
          rootIds.length <= 1 &&
          Math.abs(
            node.x() + (object.width * object.scaleX) / 2 - doc.width / 2,
          ) < 7
        ) {
          node.x(doc.width / 2 - (object.width * object.scaleX) / 2);
          guide.x = doc.width / 2;
        }
        if (
          !nested &&
          rootIds.length <= 1 &&
          Math.abs(
            node.y() + (object.height * object.scaleY) / 2 - doc.height / 2,
          ) < 7
        ) {
          node.y(doc.height / 2 - (object.height * object.scaleY) / 2);
          guide.y = doc.height / 2;
        }
        // Konva's Transformer already synchronizes dragging across its attached nodes.
        updateGuides(guide);
      },
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
        e.cancelBubble = true;
        finish(e.target);
      },
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
        e.cancelBubble = true;
        finish(e.target);
      },
    };
    Object.assign(common, {
      skewX: object.skewX || 0,
      skewY: object.skewY || 0,
      editorLocked: !interactive,
    });
    if (object.type === "group")
      return (
        <Group key={object.id} {...common}>
          {object.children?.map((child) =>
            render(
              child,
              locked,
              ancestorSelected || selected.includes(object.id),
              true,
            ),
          )}
        </Group>
      );
    if (object.type === "text")
      return (
        <Text
          key={object.id}
          {...common}
          text={object.text || ""}
          fontFamily={object.fontFamily}
          fontSize={object.fontSize}
          fontStyle={`${object.italic ? "italic " : ""}${object.bold ? "bold" : "normal"}`}
          fill={object.color}
          align={object.align}
          wrap="word"
          lineHeight={1.2}
          onDblClick={(e) => {
            if (interactive) {
              e.cancelBubble = true;
              callbacks.current.onEditText?.(object.id, e.target as Konva.Text);
            }
          }}
          onDblTap={(e) => {
            if (interactive) {
              e.cancelBubble = true;
              callbacks.current.onEditText?.(object.id, e.target as Konva.Text);
            }
          }}
        />
      );
    if (object.type === "image") {
      const image = images[object.assetId!];
      let width = object.width,
        height = object.height,
        x = 0,
        y = 0;
      if (image) {
        const ratio =
          object.fit === "cover"
            ? Math.max(width / image.width, height / image.height)
            : Math.min(width / image.width, height / image.height);
        width = image.width * ratio;
        height = image.height * ratio;
        x = (object.width - width) / 2;
        y = (object.height - height) / 2;
      }
      return (
        <Group
          key={object.id}
          {...common}
          clipWidth={object.width}
          clipHeight={object.height}
        >
          <Rect
            width={object.width}
            height={object.height}
            fill="rgba(0,0,0,0)"
          />
          <CanvasImage
            image={image}
            x={x}
            y={y}
            width={width}
            height={height}
            listening={false}
          />
        </Group>
      );
    }
    const style = {
      fill: object.fill,
      stroke: object.stroke,
      strokeWidth: object.strokeWidth || 0,
    };
    if (object.shape === "ellipse")
      return (
        <Group key={object.id} {...common}>
          <Ellipse
            x={object.width / 2}
            y={object.height / 2}
            radiusX={object.width / 2}
            radiusY={object.height / 2}
            {...style}
          />
        </Group>
      );
    if (object.shape === "star")
      return (
        <Group key={object.id} {...common}>
          <Star
            x={object.width / 2}
            y={object.height / 2}
            numPoints={5}
            innerRadius={Math.min(object.width, object.height) * 0.22}
            outerRadius={Math.min(object.width, object.height) / 2}
            {...style}
          />
        </Group>
      );
    return (
      <Rect
        key={object.id}
        {...common}
        {...style}
        cornerRadius={object.cornerRadius || 0}
      />
    );
  };
  // Pointer guide changes do not rebuild every artwork node.
  const artwork = useMemo(
    () => doc.objects.map((object) => render(object)),
    [
      doc.objects,
      doc.width,
      doc.height,
      images,
      selected,
      props.editing,
      readOnly,
    ],
  );
  return (
    <div
      className="design-artboard"
      style={{ width: doc.width * zoom, height: doc.height * zoom }}
    >
      <Stage
        ref={stageRef}
        width={doc.width * zoom}
        height={doc.height * zoom}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={(e) => {
          if (
            e.target === e.target.getStage() ||
            e.target.name() === "artboard"
          )
            props.onSelect?.(null, false);
        }}
        onTouchStart={(e) => {
          if (
            e.target === e.target.getStage() ||
            e.target.name() === "artboard"
          )
            props.onSelect?.(null, false);
        }}
      >
        <Layer>
          <Rect
            name="artboard"
            width={doc.width}
            height={doc.height}
            fill={doc.background}
          />
          {artwork}
        </Layer>
        {!readOnly && (
          <Layer>
            <SelectionControls
              stage={stage}
              ids={rootIds}
              enabled={!props.editing}
              objects={doc.objects}
            />
            {guides.x !== undefined && (
              <Line
                name="editor-controls"
                listening={false}
                points={[guides.x, 0, guides.x, doc.height]}
                stroke="#e8a4f3"
                strokeWidth={1 / zoom}
              />
            )}
            {guides.y !== undefined && (
              <Line
                name="editor-controls"
                listening={false}
                points={[0, guides.y, doc.width, guides.y]}
                stroke="#e8a4f3"
                strokeWidth={1 / zoom}
              />
            )}
          </Layer>
        )}
      </Stage>
      {!ready && <span className="design-loading">Memuat aset…</span>}
    </div>
  );
}
