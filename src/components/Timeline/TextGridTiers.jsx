import { useState, useEffect } from "react";
import { getTextGridIntervals } from "../../api/client";

const TextGridTiers = ({
  currentTime,
  duration,
  onSelectInterval,
  viewStart,
  viewEnd,
}) => {
  const [tiers, setTiers] = useState({});

  useEffect(() => {
    getTextGridIntervals().then((data) => {
      const grouped = {};
      data.forEach((item) => {
        if (!grouped[item.tier]) grouped[item.tier] = [];
        grouped[item.tier].push(item);
      });
      setTiers(grouped);
    });
  }, []);

  if (!Object.keys(tiers).length) return <div>No TextGrid data</div>;

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;
  const viewDuration = effEnd - effStart;

  return (
    <div style={{ fontSize: "12px", marginTop: "8px" }}>
      {Object.entries(tiers).map(([tierName, intervals]) => (
        <div key={tierName} style={{ marginBottom: "4px" }}>
          <div
            style={{
              display: "flex",
              height: "20px",
              background: "#eee",
              position: "relative",
            }}
          >
            {intervals
              // Отбрасываем интервалы полностью за пределами окна
              .filter((iv) => iv.end > effStart && iv.start < effEnd)
              .map((interval, idx) => {
                // Обрезаем по границам окна
                const clampedStart = Math.max(interval.start, effStart);
                const clampedEnd = Math.min(interval.end, effEnd);

                const left = viewDuration
                  ? ((clampedStart - effStart) / viewDuration) * 100
                  : 0;
                const width = viewDuration
                  ? ((clampedEnd - clampedStart) / viewDuration) * 100
                  : 0;

                const isActive =
                  currentTime >= interval.start && currentTime < interval.end;

                return (
                  <div
                    key={idx}
                    onClick={() =>
                      onSelectInterval && onSelectInterval(interval)
                    }
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      width: `${width}%`,
                      height: "100%",
                      background: isActive ? "#aaf" : "#ddd",
                      border: "1px solid #999",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      padding: "0 2px",
                      boxSizing: "border-box",
                    }}
                    title={interval.text}
                  >
                    {interval.text}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TextGridTiers;
