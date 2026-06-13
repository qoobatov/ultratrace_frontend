import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { getAudioUrl, getAudioInfo } from "../../api/client";

const AudioPlayer = forwardRef(
  ({ onTimeUpdate, onDurationLoaded, onPlayStateChange }, ref) => {
    const audioRef = useRef(null);
    const segmentAudioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // const togglePlay = () => {
    //   if (playing) {
    //     if (audioRef.current) audioRef.current.pause();
    //     if (segmentAudioRef.current) segmentAudioRef.current.pause();
    //     setPlaying(false);
    //     onPlayStateChange && onPlayStateChange(false);
    //   } else {
    //     if (onPlay) {
    //       onPlay();
    //     } else {
    //       if (audioRef.current) audioRef.current.play();
    //       setPlaying(true);
    //       onPlayStateChange && onPlayStateChange(true);
    //     }
    //   }
    // };

    // const stop = () => {
    //   if (audioRef.current) {
    //     audioRef.current.pause();
    //     audioRef.current.currentTime = 0;
    //   }
    //   if (segmentAudioRef.current) {
    //     segmentAudioRef.current.pause();
    //     segmentAudioRef.current.ontimeupdate = null;
    //     segmentAudioRef.current.onended = null;
    //     segmentAudioRef.current.src = "";
    //   }
    //   setPlaying(false);
    //   onTimeUpdate && onTimeUpdate(0);
    //   onPlayStateChange && onPlayStateChange(false);
    //   onStop && onStop();
    // };

    const handleTimeUpdate = () => {
      const time = audioRef.current.currentTime;
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
      <audio
        ref={audioRef}
        src={getAudioUrl()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="auto"
        style={{ display: "none" }}
      />
    );
  },
);

export default AudioPlayer;
