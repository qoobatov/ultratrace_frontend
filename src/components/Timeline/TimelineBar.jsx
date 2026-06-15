import { useRef } from "react";

const getFrameAtTime = (time, frameTimes) => {
  if (!frameTimes?.length) return 1;
  for (let i = 0; i < frameTimes.length; i++) {
    if (frameTimes[i] >= time) return i + 1;
  }
  return frameTimes.length;
};

const TimelineBar = ({
  duration,
  currentTime,
  onSeek,
  frameTimes,
  onFrameChange,
  viewStart,
  viewEnd,
  selectedInterval,
}) => {
  const barRef = useRef(null);

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;
  const viewDuration = effEnd - effStart;

  const handleClick = (e) => {
    if (!barRef.current || !viewDuration) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const time = effStart + ratio * viewDuration;
    onSeek && onSeek(time);
    const frame = getFrameAtTime(time, frameTimes);
    onFrameChange && onFrameChange(frame);
  };

  const toRatio = (t) => (viewDuration > 0 ? (t - effStart) / viewDuration : 0);

  const cursorRatio = toRatio(currentTime);
  const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

  // Синие линии выделения
  const selStartRatio = selectedInterval
    ? toRatio(selectedInterval.start)
    : null;
  const selEndRatio = selectedInterval ? toRatio(selectedInterval.end) : null;

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "10px",
        background: "#ccc",
        position: "relative",
        cursor: "pointer",
        margin: "2px 0",
      }}
    >
      {/* Прогресс-бар до курсора */}
      {cursorVisible && (
        <div
          style={{
            width: `${cursorRatio * 100}%`,
            height: "100%",
            background: "rgb(243, 176, 164)",
          }}
        />
      )}

      {/* Подсветка выделенного интервала */}
      {selectedInterval && selStartRatio < 1 && selEndRatio > 0 && (
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
      )}

      {/* Красная линия курсора */}
      {cursorVisible && (
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

      {/* Синяя линия — начало выделения */}
      {selectedInterval && selStartRatio >= 0 && selStartRatio <= 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${selStartRatio * 100}%`,
            width: "2px",
            background: "#599aff",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Синяя линия — конец выделения */}
      {selectedInterval && selEndRatio >= 0 && selEndRatio <= 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${selEndRatio * 100}%`,
            width: "2px",
            background: "#599aff",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};

export default TimelineBar;
