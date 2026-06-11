import { useState, useEffect, useRef } from "react";
import { getSpectrogramUrl } from "../../api/client";

const SpectrogramView = ({
  duration,
  currentTime,
  spectrogramParams,
  viewStart,
  viewEnd,
}) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;

  useEffect(() => {
    if (!duration || !spectrogramParams) return;

    // Дебаунс — не запрашиваем картинку при каждом шаге зума
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
    }, 300); // ждём 300мс после последнего изменения зума

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [duration, spectrogramParams, effStart, effEnd]);

  const viewDuration = effEnd - effStart;
  const cursorRatio =
    viewDuration > 0 ? (currentTime - effStart) / viewDuration : 0;
  const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

  return (
    <div style={{ position: "relative", marginTop: "4px" }}>
      {/* Пока грузится новая картинка — показываем затемнение поверх старой */}
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
    </div>
  );
};

export default SpectrogramView;
