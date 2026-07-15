import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Group,
  Circle,
  Line,
} from "react-konva";
import {
  getPoints,
  savePoints,
  getFrameUrl,
  autoTraceFrame,
} from "../../api/client";

const MAX_HISTORY = 50;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const CLICK_DIST_THRESHOLD = 3;
const SELECTED_COLOR = "cyan";
const DEFAULT_STAGE_SIZE = { width: 730, height: 530 };

// --- Reducer для undo/redo истории ---
const historyReducer = (state, action) => {
  switch (action.type) {
    case "PUSH": {
      const entries = state.entries.slice(0, state.index + 1);
      entries.push({ points: action.payload });
      if (entries.length > MAX_HISTORY) entries.shift();
      return { entries, index: entries.length - 1 };
    }
    case "UNDO": {
      if (state.index > 0) return { ...state, index: state.index - 1 };
      return state;
    }
    case "REDO": {
      if (state.index < state.entries.length - 1)
        return { ...state, index: state.index + 1 };
      return state;
    }
    case "RESET": {
      return { entries: [{ points: action.payload }], index: 0 };
    }
    default:
      return state;
  }
};

const FrameCanvas = ({
  frameNumber,
  activeTrace,
  traceColor,
  pointsVersion,
  studyVersion,
  onPointsSaved,
}) => {
  // ---------- состояние ----------
  const [image, setImage] = useState(null);

  // История хранится централизованно; points – производное значение
  const [historyState, dispatch] = useReducer(historyReducer, {
    entries: [{ points: [] }],
    index: 0,
  });
  const points = historyState.entries[historyState.index]?.points ?? [];
  // ref для актуального массива точек (избегаем устаревших замыканий)
  const pointsRef = useRef(points);
  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [selectionFrozen, setSelectionFrozen] = useState(false);

  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const imageCache = useRef(new Map());
  const isSpaceDown = useRef(false);
  const clipboardRef = useRef(null);

  // Защита от лишней перезагрузки данных после локального сохранения
  const lastSavedContext = useRef(null); // { activeTrace, frameNumber }

  const [stageSize, setStageSize] = useState(DEFAULT_STAGE_SIZE);
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [draftPoints, setDraftPoints] = useState([]);
  const lastPointer = useRef({ x: 0, y: 0 });

  const [selectionRect, setSelectionRect] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const mouseDownPos = useRef(null);
  const gestureStarted = useRef(false);
  const pointDragged = useRef(false);

  // Буфер для точек, нарисованных за одно непрерывное движение мыши
  const drawBufferRef = useRef([]);

  // --- Responsive stage ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = (width, height) => {
      if (width > 0 && height > 0) {
        setStageSize({ width, height });
      }
    };
    const rect = el.getBoundingClientRect();
    updateSize(rect.width, rect.height);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      updateSize(width, height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Сброс контекста сохранения при размонтировании
  useEffect(() => {
    return () => {
      lastSavedContext.current = null;
    };
  }, []);

  // ----- AUTO_TRACE -----
  const handleAutoTrace = async () => {
    if (!activeTrace || !frameNumber) return;
    try {
      const pts = await autoTraceFrame(activeTrace, frameNumber);
      dispatch({ type: "RESET", payload: pts || [] });
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
      lastSavedContext.current = { activeTrace, frameNumber };
      // точки уже на сервере после auto‑трейса, но для единообразия вызовем onPointsSaved
      onPointsSaved?.();
    } catch (err) {
      console.error("Auto-trace failed", err);
    }
  };

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
  }, [frameNumber, loadImage, studyVersion]);

  // --- Загрузка точек с сервера ---
  useEffect(() => {
    if (!activeTrace || !frameNumber) return;

    // Если мы только что сами сохранили точки для этого же кадра/трассы,
    // нет смысла перезатирать историю серверными данными.
    if (
      lastSavedContext.current &&
      lastSavedContext.current.activeTrace === activeTrace &&
      lastSavedContext.current.frameNumber === frameNumber
    ) {
      lastSavedContext.current = null;
      return;
    }

    const fetchPoints = async () => {
      try {
        const pts = await getPoints(activeTrace, frameNumber);
        dispatch({ type: "RESET", payload: pts || [] });
        setSelectedIndices(new Set());
        setSelectionFrozen(false);
      } catch (err) {
        console.error("Failed to fetch points", err);
        dispatch({ type: "RESET", payload: [] });
      }
    };
    fetchPoints();
  }, [activeTrace, frameNumber, pointsVersion]);

  // --- Вспомогательные функции ---
  // Установка флага, что мы только что сохранили данные локально
  const markLocalSave = () => {
    lastSavedContext.current = { activeTrace, frameNumber };
  };

  // Сохранение на сервер с вызовом колбэка
  const persistPoints = useCallback(
    async (newPoints) => {
      if (!activeTrace || !frameNumber) return;
      try {
        await savePoints(activeTrace, frameNumber, newPoints);
        onPointsSaved?.();
      } catch (e) {
        console.error("savePoints failed", e);
      }
    },
    [activeTrace, frameNumber, onPointsSaved],
  );

  // Вместо сложного эффекта, мы оставим явные вызовы savePoints внутри undo/redo,
  // но для этого нужно иметь актуальный historyState. Мы можем сохранять его в реф.
  const historyStateRef = useRef(historyState);
  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  const undoWithSave = () => {
    const state = historyStateRef.current;
    if (state.index <= 0) return;
    const newIndex = state.index - 1;
    const newPoints = state.entries[newIndex].points;
    dispatch({ type: "UNDO" });
    setSelectedIndices(new Set());
    setSelectionFrozen(false);
    markLocalSave();
    persistPoints(newPoints);
  };

  const redoWithSave = () => {
    const state = historyStateRef.current;
    if (state.index >= state.entries.length - 1) return;
    const newIndex = state.index + 1;
    const newPoints = state.entries[newIndex].points;
    dispatch({ type: "REDO" });
    setSelectedIndices(new Set());
    setSelectionFrozen(false);
    markLocalSave();
    persistPoints(newPoints);
  };

  // --- Клавиатура ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === " " && !e.repeat) {
        isSpaceDown.current = true;
        e.preventDefault();
      }

      // Удаление
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedIndices.size > 0 &&
        activeTrace
      ) {
        const currentPoints = pointsRef.current;
        const newPoints = currentPoints.filter(
          (_, i) => !selectedIndices.has(i),
        );
        dispatch({ type: "PUSH", payload: newPoints });
        setSelectedIndices(new Set());
        setSelectionFrozen(false);
        markLocalSave();
        persistPoints(newPoints);
      }

      // Отмена / повтор
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoWithSave();
        else undoWithSave();
      }

      // Копировать
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (selectedIndices.size > 0) {
          const currentPoints = pointsRef.current;
          const selectedPts = [];
          selectedIndices.forEach((i) => {
            if (i < currentPoints.length)
              selectedPts.push({ ...currentPoints[i] });
          });
          clipboardRef.current = selectedPts;
          e.preventDefault();
        }
      }

      // Вставить
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (
          clipboardRef.current &&
          clipboardRef.current.length > 0 &&
          activeTrace
        ) {
          const currentPoints = pointsRef.current;
          const newPoints = [...currentPoints, ...clipboardRef.current];
          dispatch({ type: "PUSH", payload: newPoints });
          setSelectedIndices(new Set());
          setSelectionFrozen(false);
          markLocalSave();
          persistPoints(newPoints);
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === " ") isSpaceDown.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    selectedIndices,
    activeTrace,
    frameNumber,
    persistPoints,
    undoWithSave,
    redoWithSave,
  ]);

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

  // Проверка, не находится ли указатель над существующей точкой
  const isOverPoint = useCallback(
    (pointerPos) => {
      const stage = stageRef.current;
      if (!stage || !image) return false;
      const baseScale = Math.min(
        stage.width() / image.width,
        stage.height() / image.height,
      );
      const transform = stage.getAbsoluteTransform().copy().invert();
      const worldPos = transform.point(pointerPos);
      const currentPoints = pointsRef.current;
      return currentPoints.some((point) => {
        const cx = point.x * image.width * baseScale;
        const cy = point.y * image.height * baseScale;
        return Math.hypot(worldPos.x - cx, worldPos.y - cy) < 12;
      });
    },
    [image],
  );

  // Добавление одной точки (для клика) – используется и в одиночных кликах
  const addSinglePoint = useCallback(
    (pointerPos) => {
      if (!activeTrace || !image) return;
      const rel = getRelativeCoords(pointerPos);
      if (!rel) return;
      const stage = stageRef.current;
      const baseScale = Math.min(
        stage.width() / image.width,
        stage.height() / image.height,
      );
      const minDistRel = 12 / (image.width * baseScale);
      const currentPoints = pointsRef.current;
      const tooClose = currentPoints.some(
        (p) => Math.hypot(p.x - rel.x, p.y - rel.y) < minDistRel,
      );
      if (tooClose) return;
      const newPoints = [...currentPoints, { x: rel.x, y: rel.y }];
      dispatch({ type: "PUSH", payload: newPoints });
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
      markLocalSave();
      persistPoints(newPoints);
    },
    [activeTrace, image, getRelativeCoords, persistPoints],
  );

  // --- Stage mouse handlers ---
  const handleStageMouseDown = useCallback(() => {
    const stage = stageRef.current;
    const pointerPos = stage.getPointerPosition();
    if (isOverPoint(pointerPos)) return;

    mouseDownPos.current = { x: pointerPos.x, y: pointerPos.y };
    gestureStarted.current = false;
    drawBufferRef.current = []; // сброс буфера рисования
    setDraftPoints([]); // <-- очищаем визуальный черновик
  }, [isOverPoint]);

  const handleStageMouseMove = useCallback(
    (e) => {
      if (!mouseDownPos.current) return;
      const stage = stageRef.current;
      const pointerPos = stage.getPointerPosition();
      const dx = pointerPos.x - mouseDownPos.current.x;
      const dy = pointerPos.y - mouseDownPos.current.y;
      if (!gestureStarted.current && Math.hypot(dx, dy) < CLICK_DIST_THRESHOLD)
        return;
      gestureStarted.current = true;

      const shouldPan = isSpaceDown.current;
      const shouldSelect = !shouldPan && e.evt.shiftKey; // ← из события, не из рефа

      if (shouldPan) {
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
      } else if (shouldSelect) {
        setIsSelecting(true);
        setSelectionRect({
          x1: mouseDownPos.current.x,
          y1: mouseDownPos.current.y,
          x2: pointerPos.x,
          y2: pointerPos.y,
        });
      } else if (activeTrace) {
        // Режим рисования: добавляем точки в буфер
        const rel = getRelativeCoords(pointerPos);
        if (!rel) return;
        const stage = stageRef.current;
        const baseScale = Math.min(
          stage.width() / image.width,
          stage.height() / image.height,
        );
        const minDistRel = 16 / (image.width * baseScale);
        const currentPoints = pointsRef.current;
        const allPoints = [...currentPoints, ...drawBufferRef.current];
        const tooClose = allPoints.some(
          (p) => Math.hypot(p.x - rel.x, p.y - rel.y) < minDistRel,
        );
        if (tooClose) return;
        drawBufferRef.current.push({ x: rel.x, y: rel.y });
        setDraftPoints([...drawBufferRef.current]);
      }
    },
    [isPanning, activeTrace, getRelativeCoords, image],
  );

  const handleStageMouseUp = useCallback(() => {
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

        const currentPoints = pointsRef.current;
        const newSelected = new Set();
        currentPoints.forEach((p, i) => {
          if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
            newSelected.add(i);
        });
        if (newSelected.size > 0) {
          setSelectedIndices(newSelected);
          setSelectionFrozen(true);
        } else {
          setSelectedIndices(new Set());
          setSelectionFrozen(false);
        }
      }
      setSelectionRect(null);
      mouseDownPos.current = null;
      return;
    }

    // Если был жест рисования – применим накопленные точки
    if (gestureStarted.current && drawBufferRef.current.length > 0) {
      const currentPoints = pointsRef.current;
      const newPoints = [...currentPoints, ...drawBufferRef.current];
      dispatch({ type: "PUSH", payload: newPoints });
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
      markLocalSave();
      persistPoints(newPoints);
      drawBufferRef.current = [];
      setDraftPoints([]);
    } else if (!gestureStarted.current && mouseDownPos.current) {
      // Одиночный клик без перетаскивания
      setSelectedIndices(new Set());
      setSelectionFrozen(false);
      addSinglePoint(stageRef.current.getPointerPosition());
    }
    mouseDownPos.current = null;
  }, [
    isPanning,
    isSelecting,
    selectionRect,
    image,
    addSinglePoint,
    persistPoints,
  ]);

  // --- Обработчики точек (существующие) ---
  const handlePointClick = useCallback((index, e) => {
    if (pointDragged.current) {
      pointDragged.current = false;
      return;
    }
    e.cancelBubble = true;
    if (e.evt.shiftKey) {
      setSelectedIndices((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectionFrozen(newSet.size > 0);
        return newSet;
      });
    } else {
      setSelectedIndices(new Set([index]));
      setSelectionFrozen(true);
    }
  }, []);

  const handlePointDragStart = useCallback(
    (index, e) => {
      e.cancelBubble = true;
      pointDragged.current = false;
      mouseDownPos.current = null;
      thawSelection();
      if (!selectedIndices.has(index)) setSelectedIndices(new Set([index]));
    },
    [selectedIndices],
  );

  const handlePointDragMove = useCallback(
    (index, e) => {
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
      const origPoint = pointsRef.current[index];
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
        const p = pointsRef.current[gIndex];
        g.x(p.x * image.width * baseScale + deltaX);
        g.y(p.y * image.height * baseScale + deltaY);
      });
    },
    [selectedIndices, image, stageScale, stageX, stageY],
  );

  const handlePointDragEnd = useCallback(
    (index, e) => {
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
      const currentPoints = pointsRef.current;
      const origPoint = currentPoints[index];
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
        newPoints = currentPoints.map((p, i) =>
          selectedIndices.has(i)
            ? { x: p.x + deltaRelX, y: p.y + deltaRelY }
            : p,
        );
      } else {
        newPoints = currentPoints.map((p, i) =>
          i === index
            ? {
                x: draggedWorld.x / (image.width * baseScale),
                y: draggedWorld.y / (image.height * baseScale),
              }
            : p,
        );
      }

      // Перемещаем группы визуально
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

      // Сохраняем только если координаты реально изменились
      if (JSON.stringify(newPoints) !== JSON.stringify(currentPoints)) {
        dispatch({ type: "PUSH", payload: newPoints });
        markLocalSave();
        persistPoints(newPoints);
      }
    },
    [selectedIndices, image, stageScale, stageX, stageY, persistPoints],
  );

  // --- Зум ---
  const handleWheel = useCallback((e) => {
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
  }, []);

  const resetZoom = useCallback(() => {
    setStageScale(1);
    setStageX(0);
    setStageY(0);
  }, []);

  if (!image) return <div>No frame loaded</div>;

  const baseScale = Math.min(
    stageSize.width / image.width,
    stageSize.height / image.height,
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
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", gap: "4px", padding: "4px" }}>
        <button onClick={undoWithSave} title="Undo (Ctrl+Z)">
          ↩️
        </button>
        <button onClick={redoWithSave} title="Redo (Ctrl+Shift+Z)">
          ↪️
        </button>
        <button onClick={handleAutoTrace} title="Auto-trace">
          🤖
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
        <span style={{ color: "#888", margin: "0 8px", fontSize: "12px" }}>
          Space+drag: pan · Shift+drag: select · drag: draw
        </span>
      </div>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          lineHeight: 0,
          flex: 1,
          width: "100%",
          minHeight: 0,
        }}
      >
        <Stage
          width={stageSize.width}
          height={stageSize.height}
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
            {/* НОВОЕ: черновые точки, которые видны во время drag-рисования */}
            {draftPoints.map((point, idx) => {
              const cx = point.x * image.width * baseScale;
              const cy = point.y * image.height * baseScale;
              const size = 7;
              return (
                <Group key={`draft-${idx}`} x={cx} y={cy}>
                  <Line
                    points={[-size, 0, size, 0]}
                    stroke={color}
                    strokeWidth={1.5}
                    listening={false}
                  />
                  <Line
                    points={[0, -size, 0, size]}
                    stroke={color}
                    strokeWidth={1.5}
                    listening={false}
                  />
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
