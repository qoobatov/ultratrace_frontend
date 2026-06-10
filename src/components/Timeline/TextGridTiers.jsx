import { useState, useEffect } from "react";
import { getTextGridIntervals } from "../../api/client";
import "./TextGridTiers.css";

const TextGridTiers = ({
  currentTime,
  duration,
  onSelectInterval,
  viewStart,
  viewEnd,
  selectedInterval,
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

  if (!Object.keys(tiers).length) return null;

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;
  const viewDuration = effEnd - effStart;

  return (
    <div className="tiers-container">
      {Object.entries(tiers).map(([tierName, intervals]) => (
        <div key={tierName} className="tier-row">
          {intervals
            .filter((iv) => iv.end > effStart && iv.start < effEnd)
            .map((interval, idx) => {
              const clampedStart = Math.max(interval.start, effStart);
              const clampedEnd = Math.min(interval.end, effEnd);

              const left = viewDuration
                ? ((clampedStart - effStart) / viewDuration) * 100
                : 0;
              const width = viewDuration
                ? ((clampedEnd - clampedStart) / viewDuration) * 100
                : 0;

              const isSelected =
                selectedInterval &&
                selectedInterval.start === interval.start &&
                selectedInterval.end === interval.end &&
                selectedInterval.tier === interval.tier;

              const isCurrent =
                !isSelected &&
                currentTime >= interval.start &&
                currentTime < interval.end;

              return (
                <div
                  key={idx}
                  className={`tier-interval${isSelected ? " is-selected" : isCurrent ? " is-current" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onSelectInterval && onSelectInterval(interval)}
                  title={interval.text}
                >
                  {interval.text}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
};

export default TextGridTiers;
