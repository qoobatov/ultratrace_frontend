import { useState, useEffect, useRef } from "react";
import { getTextGridIntervals } from "../../api/client";
import "./TextGridTiers.css";

const DEFAULT_TIER_HEIGHT = 30;
const COLLAPSED_TIER_HEIGHT = 6;

const TextGridTiers = ({
  currentTime,
  duration,
  onSelectInterval,
  viewStart,
  viewEnd,
  selectedInterval,
}) => {
  const [tiers, setTiers] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const containerRef = useRef(null);

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

  // Scroll над тиром → свернуть/развернуть. Ctrl+wheel не трогаем.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) return;

      const tierEl = e.target?.closest?.(".tier-with-label");
      if (!tierEl) return;
      const tierName = tierEl.getAttribute("data-tier");
      if (!tierName) return;

      e.preventDefault();

      setCollapsed((prev) => {
        const isCollapsed = !!prev[tierName];
        const shouldCollapse = e.deltaY > 0;
        const shouldExpand = e.deltaY < 0;
        if (shouldCollapse && !isCollapsed) {
          return { ...prev, [tierName]: true };
        }
        if (shouldExpand && isCollapsed) {
          const next = { ...prev };
          delete next[tierName];
          return next;
        }
        return prev;
      });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // Зависимость от наличия тиров — эффект должен (пере)запуститься
    // после того, как контейнер реально отрисован
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(tiers).length]);

  if (!Object.keys(tiers).length) return null;

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;
  const viewDuration = effEnd - effStart;

  return (
    <div className="tiers-container" ref={containerRef}>
      {Object.entries(tiers).map(([tierName, intervals]) => {
        const isCollapsed = !!collapsed[tierName];
        const visibleIntervals = intervals.filter(
          (iv) => iv.end > effStart && iv.start < effEnd,
        );
        return (
          <div
            key={tierName}
            className={`tier-with-label${isCollapsed ? " is-collapsed" : ""}`}
            data-tier={tierName}
            style={{
              height: isCollapsed ? COLLAPSED_TIER_HEIGHT : DEFAULT_TIER_HEIGHT,
            }}
          >
            <div className="tier-label" title={tierName}>
              {tierName}
            </div>
            <div className="tier-row">
              {visibleIntervals.map((interval, idx) => {
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
                    onClick={() =>
                      onSelectInterval && onSelectInterval(interval)
                    }
                    title={interval.text}
                  >
                    {interval.text}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TextGridTiers;
