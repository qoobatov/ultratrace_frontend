import { useState, useEffect, useRef, useCallback } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Group,
  Circle,
  Line,
} from "react-konva";
import { getPoints, savePoints, getFrameUrl } from "../../api/client";

const MAX_HISTORY = 50;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const CLICK_DIST_THRESHOLD = 3;
const SELECTED_COLOR = "cyan";

const FrameCanvas = ({
  frameNumber,
  activeTrace,
  traceColor,
  pointsVersion,
}) => {
  const [image, setImage] = useState(null);
  const [points, setPoints] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  // Флаг: выделение "зафиксировано" и отображается цветом до следующего действия
  const [selectionFrozen, setSelectionFrozen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const imageCache = useRef(new Map());
  const isShiftDown = useRef(false);

  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const [selectionRect, setSelectionRect] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const mouseDownPos = useRef(null);
  const gestureStarted = useRef(false);
  const pointDragged = useRef(false);

  // Сбросить "заморозку" цвета выделения
  const thawSelection = () => setSelectionFrozen(false);

  // --- Загрузка изображения ---
  const loadImage = useCallback((frameNum) => {
    if (imageCache.current.has(frameNum))
      return Promise.resolve(imageCache.current.get(frameNum));
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.src = getFrameUrl(frameNum) + "?t=" + Date.now();
      img.onload = () => {
        imageCache.current.set(frameNum, img);
        resolve(img);
      };
      img.onerror = reject;
    });
  }, []);

  useEffect(() => {
    if (!frameNumber) return;
    let cancelled = false;
    loadImage(frameNumber)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load frame", err);
      });
    loadImage(frameNumber + 1).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [frameNumber, loadImage]);

  // --- Загрузка точек ---
  useEffect(() => {
    if (!activeTrace || !frameNumber) return;
    const fetchPoints = async () => {
      try {
        const pts = await getPoints(activeTrace, frameNumber);
        setPoints(pts || []);
        setSelectedIndices(new Set());
        setSelectionFrozen(false);
        setHistory([{ points: pts || [] }]);
        setHistoryIndex(0);
      } catch (err) {
        console.error("Failed to fetch points", err);
        setPoints([]);
      }
    };
    fetchPoints();
  }, [activeTrace, frameNumber, pointsVersion]);

  // --- История ---
  const pushHistory = useCallback(
    (newPoints) => {
      setHistory((prev) => {
        const newHist = prev.slice(0, historyIndex + 1);
        newHist.push({ points: newPoints });
        if (newHist.length > MAX_HISTORY) newHist.shift();
        return newHist;
      });
      setHistoryIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
    },
    [historyIndex],
  );

  const undo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      const oldState = history[newIdx];
      setPoints(oldState.points);
      savePoints(activeTrace, frameNumber, oldState.points);
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      const nextState = history[newIdx];
      setPoints(nextState.points);
      savePoints(activeTrace, frameNumber, nextState.points);
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
    }
  };

  // --- Клавиатура ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Shift") isShiftDown.current = true;
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIndices.size > 0 &&
        activeTrace
      ) {
        const newPoints = points.filter((_, i) => !selectedIndices.has(i));
        setPoints(newPoints);
        savePoints(activeTrace, frameNumber, newPoints);
        pushHistory(newPoints);
        setSelectedIndices(new Set());
        setSelectionFrozen(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    const handleKeyUp = (e) => {
      if (e.key === "Shift") isShiftDown.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [points, selectedIndices, activeTrace, frameNumber, pushHistory]);

  // --- Координаты ---
  const getRelativeCoords = useCallback(
    (pointerPos) => {
      const stage = stageRef.current;
      if (!stage || !image) return null;
      const transform = stage.getAbsoluteTransform().copy().invert();
      const canvasPos = transform.point(pointerPos);
      const scale = Math.min(
        stage.width() / image.width,
        stage.height() / image.height,
      );
      return {
        x: canvasPos.x / (image.width * scale),
        y: canvasPos.y / (image.height * scale),
      };
    },
    [image],
  );

  const addPointAt = (pointerPos) => {
    if (!activeTrace || !image) return;
    const rel = getRelativeCoords(pointerPos);
    if (!rel) return;
    const stage = stageRef.current;
    const baseScale = Math.min(
      stage.width() / image.width,
      stage.height() / image.height,
    );
    const minDistRel = 12 / (image.width * baseScale);
    const tooClose = points.some(
      (p) => Math.hypot(p.x - rel.x, p.y - rel.y) < minDistRel,
    );
    if (tooClose) return;
    thawSelection(); // добавление точки сбрасывает цвет выделения
    const newPoints = [...points, { x: rel.x, y: rel.y }];
    setPoints(newPoints);
    savePoints(activeTrace, frameNumber, newPoints);
    pushHistory(newPoints);
  };

  const isOverPoint = (pointerPos) => {
    const stage = stageRef.current;
    if (!stage || !image) return false;
    const baseScale = Math.min(
      stage.width() / image.width,
      stage.height() / image.height,
    );
    const transform = stage.getAbsoluteTransform().copy().invert();
    const worldPos = transform.point(pointerPos);
    return points.some((point) => {
      const cx = point.x * image.width * baseScale;
      const cy = point.y * image.height * baseScale;
      return Math.hypot(worldPos.x - cx, worldPos.y - cy) < 12;
    });
  };

  // --- Stage mouse handlers ---
  const handleStageMouseDown = () => {
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    if (isOverPoint(pointerPos)) return;

    mouseDownPos.current = { x: pointerPos.x, y: pointerPos.y };
    gestureStarted.current = false;
  };

  const handleStageMouseMove = () => {
    if (!mouseDownPos.current) return;
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    const dx = pointerPos.x - mouseDownPos.current.x;
    const dy = pointerPos.y - mouseDownPos.current.y;
    if (!gestureStarted.current && Math.hypot(dx, dy) < CLICK_DIST_THRESHOLD)
      return;
    gestureStarted.current = true;

    // Shift зажат → всегда рамка выделения, даже при zoom > 1
    const shouldSelect = stageScale <= 1 || isShiftDown.current;

    if (!shouldSelect) {
      // Панорамирование
      if (!isPanning) {
        setIsPanning(true);
        lastPointer.current = { x: pointerPos.x, y: pointerPos.y };
      } else {
        const pdx = pointerPos.x - lastPointer.current.x;
        const pdy = pointerPos.y - lastPointer.current.y;
        lastPointer.current = { x: pointerPos.x, y: pointerPos.y };
        setStageX((prev) => prev + pdx);
        setStageY((prev) => prev + pdy);
      }
    } else {
      // Рамка выделения
      setIsSelecting(true);
      setSelectionRect({
        x1: mouseDownPos.current.x,
        y1: mouseDownPos.current.y,
        x2: pointerPos.x,
        y2: pointerPos.y,
      });
    }
  };

  const handleStageMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      mouseDownPos.current = null;
      return;
    }

    if (isSelecting) {
      setIsSelecting(false);
      const stage = stageRef.current;
      if (selectionRect && image) {
        const transform = stage.getAbsoluteTransform().copy().invert();
        const p1 = transform.point({
          x: Math.min(selectionRect.x1, selectionRect.x2),
          y: Math.min(selectionRect.y1, selectionRect.y2),
        });
        const p2 = transform.point({
          x: Math.max(selectionRect.x1, selectionRect.x2),
          y: Math.max(selectionRect.y1, selectionRect.y2),
        });
        const baseScale = Math.min(
          stage.width() / image.width,
          stage.height() / image.height,
        );
        const minX = p1.x / (image.width * baseScale);
        const maxX = p2.x / (image.width * baseScale);
        const minY = p1.y / (image.height * baseScale);
        const maxY = p2.y / (image.height * baseScale);

        const newSelected = new Set();
        points.forEach((p, i) => {
          if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
            newSelected.add(i);
        });
        if (newSelected.size > 0) {
          setSelectedIndices(newSelected);
          setSelectionFrozen(true); // фиксируем цвет после рамки
        } else {
          setSelectedIndices(new Set());
          setSelectionFrozen(false);
        }
      }
      setSelectionRect(null);
      mouseDownPos.current = null;
      return;
    }

    // Клик по фону
    if (!gestureStarted.current && mouseDownPos.current) {
      // Клик по пустому месту сбрасывает выделение и цвет
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
      addPointAt(stageRef.current.getPointerPosition());
    }
    mouseDownPos.current = null;
  };

  // --- Обработчики точек ---
  const handlePointClick = (index, e) => {
    if (pointDragged.current) {
      pointDragged.current = false;
      return;
    }
    e.cancelBubble = true;
    if (isShiftDown.current) {
      setSelectedIndices((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        // Фиксируем цвет если что-то выделено
        setSelectionFrozen(newSet.size > 0);
        return newSet;
      });
    } else {
      setSelectedIndices(new Set([index]));
      setSelectionFrozen(true); // клик по точке фиксирует цвет
    }
  };

  const handlePointDragStart = (index, e) => {
    e.cancelBubble = true;
    pointDragged.current = false;
    mouseDownPos.current = null;
    thawSelection(); // начало drag сбрасывает цвет
    if (!selectedIndices.has(index)) setSelectedIndices(new Set([index]));
  };

  const handlePointDragMove = (index, e) => {
    e.cancelBubble = true;
    pointDragged.current = true;
    if (!selectedIndices.has(index) || selectedIndices.size <= 1) return;

    const stage = stageRef.current;
    if (!stage || !image) return;
    const baseScale = Math.min(
      stage.width() / image.width,
      stage.height() / image.height,
    );
    const group = e.target;
    const groupAbsPos = group.getAbsolutePosition();
    const draggedWorld = {
      x: groupAbsPos.x / stageScale - stageX / stageScale,
      y: groupAbsPos.y / stageScale - stageY / stageScale,
    };
    const origPoint = points[index];
    const origWorld = {
      x: origPoint.x * image.width * baseScale,
      y: origPoint.y * image.height * baseScale,
    };
    const deltaX = draggedWorld.x - origWorld.x;
    const deltaY = draggedWorld.y - origWorld.y;

    const layer = stage.findOne("Layer");
    if (!layer) return;
    layer.find("Group").forEach((g) => {
      const gIndex = g.getAttr("data-index");
      if (
        gIndex === undefined ||
        gIndex === index ||
        !selectedIndices.has(gIndex)
      )
        return;
      const p = points[gIndex];
      g.x(p.x * image.width * baseScale + deltaX);
      g.y(p.y * image.height * baseScale + deltaY);
    });
  };

  const handlePointDragEnd = (index, e) => {
    e.cancelBubble = true;
    pointDragged.current = true;

    const stage = stageRef.current;
    if (!stage || !image) return;
    const baseScale = Math.min(
      stage.width() / image.width,
      stage.height() / image.height,
    );
    const group = e.target;
    const groupAbsPos = group.getAbsolutePosition();
    const draggedWorld = {
      x: groupAbsPos.x / stageScale - stageX / stageScale,
      y: groupAbsPos.y / stageScale - stageY / stageScale,
    };
    const origPoint = points[index];
    const origWorld = {
      x: origPoint.x * image.width * baseScale,
      y: origPoint.y * image.height * baseScale,
    };
    const deltaRelX =
      (draggedWorld.x - origWorld.x) / (image.width * baseScale);
    const deltaRelY =
      (draggedWorld.y - origWorld.y) / (image.height * baseScale);

    let newPoints;
    if (selectedIndices.has(index) && selectedIndices.size > 1) {
      newPoints = points.map((p, i) =>
        selectedIndices.has(i) ? { x: p.x + deltaRelX, y: p.y + deltaRelY } : p,
      );
    } else {
      newPoints = points.map((p, i) =>
        i === index
          ? {
              x: draggedWorld.x / (image.width * baseScale),
              y: draggedWorld.y / (image.height * baseScale),
            }
          : p,
      );
    }

    const layer = stage.findOne("Layer");
    if (layer) {
      layer.find("Group").forEach((g) => {
        const gIndex = g.getAttr("data-index");
        if (gIndex === undefined) return;
        const p = newPoints[gIndex];
        if (p) {
          g.x(p.x * image.width * baseScale);
          g.y(p.y * image.height * baseScale);
        }
      });
    }

    setPoints(newPoints);
    savePoints(activeTrace, frameNumber, newPoints);
    pushHistory(newPoints);
    // После drag выделение остаётся, но цвет сбрасывается — следующее действие уберёт highlight
    // (уже сброшено в dragStart через thawSelection)
  };

  // --- Зум ---
  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const newScale = direction > 0 ? oldScale * 1.05 : oldScale / 1.05;
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    setStageScale(clampedScale);
    setStageX(pointer.x - mousePointTo.x * clampedScale);
    setStageY(pointer.y - mousePointTo.y * clampedScale);
  };

  const resetZoom = () => {
    setStageScale(1);
    setStageX(0);
    setStageY(0);
  };

  if (!image) return <div>No frame loaded</div>;

  const stageWidth = 800;
  const stageHeight = 600;
  const baseScale = Math.min(
    stageWidth / image.width,
    stageHeight / image.height,
  );
  const color = traceColor || "red";

  const selRectStyle = selectionRect
    ? {
        position: "absolute",
        left: Math.min(selectionRect.x1, selectionRect.x2),
        top: Math.min(selectionRect.y1, selectionRect.y2),
        width: Math.abs(selectionRect.x2 - selectionRect.x1),
        height: Math.abs(selectionRect.y2 - selectionRect.y1),
        border: "1px solid rgba(0,128,255,0.8)",
        background: "rgba(0,128,255,0.12)",
        pointerEvents: "none",
      }
    : null;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "#222",
      }}
    >
      <div style={{ display: "flex", gap: "4px", padding: "4px" }}>
        <button onClick={undo} title="Undo (Ctrl+Z)">
          ↩️
        </button>
        <button onClick={redo} title="Redo (Ctrl+Shift+Z)">
          ↪️
        </button>
        <span style={{ color: "white", margin: "0 8px" }}>
          {selectedIndices.size > 0
            ? `${selectedIndices.size} selected`
            : "No selection"}
        </span>
        <button
          onClick={() => setStageScale((p) => Math.min(MAX_SCALE, p * 1.1))}
        >
          🔍+
        </button>
        <button
          onClick={() => setStageScale((p) => Math.max(MIN_SCALE, p / 1.1))}
        >
          🔍−
        </button>
        <button onClick={resetZoom}>Reset</button>
      </div>

      <div style={{ position: "relative", lineHeight: 0 }}>
        <Stage
          width={stageWidth}
          height={stageHeight}
          ref={stageRef}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stageX}
          y={stageY}
          onMouseDown={handleStageMouseDown}
          onMousemove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onWheel={handleWheel}
          style={{
            cursor: isPanning
              ? "grabbing"
              : isSelecting
                ? "crosshair"
                : "default",
          }}
        >
          <Layer>
            <KonvaImage
              ref={imageRef}
              image={image}
              x={0}
              y={0}
              width={image.width * baseScale}
              height={image.height * baseScale}
            />
            {points.map((point, i) => {
              const cx = point.x * image.width * baseScale;
              const cy = point.y * image.height * baseScale;
              const isSelected = selectedIndices.has(i);
              // Цвет: cyan если выделено и заморожено, yellow если выделено в процессе, иначе traceColor
              const ptColor = isSelected
                ? selectionFrozen
                  ? SELECTED_COLOR
                  : "yellow"
                : color;
              const size = 7;
              return (
                <Group
                  key={i}
                  x={cx}
                  y={cy}
                  draggable
                  onDragStart={(e) => handlePointDragStart(i, e)}
                  onDragMove={(e) => handlePointDragMove(i, e)}
                  onDragEnd={(e) => handlePointDragEnd(i, e)}
                  onClick={(e) => handlePointClick(i, e)}
                  onTap={(e) => handlePointClick(i, e)}
                  data-index={i}
                >
                  <Line
                    points={[-size, 0, size, 0]}
                    stroke={ptColor}
                    strokeWidth={1.5}
                    listening={false}
                  />
                  <Line
                    points={[0, -size, 0, size]}
                    stroke={ptColor}
                    strokeWidth={1.5}
                    listening={false}
                  />
                  <Circle radius={10} fill="transparent" />
                </Group>
              );
            })}
          </Layer>
        </Stage>
        {selRectStyle && <div style={selRectStyle} />}
      </div>
    </div>
  );
};

export default FrameCanvas;
