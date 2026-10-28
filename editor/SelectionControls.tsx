import { useEffect, useRef } from "react";
import { Transformer } from "react-konva";
import type Konva from "konva";
export function SelectionControls({
  stage,
  ids,
  enabled,
  objects,
}: {
  stage: Konva.Stage | null;
  ids: string[];
  enabled: boolean;
  objects: readonly unknown[];
}) {
  const ref = useRef<Konva.Transformer>(null);
  useEffect(() => {
    const transformer = ref.current;
    if (!transformer || !stage) return;
    transformer.nodes(
      enabled
        ? ids
            .map((id) => stage.findOne(`#${id}`))
            .filter(
              (node): node is Konva.Node =>
                !!node && node.isVisible() && !node.getAttr("editorLocked"),
            )
        : [],
    );
    transformer.getLayer()?.batchDraw();
  }, [stage, ids, enabled, objects]);
  return (
    <Transformer
      ref={ref}
      name="editor-controls"
      flipEnabled={false}
      keepRatio={true}
      rotateEnabled
      borderStroke="#cfacff"
      anchorFill="#fff"
      anchorStroke="#b78bfa"
      anchorSize={10}
      boundBoxFunc={(old, next) =>
        Math.abs(next.width) < 8 ||
        Math.abs(next.height) < 8 ||
        Math.abs(next.width) > 16000 ||
        Math.abs(next.height) > 16000
          ? old
          : next
      }
    />
  );
}
