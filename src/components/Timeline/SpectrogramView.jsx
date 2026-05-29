import { useState, useEffect } from "react";
import { getSpectrogramUrl } from "../../api/client";

const SpectrogramView = ({
  duration,
  currentTime,
  spectrogramParams,
  viewStart,
  viewEnd,
}) => {
  const [imageUrl, setImageUrl] = useState(null);

  // Эффективные границы окна (с fallback на полный диапазон)
  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;

  useEffect(() => {
    if (!duration || !spectrogramParams) return;
    const url =
      `${getSpectrogramUrl()}?` +
      new URLSearchParams({
        width: 800,
        height: 65,
        start_time: effStart,
        end_time: effEnd,
        ...spectrogramParams,
      }).toString();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(url);
  }, [duration, spectrogramParams, effStart, effEnd]);

  if (!imageUrl) return <div>Loading spectrogram...</div>;

  // Позиция курсора относительно видимого окна
  const viewDuration = effEnd - effStart;
  const cursorRatio =
    viewDuration > 0 ? (currentTime - effStart) / viewDuration : 0;
  const cursorVisible = cursorRatio >= 0 && cursorRatio <= 1;

  return (
    <div style={{ position: "relative", marginTop: "8px" }}>
      <img
        src={imageUrl}
        alt="Spectrogram"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          transform: "scaleY(-1)",
        }}
      />
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

export default SpectrogramView;
