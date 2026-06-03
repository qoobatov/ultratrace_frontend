import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { getAudioUrl, getAudioInfo } from "../../api/client";

const AudioPlayer = forwardRef(
  (
    {
      onTimeUpdate,
      onDurationLoaded,
      onPlayStateChange,
      onStop,
      onPlay,
      isPlayingExternal,
    },
    ref,
  ) => {
    const audioRef = useRef(null);
    const segmentAudioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
      getAudioInfo().then((info) => {
        setDuration(info.duration);
        onDurationLoaded && onDurationLoaded(info.duration);
      });

      const segAudio = new Audio();
      segAudio.preload = "auto";
      segmentAudioRef.current = segAudio;

      return () => {
        if (segmentAudioRef.current) {
          segmentAudioRef.current.pause();
          segmentAudioRef.current = null;
        }
      };
    }, []);

    const togglePlay = () => {
      const displayPlaying = isPlayingExternal ?? playing;
      if (displayPlaying) {
        if (audioRef.current) audioRef.current.pause();
        if (segmentAudioRef.current) segmentAudioRef.current.pause();
        setPlaying(false);
        onPlayStateChange && onPlayStateChange(false);
      } else {
        if (onPlay) {
          onPlay();
        } else {
          if (audioRef.current) audioRef.current.play();
          setPlaying(true);
          onPlayStateChange && onPlayStateChange(true);
        }
      }
    };

    const stop = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (segmentAudioRef.current) {
        segmentAudioRef.current.pause();
        segmentAudioRef.current.ontimeupdate = null;
        segmentAudioRef.current.onended = null;
        segmentAudioRef.current.src = "";
      }
      setPlaying(false);
      setCurrentTime(0);
      onTimeUpdate && onTimeUpdate(0);
      onPlayStateChange && onPlayStateChange(false);
      onStop && onStop();
    };

    const handleTimeUpdate = () => {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate && onTimeUpdate(time);
    };

    const handleEnded = () => {
      setPlaying(false);
      onPlayStateChange && onPlayStateChange(false);
    };

    useImperativeHandle(ref, () => ({
      seek(time) {
        if (audioRef.current) {
          audioRef.current.currentTime = time;
          setCurrentTime(time);
        }
      },
      getCurrentTime: () => audioRef.current?.currentTime ?? 0,
      play() {
        if (!audioRef.current) return;
        audioRef.current.play();
        setPlaying(true);
        onPlayStateChange && onPlayStateChange(true);
      },
      pause() {
        if (audioRef.current) audioRef.current.pause();
        if (segmentAudioRef.current) {
          segmentAudioRef.current.pause();
          segmentAudioRef.current.ontimeupdate = null;
        }
        setPlaying(false);
        onPlayStateChange && onPlayStateChange(false);
      },
      isPlaying: () => playing,

      playSegmentUrl(url, offset = 0) {
        if (!segmentAudioRef.current) return;

        // Останавливаем основное аудио
        if (audioRef.current) audioRef.current.pause();

        const seg = segmentAudioRef.current;

        // Чистим предыдущие обработчики
        seg.ontimeupdate = null;
        seg.onended = null;
        seg.pause();

        seg.src = url;
        seg.currentTime = 0;

        // Время сегмента идёт от 0, добавляем offset чтобы получить абсолютное время
        seg.ontimeupdate = () => {
          const absTime = offset + seg.currentTime;
          setCurrentTime(absTime);
          onTimeUpdate && onTimeUpdate(absTime);
        };

        seg.onended = () => {
          seg.ontimeupdate = null;
          setPlaying(false);
          onPlayStateChange && onPlayStateChange(false);
        };

        seg.play();
        setPlaying(true);
        onPlayStateChange && onPlayStateChange(true);
      },
    }));

    const displayPlaying = isPlayingExternal ?? playing;

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
        <button onClick={togglePlay}>{displayPlaying ? "⏸️" : "▶️"}</button>
        <button onClick={stop}>⏹️</button>
        <span>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    );
  },
);

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default AudioPlayer;
