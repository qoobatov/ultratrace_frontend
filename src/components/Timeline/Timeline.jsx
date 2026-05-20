import { useState, useRef, useCallback } from "react";
import AudioPlayer from "./AudioPlayer";
import TimelineBar from "./TimelineBar";
import TextGridTiers from "./TextGridTiers";
import SpectrogramView from "./SpectrogramView";

const getFrameAtTime = (time, frameTimes) => {
  if (!frameTimes?.length) return 1;
  for (let i = 0; i < frameTimes.length; i++) {
    if (frameTimes[i] >= time) return i + 1;
  }
  return frameTimes.length;
};

const Timeline = ({ frame, setFrame, frameTimes, spectrogramParams }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const handleTimeUpdate = useCallback(
    (time) => {
      setCurrentTime(time);
      const calcFrame = getFrameAtTime(time, frameTimes);
      if (calcFrame !== frame) setFrame(calcFrame);
    },
    [frameTimes, frame, setFrame],
  );

  const handleSeek = (time) => {
    if (audioRef.current) audioRef.current.seek(time);
    setCurrentTime(time);
    const calcFrame = getFrameAtTime(time, frameTimes);
    setFrame(calcFrame);
  };

  const handleSelectInterval = (interval) => {
    if (audioRef.current) audioRef.current.seek(interval.start);
    setCurrentTime(interval.start);
    const calcFrame = getFrameAtTime(interval.start, frameTimes);
    setFrame(calcFrame);
  };

  return (
    <div
      style={{
        background: "#fafafa",
        borderTop: "2px solid #ccc",
        padding: "8px",
      }}
    >
      <AudioPlayer
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onDurationLoaded={setDuration}
      />
      <TimelineBar
        duration={duration}
        currentTime={currentTime}
        onSeek={handleSeek}
        frameTimes={frameTimes}
        onFrameChange={setFrame}
      />
      <TextGridTiers
        currentTime={currentTime}
        duration={duration}
        onSelectInterval={handleSelectInterval}
      />
      <SpectrogramView
        duration={duration}
        currentTime={currentTime}
        spectrogramParams={spectrogramParams}
      />
    </div>
  );
};

export default Timeline;
