import { useState, useEffect, useRef } from "react";
import { getSpectrogramUrl } from "../../api/client";

const SpectrogramView = ({
  duration,
  currentTime,
  spectrogramParams,
  viewStart,
  viewEnd,
  selectedInterval,
}) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;

  useEffect(() => {
    if (!duration || !spectrogramParams) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    debounceRef.current = setTimeout(() => {
      const url =
        `${getSpectrogramUrl()}?` +
        new URLSearchParams({
          width: 800,
          height: 65,
          start_time: effStart,
          end_time: effEnd,
          ...spectrogramParams,
        }).toString();
      setImageUrl(url);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [duration, spectrogramParams, effStart, effEnd]);

  const viewDuration = effEnd - effStart;

  const toRatio = (t) => (viewDuration > 0 ? (t - effStart) / viewDuration : 0);

  const cursorRatio = toRatio(currentTime);
  const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

  const selStartRatio = selectedInterval
    ? toRatio(selectedInterval.start)
    : null;
  const selEndRatio = selectedInterval ? toRatio(selectedInterval.end) : null;

  return (
    <div style={{ position: "relative", marginTop: "4px" }}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Spectrogram"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            transform: "scaleY(-1)",
            opacity: loading ? 0.4 : 1,
            transition: "opacity 0.15s",
          }}
        />
      )}
      {!imageUrl && (
        <div
          style={{
            height: "65px",
            background: "#11111b",
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#45475a",
            fontSize: "11px",
          }}
        >
          Loading spectrogram...
        </div>
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
            background: "rgba(89, 154, 255, 0.15)",
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
            background: "#f38ba8",
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

export default SpectrogramView;
