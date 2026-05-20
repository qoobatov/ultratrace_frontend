import { useState, useEffect } from "react";
import { getTextGridIntervals } from "../../api/client";

const TextGridTiers = ({ currentTime, duration, onSelectInterval }) => {
  const [tiers, setTiers] = useState({});

  useEffect(() => {
    getTextGridIntervals().then((data) => {
      // data – массив интервалов, сгруппируем по tier
      const grouped = {};
      data.forEach((item) => {
        if (!grouped[item.tier]) grouped[item.tier] = [];
        grouped[item.tier].push(item);
      });
      setTiers(grouped);
    });
  }, []);

  if (!Object.keys(tiers).length) return <div>No TextGrid data</div>;

  return (
    <div style={{ fontSize: "12px", marginTop: "8px" }}>
      {Object.entries(tiers).map(([tierName, intervals]) => (
        <div key={tierName} style={{ marginBottom: "4px" }}>
          <div style={{ fontWeight: "bold" }}>{tierName}</div>
          <div
            style={{
              display: "flex",
              height: "20px",
              background: "#eee",
              position: "relative",
            }}
          >
            {intervals.map((interval, idx) => {
              const left = duration ? (interval.start / duration) * 100 : 0;
              const width = duration
                ? ((interval.end - interval.start) / duration) * 100
                : 0;
              const isActive =
                currentTime >= interval.start && currentTime < interval.end;
              return (
                <div
                  key={idx}
                  onClick={() => onSelectInterval && onSelectInterval(interval)}
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
