import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { getAudioUrl, getAudioInfo } from "../../api/client";

const AudioPlayer = forwardRef(({ onTimeUpdate, onDurationLoaded }, ref) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Загружаем аудио-инфо
  useEffect(() => {
    getAudioInfo().then((info) => {
      setDuration(info.duration);
      onDurationLoaded && onDurationLoaded(info.duration);
    });
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const stop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
    onTimeUpdate && onTimeUpdate(0);
  };

  const handleTimeUpdate = () => {
    const time = audioRef.current.currentTime;
    setCurrentTime(time);
    onTimeUpdate && onTimeUpdate(time);
  };

  const handleEnded = () => {
    setPlaying(false);
  };

  // Методы для родительского компонента
  useImperativeHandle(ref, () => ({
    seek(time) {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        setCurrentTime(time);
      }
    },
    getCurrentTime: () => audioRef.current?.currentTime || 0,
  }));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px",
      }}
    >
      <audio
        ref={audioRef}
        src={getAudioUrl()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
      />
      <button onClick={togglePlay}>{playing ? "⏸️" : "▶️"}</button>
      <button onClick={stop}>⏹️</button>
      <span>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
});

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default AudioPlayer;
