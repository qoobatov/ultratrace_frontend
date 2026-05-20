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
}) => {
  const barRef = useRef(null);

  const handleClick = (e) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const time = ratio * duration;
    onSeek && onSeek(time);
    const frame = getFrameAtTime(time, frameTimes);
    onFrameChange && onFrameChange(frame);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "20px",
        background: "#ccc",
        position: "relative",
        cursor: "pointer",
        margin: "4px 0",
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background: "#0af",
        }}
      />
    </div>
  );
};

export default TimelineBar;
