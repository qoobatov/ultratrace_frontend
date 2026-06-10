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
import "./Timeline.css";

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
    const overviewRef = useRef(null);
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
        if (ctrl && ["i", "o", "a", "b"].includes(e.key)) e.preventDefault();
        if (e.key === " " && selectedInterval) e.preventDefault();

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
        if (e.key === " " && selectedInterval) handlePlaySelection();
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

    // ── Overview scrubber (mini map) ──────────────────────────────────────
    const handleOverviewClick = useCallback(
      (e) => {
        const el = overviewRef.current;
        if (!el || !duration) return;
        const rect = el.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        const time = ratio * duration;
        handleSeek(time);
        // Центрируем окно на кликнутом месте
        const viewLen = effEnd - effStart;
        const [s, e2] = clampView(time - viewLen / 2, time + viewLen / 2);
        setViewStart(s);
        setViewEnd(e2);
      },
      [duration, effStart, effEnd, clampView, handleSeek],
    );

    const handlePlayStateChange = useCallback((playing) => {
      setIsPlaying(playing);
      if (!playing) playingSelectionRef.current = false;
    }, []);

    const cursorRatio =
      effEnd > effStart ? (currentTime - effStart) / (effEnd - effStart) : 0;
    const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

    // Toolbar buttons config
    const toolbarButtons = [
      {
        label: "−",
        title: "Zoom In (Ctrl+I)",
        action: zoomIn,
        cls: "tl-btn tl-btn-icon",
      },
      {
        label: "+",
        title: "Zoom Out (Ctrl+O)",
        action: zoomOut,
        cls: "tl-btn tl-btn-icon",
      },
      {
        label: "⊡",
        title: "Zoom All (Ctrl+A)",
        action: zoomAll,
        cls: "tl-btn tl-btn-icon",
      },
      {
        label: "⊞",
        title: "Zoom Select (Ctrl+B)",
        action: zoomToSelection,
        cls: "tl-btn tl-btn-icon",
      },
      {
        label: "‹",
        title: "Pan Left (Shift+←)",
        action: panLeft,
        cls: "tl-btn tl-btn-icon",
      },
      {
        label: "›",
        title: "Pan Right (Shift+→)",
        action: panRight,
        cls: "tl-btn tl-btn-icon",
      },
    ];

    return (
      <div className="timeline">
        {/* ── Toolbar ── */}
        <div className="timeline-toolbar">
          {toolbarButtons.map(({ label, title, action, cls }) => (
            <button key={title} className={cls} onClick={action} title={title}>
              {label}
            </button>
          ))}

          <div className="tl-divider" />

          <button
            className={`tl-btn${selectedInterval ? " active" : ""}`}
            onClick={handlePlaySelection}
            disabled={!selectedInterval}
            title="Play selection (Space)"
          >
            ▶ Selection
          </button>
        </div>

        {/* ── Spectrogram ── */}
        <div className="timeline-spectrogram">
          <SpectrogramView
            duration={duration}
            currentTime={currentTime}
            spectrogramParams={spectrogramParams}
            viewStart={effStart}
            viewEnd={effEnd}
          />
        </div>

        {/* ── Player + scrubber ── */}
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

        {/* ── TimelineBar ── */}
        {/* <TimelineBar
          duration={duration}
          currentTime={currentTime}
          onSeek={handleSeek}
          frameTimes={frameTimes}
          onFrameChange={setFrame}
          viewStart={effStart}
          viewEnd={effEnd}
        /> */}

        {/* ── TextGrid tiers ── */}
        <div className="timeline-tiers">
          <TextGridTiers
            currentTime={currentTime}
            duration={duration}
            onSelectInterval={handleSelectInterval}
            viewStart={effStart}
            viewEnd={effEnd}
            selectedInterval={selectedInterval}
          />
        </div>

        {/* ── Overview minimap ── */}
        <div
          className="timeline-overview"
          ref={overviewRef}
          onClick={handleOverviewClick}
        >
          {duration > 0 && (
            <div
              className="timeline-overview-window"
              style={{
                left: `${(effStart / duration) * 100}%`,
                right: `${((duration - effEnd) / duration) * 100}%`,
              }}
            />
          )}
          {duration > 0 && (
            <div
              className="timeline-overview-cursor"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
          )}
        </div>
      </div>
    );
  },
);

export default Timeline;
