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
import { getAudioSegmentUrl, getTextGridIntervals } from "../../api/client";
import "./Timeline.css";

const TG_ZOOM_FACTOR = 1.5;
const WHEEL_ZOOM_FACTOR = 1.15;
const DRAG_SELECT_THRESHOLD = 5;
const BOUNDARY_EPS = 1e-4;

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
  (
    {
      frame,
      setFrame,
      frameTimes,
      spectrogramParams,
      spectrogramPanelOpen,
      onToggleSpectrogramPanel,
    },
    ref,
  ) => {
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [viewStart, setViewStart] = useState(null);
    const [viewEnd, setViewEnd] = useState(null);
    const [selectedInterval, setSelectedInterval] = useState(null);
    const [dragSelection, setDragSelection] = useState(null);

    const [tiers, setTiers] = useState({});
    const [activeTier, setActiveTier] = useState(null);

    const audioRef = useRef(null);
    const overviewRef = useRef(null);
    const spectroRef = useRef(null);
    const tiersRef = useRef(null);
    const currentFrameRef = useRef(frame);
    const currentTimeRef = useRef(currentTime);
    const activeTierRef = useRef(activeTier);
    const tiersDataRef = useRef(tiers);
    const playingSelectionRef = useRef(false);
    const stopCheckRef = useRef(null);

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
    useEffect(() => {
      currentTimeRef.current = currentTime;
    }, [currentTime]);
    useEffect(() => {
      activeTierRef.current = activeTier;
    }, [activeTier]);
    useEffect(() => {
      tiersDataRef.current = tiers;
    }, [tiers]);

    const effStart = viewStart ?? 0;
    const effEnd = viewEnd ?? duration;

    useEffect(() => {
      effStartRef.current = effStart;
      effEndRef.current = effEnd;
    }, [effStart, effEnd]);

    // ── Загрузка тиров ────────────────────────────────────────────────────
    useEffect(() => {
      let cancelled = false;
      getTextGridIntervals()
        .then((data) => {
          if (cancelled) return;
          const grouped = {};
          data.forEach((item) => {
            if (!grouped[item.tier]) grouped[item.tier] = [];
            grouped[item.tier].push(item);
          });
          Object.keys(grouped).forEach((tier) => {
            grouped[tier].sort((a, b) => a.start - b.start);
          });
          setTiers(grouped);
          setActiveTier((prev) => {
            if (prev && grouped[prev]) return prev;
            return Object.keys(grouped)[0] || null;
          });
        })
        .catch((err) => {
          if (!cancelled) console.error("Failed to load TextGrid tiers", err);
        });
      return () => {
        cancelled = true;
      };
    }, []);

    // ── Геометрия реального контента спектрограммы ────────────────────────
    // Контейнер .timeline-spectrogram имеет padding-left (под колонку лейблов
    // тиров). Клики/колесо должны считаться от фактического края картинки,
    // а не от края контейнера с padding. Этот helper возвращает координаты
    // img (или, если img ещё не загружен, эмулирует их через вычитание padding).
    const getSpectroContentRect = useCallback(() => {
      const container = spectroRef.current;
      if (!container) return null;
      const img = container.querySelector("img");
      if (img) {
        const r = img.getBoundingClientRect();
        if (r.width > 0) return { left: r.left, width: r.width };
      }
      const r = container.getBoundingClientRect();
      if (r.width <= 0) return null;
      const cs = window.getComputedStyle(container);
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      return { left: r.left + pl, width: r.width - pl - pr };
    }, []);

    // ── clampView ─────────────────────────────────────────────────────────
    const clampView = useCallback((start, end) => {
      const dur = durationRef.current || 1;
      const len = end - start;
      let s = Math.max(0, start);
      let e = Math.min(dur, end);
      if (s === 0) e = Math.min(dur, len);
      if (e === dur) s = Math.max(0, dur - len);
      return [s, e];
    }, []);

    // ── «Сделать видимым» ─────────────────────────────────────────────────
    const ensureTimeRangeVisible = useCallback(
      (start, end) => {
        const s = effStartRef.current;
        const e = effEndRef.current;
        if (s >= e) return;
        if (start >= s && end <= e) return;

        const dur = e - s;
        const pad = dur * 0.08;

        let ns = s;
        let ne = e;
        if (start < s) {
          ns = start - pad;
          ne = ns + dur;
        }
        if (end > ne) {
          ne = end + pad;
          ns = ne - dur;
        }
        [ns, ne] = clampView(ns, ne);
        setViewStart(ns);
        setViewEnd(ne);
      },
      [clampView],
    );

    // ── Zoom ──────────────────────────────────────────────────────────────
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

    const zoomAtTime = useCallback(
      (time, factor) => {
        const s = effStartRef.current;
        const e = effEndRef.current;
        const a = e - s;
        if (a <= 0) return;
        const newA = a / factor;
        const ratio = (time - s) / a;
        let ns = time - ratio * newA;
        let ne = ns + newA;
        [ns, ne] = clampView(ns, ne);
        setViewStart(ns);
        setViewEnd(ne);
      },
      [clampView],
    );

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
        const iv = selectedIntervalRef.current;

        if (audioRef.current) audioRef.current.seek(time);
        setCurrentTime(time);
        const calcFrame = getFrameAtTime(time, frameTimes);
        currentFrameRef.current = calcFrame;
        setFrame(calcFrame);

        // Если идёт воспроизведение БЕЗ выделения — перезапускаем его
        // с новой позиции. Иначе seek дёргает только основной <audio>,
        // а играет segment-audio, и звук продолжает идти со старой позиции,
        // пока не доиграет до конца — ровно то, что ты видел.
        if (isPlaying && !iv) {
          playingSelectionRef.current = false; // чтобы onPlayStateChange(false)
          // не «отбросил» нас назад
          audioRef.current?.pause();
          const end = durationRef.current;
          if (end > time) {
            const url = getAudioSegmentUrl(time, end);
            audioRef.current?.playSegmentUrl(url, time);
          }
        }
      },
      [frameTimes, setFrame, isPlaying],
    );

    // ── Praat-style keyboard navigation ───────────────────────────────────
    const navigateInterval = useCallback(
      (dir) => {
        const tier = activeTierRef.current;
        if (!tier) return;
        const intervals = tiersDataRef.current[tier] || [];
        if (!intervals.length) return;

        const cur = selectedIntervalRef.current;
        let anchorIdx = -1;
        if (cur && cur.tier === tier) {
          if (
            Array.isArray(cur.intervalIndices) &&
            cur.intervalIndices.length === 2
          ) {
            // Для многокусочного выделения берём его «дальний» край
            anchorIdx =
              dir > 0 ? cur.intervalIndices[1] : cur.intervalIndices[0];
          } else {
            anchorIdx = intervals.findIndex(
              (iv) =>
                Math.abs(iv.start - cur.start) < BOUNDARY_EPS &&
                Math.abs(iv.end - cur.end) < BOUNDARY_EPS,
            );
          }
        }

        let nextIdx;
        if (anchorIdx < 0) {
          nextIdx = dir > 0 ? 0 : intervals.length - 1;
        } else {
          nextIdx = Math.max(
            0,
            Math.min(intervals.length - 1, anchorIdx + dir),
          );
          if (nextIdx === anchorIdx) return;
        }

        const iv = intervals[nextIdx];
        setSelectedInterval({
          ...iv,
          intervalIndices: [nextIdx, nextIdx],
        });
        handleSeek(iv.start);
        ensureTimeRangeVisible(iv.start, iv.end);
      },
      [handleSeek, ensureTimeRangeVisible],
    );

    const navigateTier = useCallback(
      (dir) => {
        const names = Object.keys(tiersDataRef.current);
        if (!names.length) return;
        const curTier = activeTierRef.current;
        let idx = curTier ? names.indexOf(curTier) : -1;
        if (idx < 0) idx = 0;
        const nextIdx = Math.max(0, Math.min(names.length - 1, idx + dir));
        if (nextIdx === idx) return;

        const nextTier = names[nextIdx];
        setActiveTier(nextTier);

        const intervals = tiersDataRef.current[nextTier] || [];
        if (!intervals.length) return;

        const t = currentTimeRef.current;
        let iv = intervals.find((x) => t >= x.start && t < x.end);
        if (!iv) {
          let best = intervals[0];
          let bestDist = Infinity;
          for (const x of intervals) {
            const d = t < x.start ? x.start - t : t - x.end;
            if (d < bestDist) {
              bestDist = d;
              best = x;
            }
          }
          iv = best;
        }

        const ivIdx = intervals.indexOf(iv);
        setSelectedInterval({
          ...iv,
          intervalIndices: [ivIdx, ivIdx],
        });
        ensureTimeRangeVisible(iv.start, iv.end);
      },
      [ensureTimeRangeVisible],
    );

    // ── Play / Pause (Praat-логика) ───────────────────────────────────────
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

    const handlePlayPause = useCallback(() => {
      if (!audioRef.current) return;
      const iv = selectedIntervalRef.current;

      if (isPlaying) {
        audioRef.current.pause();
        return;
      }

      const cur = currentTimeRef.current;
      const s = effStartRef.current;
      const e = effEndRef.current;

      // Воспроизведение выделения: продолжить с текущей позиции,
      // если она внутри выделения; иначе — с его начала.
      if (iv) {
        const from = cur > iv.start && cur < iv.end ? cur : iv.start;
        playInterval(iv, from);
        return;
      }

      if (e <= s) return;

      // Воспроизведение видимого окна: если курсор в окне — продолжить
      // с него; если курсор вне окна (например, только что зазумились) —
      // стартовать с начала окна.
      const from = cur > s && cur < e ? cur : s;
      const url = getAudioSegmentUrl(from, e);
      audioRef.current.playSegmentUrl(url, from);
    }, [isPlaying, playInterval]);

    useEffect(() => {
      return () => {
        if (stopCheckRef.current) clearTimeout(stopCheckRef.current);
      };
    }, []);

    // ── Клавиатура ────────────────────────────────────────────────────────
    useEffect(() => {
      const onKeyDown = (e) => {
        const cmd = e.ctrlKey || e.metaKey;

        if (cmd && ["i", "o", "a", "b"].includes(e.key)) e.preventDefault();
        if (e.key === " ") e.preventDefault();

        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable
        )
          return;

        if (cmd && e.key === "i") zoomOut();
        if (cmd && e.key === "o") zoomIn();
        if (cmd && e.key === "a") zoomAll();
        if (cmd && e.key === "b") zoomToSelection();

        if (e.key === " ") handlePlayPause();

        if (cmd && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          navigateInterval(e.key === "ArrowRight" ? 1 : -1);
          return;
        }
        if (cmd && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          navigateTier(e.key === "ArrowDown" ? 1 : -1);
          return;
        }

        if (e.shiftKey && e.key === "ArrowLeft") {
          e.preventDefault();
          panLeft();
          return;
        }
        if (e.shiftKey && e.key === "ArrowRight") {
          e.preventDefault();
          panRight();
          return;
        }

        if (
          !e.shiftKey &&
          !cmd &&
          (e.key === "ArrowLeft" || e.key === "ArrowRight")
        ) {
          e.preventDefault();
          if (!frameTimes?.length) return;
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          const nextFrame = Math.max(
            1,
            Math.min(frameTimes.length, currentFrameRef.current + dir),
          );
          const time = frameTimes[nextFrame - 1];
          if (time != null) {
            handleSeek(time);
            ensureTimeRangeVisible(time, time);
          }
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
      handlePlayPause,
      handleSeek,
      navigateInterval,
      navigateTier,
      ensureTimeRangeVisible,
      frameTimes,
    ]);

    // ── Ctrl+wheel zoom на спектрограмме и тирах ──────────────────────────
    useEffect(() => {
      const handler = (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();

        const scale = getSpectroContentRect();
        if (!scale) return;

        const ratio = Math.max(
          0,
          Math.min(1, (e.clientX - scale.left) / scale.width),
        );
        const s = effStartRef.current;
        const eT = effEndRef.current;
        const time = s + ratio * (eT - s);

        const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
        zoomAtTime(time, factor);
      };

      const els = [spectroRef.current, tiersRef.current].filter(Boolean);
      els.forEach((el) =>
        el.addEventListener("wheel", handler, { passive: false }),
      );
      return () => {
        els.forEach((el) => el.removeEventListener("wheel", handler));
      };
    }, [zoomAtTime, getSpectroContentRect]);

    // ── Click + drag on spectrogram ───────────────────────────────────────
    useEffect(() => {
      const el = spectroRef.current;
      if (!el) return;

      const dragStateRef = { current: null };

      const getTimeAtClientX = (clientX) => {
        const scale = getSpectroContentRect();
        if (!scale) return null;
        const ratio = Math.max(
          0,
          Math.min(1, (clientX - scale.left) / scale.width),
        );
        const s = effStartRef.current;
        const eT = effEndRef.current;
        return s + ratio * (eT - s);
      };

      const handleDown = (e) => {
        if (e.button !== 0) return;
        const time = getTimeAtClientX(e.clientX);
        if (time == null) return;
        e.preventDefault();
        dragStateRef.current = {
          startX: e.clientX,
          startTime: time,
          moved: false,
        };
      };

      const handleMove = (e) => {
        const st = dragStateRef.current;
        if (!st) return;
        if (!st.moved) {
          if (Math.abs(e.clientX - st.startX) < DRAG_SELECT_THRESHOLD) return;
          st.moved = true;
        }
        const time = getTimeAtClientX(e.clientX);
        if (time == null) return;
        const [s, e2] =
          time < st.startTime ? [time, st.startTime] : [st.startTime, time];
        setDragSelection({ start: s, end: e2 });
      };

      const handleUp = (e) => {
        const st = dragStateRef.current;
        if (!st) return;
        dragStateRef.current = null;

        if (st.moved) {
          const time = getTimeAtClientX(e.clientX);
          if (time != null) {
            const [s, e2] =
              time < st.startTime ? [time, st.startTime] : [st.startTime, time];
            setSelectedInterval({
              start: s,
              end: e2,
              tier: null,
              text: "",
            });
          }
          setDragSelection(null);
        } else {
          const time = getTimeAtClientX(e.clientX);
          if (time != null) handleSeek(time);
        }

        window.getSelection?.()?.removeAllRanges?.();
      };

      el.addEventListener("mousedown", handleDown);
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      return () => {
        el.removeEventListener("mousedown", handleDown);
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
    }, [handleSeek, getSpectroContentRect]);

    const handleResetSelection = useCallback(() => {
      stopSelection();
      setSelectedInterval(null);
      setDragSelection(null);
      handleSeek(0);
    }, [stopSelection, handleSeek]);

    const handleSelectInterval = useCallback(
      (interval) => {
        setSelectedInterval(interval);
        if (interval.tier) setActiveTier(interval.tier);
        if (frameTimes?.length) {
          let idx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < frameTimes.length; i++) {
            const diff = Math.abs(frameTimes[i] - interval.start);
            if (diff < minDiff) {
              minDiff = diff;
              idx = i;
            }
          }
          const targetFrame = idx + 1;
          if (audioRef.current) audioRef.current.seek(interval.start);
          setCurrentTime(interval.start);
          currentFrameRef.current = targetFrame;
          setFrame(targetFrame);
        } else {
          handleSeek(interval.start);
        }
      },
      [handleSeek, frameTimes, setFrame],
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
            { label: "−", title: "Zoom Out (Ctrl+I)", action: zoomOut },
            { label: "+", title: "Zoom In (Ctrl+O)", action: zoomIn },
            { label: "⊡", title: "Zoom Out All (Ctrl+A)", action: zoomAll },
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
            className={`tl-btn${selectedInterval ? " active" : ""}`}
            onClick={handlePlayPause}
            title={
              isPlaying
                ? "Pause (Space)"
                : selectedInterval
                  ? "Play selection (Space)"
                  : "Play visible window (Space)"
            }
          >
            {isPlaying ? "⏸️ Pause" : "▶️ Play"}
          </button>

          <button
            className="tl-btn tl-btn-icon"
            onClick={handleResetSelection}
            title="Reset selection and position"
          >
            ↩️ Reset
          </button>

          <div className="tl-divider" />

          <button
            className={`tl-btn tl-btn-icon${spectrogramPanelOpen ? " active" : ""}`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onToggleSpectrogramPanel?.(rect);
            }}
            title="Spectrogram settings"
          >
            ⚙️
          </button>

          <div className="tl-divider" />

          <span className="tl-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* ── Spectrogram ── */}
        <div className="timeline-spectrogram" ref={spectroRef}>
          <SpectrogramView
            duration={duration}
            currentTime={currentTime}
            spectrogramParams={spectrogramParams}
            viewStart={effStart}
            viewEnd={effEnd}
            selectedInterval={dragSelection || selectedInterval}
          />
        </div>

        {/* ── Player ── */}
        <AudioPlayer
          ref={audioRef}
          onTimeUpdate={handleTimeUpdate}
          onDurationLoaded={setDuration}
          onPlayStateChange={handlePlayStateChange}
          onStop={handleStop}
        />

        {/* ── TimelineBar ── */}
        <div className="timeline-bar-wrap">
          <TimelineBar
            duration={duration}
            currentTime={currentTime}
            onSeek={handleSeek}
            frameTimes={frameTimes}
            onFrameChange={setFrame}
            viewStart={effStart}
            viewEnd={effEnd}
            selectedInterval={selectedInterval}
          />
        </div>

        {/* ── TextGrid tiers ── */}
        <div className="timeline-tiers" ref={tiersRef}>
          <TextGridTiers
            tiers={tiers}
            activeTier={activeTier}
            onActivateTier={setActiveTier}
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

          {duration > 0 &&
            selectedInterval &&
            (() => {
              const selStartRatio =
                (selectedInterval.start - effStart) / (effEnd - effStart);
              const selEndRatio =
                (selectedInterval.end - effStart) / (effEnd - effStart);
              return selStartRatio < 1 && selEndRatio > 0 ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${Math.max(0, selStartRatio) * 100}%`,
                    width: `${(Math.min(1, selEndRatio) - Math.max(0, selStartRatio)) * 100}%`,
                    background: "rgba(89, 154, 255, 0.2)",
                    pointerEvents: "none",
                  }}
                />
              ) : null;
            })()}

          {duration > 0 &&
            selectedInterval &&
            (() => {
              const ratio =
                (selectedInterval.start - effStart) / (effEnd - effStart);
              return ratio >= 0 && ratio <= 1 ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${ratio * 100}%`,
                    width: "2px",
                    background: "#599aff",
                    pointerEvents: "none",
                  }}
                />
              ) : null;
            })()}

          {duration > 0 &&
            selectedInterval &&
            (() => {
              const ratio =
                (selectedInterval.end - effStart) / (effEnd - effStart);
              return ratio >= 0 && ratio <= 1 ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${ratio * 100}%`,
                    width: "2px",
                    background: "#599aff",
                    pointerEvents: "none",
                  }}
                />
              ) : null;
            })()}

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
