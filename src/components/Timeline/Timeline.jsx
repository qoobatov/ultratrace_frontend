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

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
};

const Timeline = forwardRef(
  ({ frame, setFrame, frameTimes, spectrogramParams }, ref) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [viewStart, setViewStart] = useState(null);
    const [viewEnd, setViewEnd] = useState(null);
    const [selectedInterval, setSelectedInterval] = useState(null);
    const [playMode, setPlayMode] = useState(null); // null | 'all' | 'selection'

    const audioRef = useRef(null);
    const overviewRef = useRef(null);
    const currentFrameRef = useRef(frame);
    const playingSelectionRef = useRef(false);
    const stopCheckRef = useRef(null);

    // Рефы для актуальных значений без пересоздания колбэков
    const durationRef = useRef(duration);
    const effStartRef = useRef(0);
    const effEndRef = useRef(0);
    const selectedIntervalRef = useRef(selectedInterval);

    useEffect(() => {
      durationRef.current = duration;
    }, [duration]);
    useEffect(() => {
      selectedIntervalRef.current = selectedInterval;
    }, [selectedInterval]);
    useEffect(() => {
      currentFrameRef.current = frame;
    }, [frame]);

    const effStart = viewStart ?? 0;
    const effEnd = viewEnd ?? duration;

    useEffect(() => {
      effStartRef.current = effStart;
      effEndRef.current = effEnd;
    }, [effStart, effEnd]);

    // ── clampView без зависимостей ────────────────────────────────────────
    const clampView = useCallback((start, end) => {
      const dur = durationRef.current || 1;
      const len = end - start;
      let s = Math.max(0, start);
      let e = Math.min(dur, end);
      if (s === 0) e = Math.min(dur, len);
      if (e === dur) s = Math.max(0, dur - len);
      return [s, e];
    }, []);

    // ── Zoom — читают из рефов, не зависят от effStart/effEnd ────────────
    const zoomIn = useCallback(() => {
      const s = effStartRef.current;
      const e = effEndRef.current;
      const a = e - s;
      const delta = (a - a / TG_ZOOM_FACTOR) / 2;
      const [ns, ne] = clampView(s + delta, e - delta);
      setViewStart(ns);
      setViewEnd(ne);
    }, [clampView]);

    const zoomOut = useCallback(() => {
      const s = effStartRef.current;
      const e = effEndRef.current;
      const a = e - s;
      const delta = (TG_ZOOM_FACTOR * a - a) / 2;
      const [ns, ne] = clampView(s - delta, e + delta);
      setViewStart(ns);
      setViewEnd(ne);
    }, [clampView]);

    const zoomAll = useCallback(() => {
      setViewStart(null);
      setViewEnd(null);
    }, []);

    const zoomToSelection = useCallback(() => {
      const iv = selectedIntervalRef.current;
      if (!iv) return;
      const ivDur = iv.end - iv.start;
      const padding = ivDur * 0.1;
      const [ns, ne] = clampView(iv.start - padding, iv.end + padding);
      setViewStart(ns);
      setViewEnd(ne);
    }, [clampView]);

    const panLeft = useCallback(() => {
      const s = effStartRef.current;
      const e = effEndRef.current;
      const a = e - s;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [ns, ne] = clampView(s - step, e - step);
      setViewStart(ns);
      setViewEnd(ne);
    }, [clampView]);

    const panRight = useCallback(() => {
      const s = effStartRef.current;
      const e = effEndRef.current;
      const a = e - s;
      const step = a / (10 * TG_ZOOM_FACTOR);
      const [ns, ne] = clampView(s + step, e + step);
      setViewStart(ns);
      setViewEnd(ne);
    }, [clampView]);

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

    // ── Play selection ────────────────────────────────────────────────────
    const stopSelection = useCallback(() => {
      if (stopCheckRef.current) {
        clearTimeout(stopCheckRef.current);
        stopCheckRef.current = null;
      }
      playingSelectionRef.current = false;
      audioRef.current?.pause();
    }, []);

    const playInterval = useCallback((interval, startFrom) => {
      if (!audioRef.current || !interval) return;
      if (stopCheckRef.current) {
        clearTimeout(stopCheckRef.current);
        stopCheckRef.current = null;
      }
      const from = startFrom ?? interval.start;
      const url = getAudioSegmentUrl(from, interval.end);
      audioRef.current.playSegmentUrl(url, from);
      playingSelectionRef.current = true;
    }, []);

    const handlePlaySelection = useCallback(() => {
      const iv = selectedIntervalRef.current;
      if (!iv) return;
      if (playMode === "selection") {
        stopSelection();
        handleSeek(iv.start);
        setPlayMode(null);
        return;
      }
      if (playMode === "all") {
        audioRef.current?.pause();
      }

      playInterval(iv, iv.start);
      setPlayMode("selection");
    }, [playMode, stopSelection, playInterval, handleSeek]);

    const handlePlayAll = useCallback(() => {
      if (!audioRef.current) return;
      if (playMode === "all") {
        audioRef.current.pause();
        setPlayMode(null);
      } else {
        if (playMode === "selection") {
          stopSelection();
        }
        audioRef.current.play();
        setPlayMode("all");
      }
    }, [playMode, stopSelection]);

    useEffect(() => {
      return () => {
        if (stopCheckRef.current) clearTimeout(stopCheckRef.current);
      };
    }, []);

    // ── Клавиатура — стабильные зависимости ──────────────────────────────
    useEffect(() => {
      const onKeyDown = (e) => {
        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && ["i", "o", "a", "b"].includes(e.key)) e.preventDefault();
        if (e.key === " " && selectedIntervalRef.current) e.preventDefault();

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
        if (e.key === " ") handlePlaySelection();

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
      // Все функции стабильны — зависят только от clampView который не меняется
    }, [
      zoomIn,
      zoomOut,
      zoomAll,
      zoomToSelection,
      panLeft,
      panRight,
      handlePlaySelection,
    ]);

    const handleResetSelection = useCallback(() => {
      stopSelection();
      setSelectedInterval(null);
      setPlayMode(null);
      handleSeek(0);
    }, [stopSelection, handleSeek]);

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

    // ── Overview click ────────────────────────────────────────────────────
    const handleOverviewClick = useCallback(
      (e) => {
        const el = overviewRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        const time =
          effStartRef.current +
          ratio * (effEndRef.current - effStartRef.current);
        handleSeek(time);
      },
      [handleSeek],
    );

    const handlePlayStateChange = useCallback(
      (playing) => {
        setIsPlaying(playing);
        if (!playing) {
          if (playingSelectionRef.current && selectedIntervalRef.current) {
            handleSeek(selectedIntervalRef.current.start);
          }
          playingSelectionRef.current = false;
          setPlayMode(null);
        }
      },
      [handleSeek],
    );

    const cursorRatio =
      effEnd > effStart ? (currentTime - effStart) / (effEnd - effStart) : 0;

    return (
      <div className="timeline">
        {/* ── Toolbar ── */}
        <div className="timeline-toolbar">
          {[
            { label: "−", title: "Zoom In (Ctrl+I)", action: zoomIn },
            { label: "+", title: "Zoom Out (Ctrl+O)", action: zoomOut },
            { label: "⊡", title: "Zoom All (Ctrl+A)", action: zoomAll },
            {
              label: "⊞",
              title: "Zoom Select (Ctrl+B)",
              action: zoomToSelection,
            },
            { label: "‹", title: "Pan Left (Shift+←)", action: panLeft },
            { label: "›", title: "Pan Right (Shift+→)", action: panRight },
          ].map(({ label, title, action }) => (
            <button
              key={title}
              className="tl-btn tl-btn-icon"
              onClick={action}
              title={title}
            >
              {label}
            </button>
          ))}

          <div className="tl-divider" />

          <button
            className="tl-btn tl-btn-icon"
            onClick={handlePlayAll}
            title={playMode === "all" ? "Pause (Space)" : "Play all"}
          >
            {playMode === "all" ? "⏸️ Pause all" : "▶️ Play all"}
          </button>

          <button
            className={`tl-btn${selectedInterval ? " active" : ""}`}
            onClick={handlePlaySelection}
            disabled={!selectedInterval}
            title={
              playMode === "selection"
                ? "Pause selection (Space)"
                : "Play selection (Space)"
            }
          >
            {playMode === "selection"
              ? "⏸️ Pause selection"
              : "▶️ Play selection"}
          </button>

          <button
            className="tl-btn tl-btn-icon"
            onClick={handleResetSelection}
            title="Reset selection and position"
          >
            ↩️ Reset
          </button>

          <div className="tl-divider" />

          <span className="tl-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
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

        {/* ── Player ── */}
        <AudioPlayer
          ref={audioRef}
          onTimeUpdate={handleTimeUpdate}
          onDurationLoaded={setDuration}
          onPlayStateChange={handlePlayStateChange}
          onStop={handleStop}
          onPlay={() => {
            const iv = selectedIntervalRef.current;
            if (iv) playInterval(iv);
          }}
        />

        {/* ── TimelineBar ── */}
        <TimelineBar
          duration={duration}
          currentTime={currentTime}
          onSeek={handleSeek}
          frameTimes={frameTimes}
          onFrameChange={setFrame}
          viewStart={effStart}
          viewEnd={effEnd}
        />

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
          {/* Палочки только видимых кадров, растянуты на всю ширину */}
          {duration > 0 &&
            frameTimes &&
            frameTimes
              .filter((t) => t >= effStart && t <= effEnd)
              .map((t, i) => (
                <div
                  key={i}
                  className="timeline-overview-frame"
                  style={{
                    left: `${((t - effStart) / (effEnd - effStart)) * 100}%`,
                  }}
                />
              ))}
          {/* Курсор в координатах текущего окна */}
          {duration > 0 && cursorRatio >= 0 && cursorRatio <= 1 && (
            <div
              className="timeline-overview-cursor"
              style={{ left: `${cursorRatio * 100}%` }}
            />
          )}
        </div>
      </div>
    );
  },
);

export default Timeline;
