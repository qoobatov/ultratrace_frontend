import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { getAudioUrl, getAudioInfo } from "../../api/client";
import "./AudioPlayer.css";

const AudioPlayer = forwardRef(
  (
    {
      onTimeUpdate,
      onDurationLoaded,
      onPlayStateChange,
      onStop,
      onPlay,
      isPlayingExternal,
      viewStart,
      viewEnd,
    },
    ref,
  ) => {
    const audioRef = useRef(null);
    const segmentAudioRef = useRef(null);
    const scrubberRef = useRef(null);
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

    const displayPlaying = isPlayingExternal ?? playing;

    // Позиция курсора относительно окна просмотра
    const effStart = viewStart ?? 0;
    const effEnd = viewEnd ?? duration;
    const viewDuration = effEnd - effStart;

    const cursorRatio =
      viewDuration > 0 ? (currentTime - effStart) / viewDuration : 0;
    const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;
    const fillPct = cursorVisible ? cursorRatio * 100 : 0;

    const togglePlay = () => {
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

    const handleScrubberClick = (e) => {
      if (!scrubberRef.current || !viewDuration) return;
      const rect = scrubberRef.current.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const time = effStart + ratio * viewDuration;
      if (audioRef.current) audioRef.current.currentTime = time;
      setCurrentTime(time);
      onTimeUpdate && onTimeUpdate(time);
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
        if (audioRef.current) audioRef.current.pause();

        const seg = segmentAudioRef.current;
        seg.ontimeupdate = null;
        seg.onended = null;
        seg.pause();
        seg.src = url;
        seg.currentTime = 0;

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

    return (
      <div className="audio-player">
        <audio
          ref={audioRef}
          src={getAudioUrl()}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="auto"
        />

        <button
          className={`player-btn ${displayPlaying ? "playing" : ""}`}
          onClick={togglePlay}
          title={displayPlaying ? "Pause" : "Play"}
        >
          {displayPlaying ? "⏸" : "▶"}
        </button>

        <button className="player-btn stop" onClick={stop} title="Stop">
          ⏹
        </button>

        <div
          className="player-scrubber"
          ref={scrubberRef}
          onClick={handleScrubberClick}
        >
          {cursorVisible && (
            <>
              <div
                className="player-scrubber-fill"
                style={{ width: `${fillPct}%` }}
              />
              <div
                className="player-scrubber-cursor"
                style={{ left: `${fillPct}%` }}
              />
            </>
          )}
        </div>

        <span className="player-time">
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
