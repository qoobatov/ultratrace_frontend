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
    // Переводим клик в абсолютное время с учётом окна
    const time = effStart + ratio * viewDuration;
    onSeek && onSeek(time);
    const frame = getFrameAtTime(time, frameTimes);
    onFrameChange && onFrameChange(frame);
  };

  // Позиция курсора внутри видимого окна
  const cursorRatio =
    viewDuration > 0 ? (currentTime - effStart) / viewDuration : 0;
  const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

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
    </div>
  );
};

export default TimelineBar;
