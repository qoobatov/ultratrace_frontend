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

const FrameCanvas = ({
  frameNumber,
  activeTrace,
  traceColor,
  pointsVersion,
}) => {
  const [image, setImage] = useState(null);
  const [points, setPoints] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const stageRef = useRef(null);
  const imageRef = useRef(null);
  const imageCache = useRef(new Map());
  const isShiftDown = useRef(false);

  // Состояния для зума и панорамирования
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // Загрузка изображения
  const loadImage = useCallback((frameNum) => {
    if (imageCache.current.has(frameNum)) {
      return Promise.resolve(imageCache.current.get(frameNum));
    }
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
    const nextFrame = frameNumber + 1;
    loadImage(nextFrame).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [frameNumber, loadImage]);

  // Загрузка точек и сброс истории
  useEffect(() => {
    if (!activeTrace || !frameNumber) return;
    const fetchPoints = async () => {
      try {
        const pts = await getPoints(activeTrace, frameNumber);
        setPoints(pts || []);
        setSelectedIndices(new Set());
        setHistory([{ points: pts || [] }]);
        setHistoryIndex(0);
      } catch (err) {
        console.error("Failed to fetch points", err);
        setPoints([]);
      }
    };
    fetchPoints();
  }, [activeTrace, frameNumber, pointsVersion]);

  // История
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
    }
  };

  // Клавиатура
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

  // Преобразование координат из сцены в относительные (0..1) на изображении
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
      const x = canvasPos.x / (image.width * scale);
      const y = canvasPos.y / (image.height * scale);
      return { x, y };
    },
    [image],
  );

  // Основной обработчик клика по сцене
  const handleStageClick = (e) => {
    const stage = stageRef.current;
    if (!stage) return;

    // Проверяем, попал ли клик в какую-либо точку (Group с data-index)
    const clickedGroup = e.target.findAncestor(".point-group");
    if (clickedGroup) {
      const index = parseInt(clickedGroup.attrs["data-index"], 10);
      if (!isNaN(index)) {
        // Выделение точки (с Shift или без)
        if (isShiftDown.current) {
          setSelectedIndices((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(index)) newSet.delete(index);
            else newSet.add(index);
            return newSet;
          });
        } else {
          setSelectedIndices(new Set([index]));
        }
        return; // не добавляем новую точку
      }
    }

    // Иначе добавление новой точки (клик по фону или изображению)
    if (e.target !== stageRef.current && e.target !== imageRef.current) return;
    if (!activeTrace || !image) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    const rel = getRelativeCoords(pointerPos);
    if (!rel) return;

    // Проверка минимального расстояния до существующих точек
    const minDistRel =
      12 /
      (image.width *
        Math.min(stage.width() / image.width, stage.height() / image.height));
    const tooClose = points.some(
      (p) => Math.hypot(p.x - rel.x, p.y - rel.y) < minDistRel,
    );
    if (tooClose) return;

    const newPoints = [...points, { x: rel.x, y: rel.y }];
    setPoints(newPoints);
    savePoints(activeTrace, frameNumber, newPoints);
    pushHistory(newPoints);
  };

  // Перетаскивание точки (или группы)
  const handleDragEnd = (index, e) => {
    const stage = stageRef.current;
    if (!stage || !image) return;
    const group = e.target;
    const groupPos = group.getAbsolutePosition();
    const rel = getRelativeCoords(groupPos);
    if (!rel) return;
    const newX = rel.x;
    const newY = rel.y;

    let newPoints;
    if (selectedIndices.has(index)) {
      const oldPoint = points[index];
      const dx = newX - oldPoint.x;
      const dy = newY - oldPoint.y;
      newPoints = points.map((p, i) => {
        if (selectedIndices.has(i)) {
          return { x: p.x + dx, y: p.y + dy };
        }
        return p;
      });
    } else {
      newPoints = points.map((p, i) =>
        i === index ? { x: newX, y: newY } : p,
      );
    }
    setPoints(newPoints);
    savePoints(activeTrace, frameNumber, newPoints);
    pushHistory(newPoints);
  };

  // Зум колесом
  const handleWheel = (e) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? 1 : -1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    const newX = pointer.x - mousePointTo.x * clampedScale;
    const newY = pointer.y - mousePointTo.y * clampedScale;

    setStageScale(clampedScale);
    setStageX(newX);
    setStageY(newY);
  };

  // Панорамирование – только при stageScale > 1
  const handleMouseDown = (e) => {
    if (stageScale <= 1) return;
    if (e.target === stageRef.current || e.target === imageRef.current) {
      setIsPanning(true);
      const pos = stageRef.current.getPointerPosition();
      lastPointer.current = { x: pos.x, y: pos.y };
    }
  };

  const handleMouseMove = () => {
    if (!isPanning || stageScale <= 1) return;
    const pos = stageRef.current.getPointerPosition();
    const dx = pos.x - lastPointer.current.x;
    const dy = pos.y - lastPointer.current.y;
    lastPointer.current = { x: pos.x, y: pos.y };
    setStageX((prev) => prev + dx);
    setStageY((prev) => prev + dy);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Сброс зума
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
          onClick={() =>
            setStageScale((prev) => Math.min(MAX_SCALE, prev * 1.1))
          }
        >
          🔍+
        </button>
        <button
          onClick={() =>
            setStageScale((prev) => Math.max(MIN_SCALE, prev / 1.1))
          }
        >
          🔍−
        </button>
        <button onClick={resetZoom}>Reset</button>
      </div>
      <Stage
        width={stageWidth}
        height={stageHeight}
        ref={stageRef}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stageX}
        y={stageY}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMousemove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning && stageScale > 1 ? "grabbing" : "default" }}
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
            const size = 7; // чуть больше
            return (
              <Group
                key={i}
                x={cx}
                y={cy}
                draggable
                onDragEnd={(e) => handleDragEnd(i, e)}
                name="point-group"
                data-index={i}
              >
                <Line
                  points={[-size, 0, size, 0]}
                  stroke={isSelected ? "yellow" : color}
                  strokeWidth={1.5}
                  listening={false}
                />
                <Line
                  points={[0, -size, 0, size]}
                  stroke={isSelected ? "yellow" : color}
                  strokeWidth={1.5}
                  listening={false}
                />
                <Circle radius={10} fill="transparent" listening={false} />
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
};

export default FrameCanvas;
