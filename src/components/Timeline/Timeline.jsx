import {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import AudioPlayer from "./AudioPlayer";
import TimelineBar from "./TimelineBar";
import TextGridTiers from "./TextGridTiers";
import SpectrogramView from "./SpectrogramView";

const TG_ZOOM_FACTOR = 1.5;

const getFrameAtTime = (time, frameTimes) => {
  if (!frameTimes || frameTimes.length === 0) return 1;
  let start = 0;
  let end = frameTimes.length - 1;
  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    if (frameTimes[mid] === time) return mid + 1;
    if (frameTimes[mid] < time) start = mid + 1;
    else end = mid - 1;
  }
  return Math.min(start + 1, frameTimes.length);
};

const Timeline = forwardRef(
  ({ frame, setFrame, frameTimes, spectrogramParams }, ref) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    // ── Состояние окна просмотра ──────────────────────────────────────────
    // null означает "показывать всё"
    const [viewStart, setViewStart] = useState(null);
    const [viewEnd, setViewEnd] = useState(null);

    // selectedInterval — интервал, выделенный кликом в TextGridTiers
    // формат: { start: number, end: number } | null
    const [selectedInterval, setSelectedInterval] = useState(null);

    const audioRef = useRef(null);
    const offsetPanelRef = useRef(null);
    const currentFrameRef = useRef(frame);

    useEffect(() => {
      currentFrameRef.current = frame;
    }, [frame]);

    // ── Вспомогательные геттеры ───────────────────────────────────────────
    const effectiveStart = viewStart ?? 0;
    const effectiveEnd = viewEnd ?? duration;

    // Clamp — не выходим за границы аудио
    const clampView = useCallback(
      (start, end) => {
        const len = end - start;
        let s = Math.max(0, start);
        let e = Math.min(duration || 1, end);
        // если сдвинули у края — сохраняем длину окна
        if (s === 0) e = Math.min(duration || 1, len);
        if (e === (duration || 1)) s = Math.max(0, (duration || 1) - len);
        return [s, e];
      },
      [duration],
    );

    // ── Zoom-команды (аналог getBounds из оригинала) ──────────────────────
    const zoomIn = useCallback(() => {
      const a = effectiveEnd - effectiveStart;
      const zoomOut = (a - a / TG_ZOOM_FACTOR) / 2;
      const [s, e] = clampView(
        effectiveStart + zoomOut,
        effectiveEnd - zoomOut,
      );
      setViewStart(s);
      setViewEnd(e);
    }, [effectiveStart, effectiveEnd, clampView]);

    const zoomOut = useCallback(() => {
      const a = effectiveEnd - effectiveStart;
      const zoomIn = (TG_ZOOM_FACTOR * a - a) / 2;
      const [s, e] = clampView(effectiveStart - zoomIn, effectiveEnd + zoomIn);
      setViewStart(s);
      setViewEnd(e);
    }, [effectiveStart, effectiveEnd, clampView]);

    const zoomAll = useCallback(() => {
      setViewStart(null);
      setViewEnd(null);
    }, []);

    const zoomToSelection = useCallback(() => {
      if (!selectedInterval) return;
      const intervalDuration = selectedInterval.end - selectedInterval.start;
      // Добавляем 10% отступ с каждой стороны
      const padding = intervalDuration * 10;
      const [s, e] = clampView(
        selectedInterval.start - padding,
        selectedInterval.end + padding,
      );
      setViewStart(s);
      setViewEnd(e);
    }, [selectedInterval, clampView]);

    // Сдвиг влево/вправо (Shift+Arrow — как в оригинале)
    const panLeft = useCallback(() => {
      const a = effectiveEnd - effectiveStart;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [s, e] = clampView(effectiveStart - step, effectiveEnd - step);
      setViewStart(s);
      setViewEnd(e);
    }, [effectiveStart, effectiveEnd, clampView]);

    const panRight = useCallback(() => {
      const a = effectiveEnd - effectiveStart;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [s, e] = clampView(effectiveStart + step, effectiveEnd + step);
      setViewStart(s);
      setViewEnd(e);
    }, [effectiveStart, effectiveEnd, clampView]);

    // ── Клавиатурные биндинги ─────────────────────────────────────────────
    useEffect(() => {
      const onKeyDown = (e) => {
        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && ["i", "o", "a", "e"].includes(e.key)) {
          e.preventDefault();
        }

        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable
        )
          return;

        if (ctrl && e.key === "i") zoomIn();
        if (ctrl && e.key === "o") zoomOut();
        if (ctrl && e.key === "a") zoomAll();
        if (ctrl && e.key === "b") zoomToSelection();

        if (e.shiftKey && e.key === "ArrowLeft") {
          e.preventDefault();
          panLeft();
        }
        if (e.shiftKey && e.key === "ArrowRight") {
          e.preventDefault();
          panRight();
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [zoomIn, zoomOut, zoomAll, zoomToSelection, panLeft, panRight]);

    // ── Остальные обработчики (без изменений) ─────────────────────────────
    const handleTimeUpdate = useCallback(
      (time) => {
        setCurrentTime(time);
        const calcFrame = getFrameAtTime(time, frameTimes);
        if (calcFrame !== currentFrameRef.current) {
          currentFrameRef.current = calcFrame;
          setFrame(calcFrame);
        }
      },
      [frameTimes, setFrame],
    );

    const handleSeek = useCallback(
      (time) => {
        if (audioRef.current) audioRef.current.seek(time);
        setCurrentTime(time);
        const calcFrame = getFrameAtTime(time, frameTimes);
        currentFrameRef.current = calcFrame;
        setFrame(calcFrame);
      },
      [frameTimes, setFrame],
    );

    const handleSelectInterval = useCallback(
      (interval) => {
        setSelectedInterval(interval); // запоминаем для Ctrl+N
        handleSeek(interval.start);
      },
      [handleSeek],
    );

    useImperativeHandle(
      ref,
      () => ({
        seekToFrame: (targetFrame) => {
          if (!frameTimes?.length || !audioRef.current) return;
          const idx = targetFrame - 1;
          if (idx >= 0 && idx < frameTimes.length) {
            const time = frameTimes[idx];
            audioRef.current.seek(time);
            setCurrentTime(time);
            currentFrameRef.current = targetFrame;
          }
        },
        isPlaying: () => isPlaying,
        // Экспортируем zoom-функции, если понадобятся снаружи
        zoomIn,
        zoomOut,
        zoomAll,
        zoomToSelection,
      }),
      [frameTimes, isPlaying, zoomIn, zoomOut, zoomAll, zoomToSelection],
    );

    const updateTimeFromMouse = useCallback(
      (e) => {
        const panel = offsetPanelRef.current;
        if (!panel || !duration) return;
        const rect = panel.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        // Учитываем видимый диапазон
        const newTime =
          effectiveStart + ratio * (effectiveEnd - effectiveStart);
        setCurrentTime(newTime);
        const calcFrame = getFrameAtTime(newTime, frameTimes);
        if (calcFrame !== currentFrameRef.current) {
          currentFrameRef.current = calcFrame;
          setFrame(calcFrame);
        }
      },
      [duration, frameTimes, setFrame, effectiveStart, effectiveEnd],
    );

    const handleMouseDownOnOffset = (e) => {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      e.preventDefault();
      setIsDragging(true);
      updateTimeFromMouse(e);
    };

    const handleMouseMove = useCallback(
      (e) => {
        if (isDragging) updateTimeFromMouse(e);
      },
      [isDragging, updateTimeFromMouse],
    );

    const handleMouseUp = useCallback(() => {
      if (isDragging && audioRef.current) audioRef.current.seek(currentTime);
      setIsDragging(false);
    }, [isDragging, currentTime]);

    useEffect(() => {
      if (isDragging) {
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      }
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    const handlePlayStateChange = useCallback((playing) => {
      setIsPlaying(playing);
    }, []);

    // Позиция курсора в координатах текущего окна (для красной линии)
    const cursorRatio =
      effectiveEnd > effectiveStart
        ? (currentTime - effectiveStart) / (effectiveEnd - effectiveStart)
        : 0;
    const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

    return (
      <div
        style={{
          background: "#fafafa",
          borderTop: "2px solid #ccc",
          maxHeight: "40vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Кнопки зума */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "4px 8px 0",
            fontSize: "11px",
          }}
        >
          {[
            { label: "Zoom In (Ctrl+I)", action: zoomIn },
            { label: "Zoom Out (Ctrl+O)", action: zoomOut },
            { label: "Zoom All (Ctrl+A)", action: zoomAll },
            { label: "Zoom Select (Ctrl+B)", action: zoomToSelection },
            { label: "◀ (Shift+←)", action: panLeft },
            { label: "▶ (Shift+→)", action: panRight },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              title={label}
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                cursor: "pointer",
                background: "#e8e8e8",
                border: "1px solid #bbb",
                borderRadius: "3px",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "0 8px 8px 8px" }}>
          <SpectrogramView
            duration={duration}
            currentTime={currentTime}
            spectrogramParams={spectrogramParams}
            viewStart={effectiveStart}
            viewEnd={effectiveEnd}
          />
        </div>
        <div style={{ padding: "8px", paddingBottom: 0 }}>
          <AudioPlayer
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onDurationLoaded={setDuration}
            onPlayStateChange={handlePlayStateChange}
          />
          <TimelineBar
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            frameTimes={frameTimes}
            onFrameChange={setFrame}
            viewStart={effectiveStart}
            viewEnd={effectiveEnd}
          />
          <TextGridTiers
            currentTime={currentTime}
            duration={duration}
            onSelectInterval={handleSelectInterval}
            viewStart={effectiveStart}
            viewEnd={effectiveEnd}
          />

          {/* Полоска-скруббер с учётом окна просмотра */}
          <div
            ref={offsetPanelRef}
            onMouseDown={handleMouseDownOnOffset}
            style={{
              marginTop: "8px",
              marginBottom: "4px",
              position: "relative",
              cursor: isDragging ? "grabbing" : "ew-resize",
              height: "14px",
              background: "#e0e0e0",
              borderRadius: "2px",
            }}
          >
            {/* Серая подложка показывает, какая часть аудио сейчас видна */}
            {duration > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(effectiveStart / duration) * 100}%`,
                  right: `${((duration - effectiveEnd) / duration) * 100}%`,
                  background: "rgba(100,150,255,0.18)",
                  borderRadius: "2px",
                  pointerEvents: "none",
                }}
              />
            )}
            {duration > 0 && cursorVisible && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${cursorRatio * 100}%`,
                  width: "1px",
                  background: "red",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

export default Timeline;
