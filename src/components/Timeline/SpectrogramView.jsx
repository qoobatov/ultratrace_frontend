import { useState, useEffect } from "react";
import { getSpectrogramUrl } from "../../api/client";

const SpectrogramView = ({ duration, currentTime, spectrogramParams }) => {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    if (!duration || !spectrogramParams) return;
    const url =
      `${getSpectrogramUrl()}?` +
      new URLSearchParams({
        width: 800,
        height: 106,
        start_time: 0,
        end_time: duration,
        ...spectrogramParams,
      }).toString();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(url);
  }, [duration, spectrogramParams]);

  if (!imageUrl) return <div>Loading spectrogram...</div>;

  return (
    <div style={{ position: "relative", marginTop: "8px" }}>
      <img
        src={imageUrl}
        alt="Spectrogram"
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      {duration > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(currentTime / duration) * 100}%`,
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
