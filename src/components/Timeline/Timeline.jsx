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
import { getAudioSegmentUrl } from "../../api/client";

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
    const [viewStart, setViewStart] = useState(null);
    const [viewEnd, setViewEnd] = useState(null);
    const [selectedInterval, setSelectedInterval] = useState(null);

    const audioRef = useRef(null);
    const offsetPanelRef = useRef(null);
    const currentFrameRef = useRef(frame);
    const playingSelectionRef = useRef(false);
    const stopCheckRef = useRef(null);

    useEffect(() => {
      currentFrameRef.current = frame;
    }, [frame]);

    const effStart = viewStart ?? 0;
    const effEnd = viewEnd ?? duration;

    const clampView = useCallback(
      (start, end) => {
        const len = end - start;
        let s = Math.max(0, start);
        let e = Math.min(duration || 1, end);
        if (s === 0) e = Math.min(duration || 1, len);
        if (e === (duration || 1)) s = Math.max(0, (duration || 1) - len);
        return [s, e];
      },
      [duration],
    );

    // ── Zoom ─────────────────────────────────────────────────────────────
    const zoomIn = useCallback(() => {
      const a = effEnd - effStart;
      const delta = (a - a / TG_ZOOM_FACTOR) / 2;
      const [s, e] = clampView(effStart + delta, effEnd - delta);
      setViewStart(s);
      setViewEnd(e);
    }, [effStart, effEnd, clampView]);

    const zoomOut = useCallback(() => {
      const a = effEnd - effStart;
      const delta = (TG_ZOOM_FACTOR * a - a) / 2;
      const [s, e] = clampView(effStart - delta, effEnd + delta);
      setViewStart(s);
      setViewEnd(e);
    }, [effStart, effEnd, clampView]);

    const zoomAll = useCallback(() => {
      setViewStart(null);
      setViewEnd(null);
    }, []);

    const zoomToSelection = useCallback(() => {
      if (!selectedInterval) return;
      const intervalDuration = selectedInterval.end - selectedInterval.start;
      const padding = intervalDuration * 0.1;
      const [s, e] = clampView(
        selectedInterval.start - padding,
        selectedInterval.end + padding,
      );
      setViewStart(s);
      setViewEnd(e);
    }, [selectedInterval, clampView]);

    const panLeft = useCallback(() => {
      const a = effEnd - effStart;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [s, e] = clampView(effStart - step, effEnd - step);
      setViewStart(s);
      setViewEnd(e);
    }, [effStart, effEnd, clampView]);

    const panRight = useCallback(() => {
      const a = effEnd - effStart;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [s, e] = clampView(effStart + step, effEnd + step);
      setViewStart(s);
      setViewEnd(e);
    }, [effStart, effEnd, clampView]);

    // ── Play selection ────────────────────────────────────────────────────
    const stopSelection = useCallback(() => {
      if (stopCheckRef.current) {
        clearTimeout(stopCheckRef.current);
        stopCheckRef.current = null;
      }
      playingSelectionRef.current = false;
      audioRef.current?.pause();
    }, []);

    const playInterval = useCallback((interval) => {
      if (!audioRef.current || !interval) return;
      if (stopCheckRef.current) {
        clearTimeout(stopCheckRef.current);
        stopCheckRef.current = null;
      }
      const url = getAudioSegmentUrl(interval.start, interval.end);
      // Передаём offset чтобы таймер показывал абсолютное время
      audioRef.current.playSegmentUrl(url, interval.start);
      playingSelectionRef.current = true;
    }, []);

    const handlePlaySelection = useCallback(() => {
      if (!selectedInterval) return;
      if (playingSelectionRef.current) {
        stopSelection();
        return;
      }
      playInterval(selectedInterval);
    }, [selectedInterval, stopSelection, playInterval]);

    useEffect(() => {
      return () => {
        if (stopCheckRef.current) clearTimeout(stopCheckRef.current);
      };
    }, []);

    // ── Клавиатура ────────────────────────────────────────────────────────
    useEffect(() => {
      const onKeyDown = (e) => {
        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && ["i", "o", "a", "b"].includes(e.key)) {
          e.preventDefault();
        }
        if (e.key === " " && selectedInterval) {
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

        if (e.key === " ") {
          if (selectedInterval) handlePlaySelection();
        }

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
    }, [
      zoomIn,
      zoomOut,
      zoomAll,
      zoomToSelection,
      panLeft,
      panRight,
      handlePlaySelection,
      selectedInterval,
    ]);

    // ── Обработчики ───────────────────────────────────────────────────────
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
        setSelectedInterval(interval);
        handleSeek(interval.start);
      },
      [handleSeek],
    );

    const handleStop = useCallback(() => {
      setSelectedInterval(null);
      if (stopCheckRef.current) {
        clearTimeout(stopCheckRef.current);
        stopCheckRef.current = null;
      }
      playingSelectionRef.current = false;
    }, []);

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
        const newTime = effStart + ratio * (effEnd - effStart);
        setCurrentTime(newTime);
        const calcFrame = getFrameAtTime(newTime, frameTimes);
        if (calcFrame !== currentFrameRef.current) {
          currentFrameRef.current = calcFrame;
          setFrame(calcFrame);
        }
      },
      [duration, frameTimes, setFrame, effStart, effEnd],
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
      if (!playing) playingSelectionRef.current = false;
    }, []);

    const cursorRatio =
      effEnd > effStart ? (currentTime - effStart) / (effEnd - effStart) : 0;
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
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "4px 8px 0",
            flexWrap: "wrap",
          }}
        >
          {[
            { label: "Zoom In (Ctrl+I)", action: zoomIn },
            { label: "Zoom Out (Ctrl+O)", action: zoomOut },
            { label: "Zoom All (Ctrl+A)", action: zoomAll },
            { label: "Zoom Select (Ctrl+B)", action: zoomToSelection },
            { label: "◀ (Shift+←)", action: panLeft },
            { label: "▶ (Shift+→)", action: panRight },
            {
              label: selectedInterval ? "▶ Selection (Space)" : "▶ Selection",
              action: handlePlaySelection,
              disabled: !selectedInterval,
            },
          ].map(({ label, action, disabled }) => (
            <button
              key={label}
              onClick={action}
              disabled={disabled}
              title={label}
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                cursor: disabled ? "default" : "pointer",
                background: "#e8e8e8",
                border: "1px solid #bbb",
                borderRadius: "3px",
                opacity: disabled ? 0.5 : 1,
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
            viewStart={effStart}
            viewEnd={effEnd}
          />
        </div>
        <div style={{ padding: "8px", paddingBottom: 0 }}>
          <AudioPlayer
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onDurationLoaded={setDuration}
            onPlayStateChange={handlePlayStateChange}
            onStop={handleStop}
            onPlay={() => {
              if (selectedInterval) playInterval(selectedInterval);
            }}
            isPlayingExternal={isPlaying}
          />
          <TimelineBar
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            frameTimes={frameTimes}
            onFrameChange={setFrame}
            viewStart={effStart}
            viewEnd={effEnd}
          />
          <TextGridTiers
            currentTime={currentTime}
            duration={duration}
            onSelectInterval={handleSelectInterval}
            viewStart={effStart}
            viewEnd={effEnd}
            selectedInterval={selectedInterval}
          />

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
            {duration > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(effStart / duration) * 100}%`,
                  right: `${((duration - effEnd) / duration) * 100}%`,
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
