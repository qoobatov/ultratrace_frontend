import { useState, useEffect, useRef, useCallback } from "react";
import "./TextGridTiers.css";

const DEFAULT_TIER_HEIGHT = 30;
const COLLAPSED_TIER_HEIGHT = 12;
const COLLAPSED_STORAGE_KEY = "ultratrace.collapsedTiers";
// const BOUNDARY_EPS = 1e-4;

const loadCollapsed = () => {
  try {
    const raw = sessionStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
};

const saveCollapsed = (state) => {
  try {
    sessionStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
};

const TextGridTiers = ({
  tiers,
  activeTier,
  onActivateTier,
  currentTime,
  duration,
  onSelectInterval,
  onEditInterval,
  viewStart,
  viewEnd,
  selectedInterval,
}) => {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [editing, setEditing] = useState(null); // { tier, idx, value, originalText }
  const [draggingEdge, setDraggingEdge] = useState(null); // {side:'left'|'right', tier}
  const containerRef = useRef(null);

  // Рефы для актуальных значений внутри глобальных mousemove/mouseup
  const selectedIntervalRef = useRef(selectedInterval);
  const tiersRef = useRef(tiers);
  const effStartRef = useRef(0);
  const effEndRef = useRef(0);

  useEffect(() => {
    selectedIntervalRef.current = selectedInterval;
  }, [selectedInterval]);
  useEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);

  const effStart = viewStart ?? 0;
  const effEnd = viewEnd ?? duration;
  useEffect(() => {
    effStartRef.current = effStart;
    effEndRef.current = effEnd;
  }, [effStart, effEnd]);

  // ── Toggle свёрнутости ───────────────────────────────────────────────
  const toggleCollapsed = useCallback((tierName) => {
    setCollapsed((prev) => {
      const isCollapsed = !!prev[tierName];
      const next = { ...prev };
      if (isCollapsed) delete next[tierName];
      else next[tierName] = true;
      saveCollapsed(next);
      return next;
    });
  }, []);

  const beginEdit = useCallback((tierName, idx, currentText) => {
    setEditing({
      tier: tierName,
      idx,
      value: currentText,
      originalText: currentText,
    });
  }, []);

  const commitEdit = useCallback(() => {
    setEditing((cur) => {
      if (!cur) return null;
      const trimmed = cur.value;
      if (trimmed !== cur.originalText) {
        onEditInterval?.(cur.tier, cur.idx, trimmed);
      }
      return null;
    });
  }, [onEditInterval]);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  // ── Scroll → collapse ────────────────────────────────────────────────
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
        let next = prev;
        if (shouldCollapse && !isCollapsed) {
          next = { ...prev, [tierName]: true };
        } else if (shouldExpand && isCollapsed) {
          next = { ...prev };
          delete next[tierName];
        }
        if (next !== prev) saveCollapsed(next);
        return next;
      });
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [tiers]);

  // ── Drag ручек выделения ─────────────────────────────────────────────
  const dragStateRef = useRef(null);
  const justDraggedRef = useRef(false);

  const startEdgeDrag = useCallback((side, tierName, e) => {
    e.stopPropagation();
    e.preventDefault();
    const rowEl = e.currentTarget.closest(".tier-row");
    if (!rowEl) return;
    const rowRect = rowEl.getBoundingClientRect();
    dragStateRef.current = {
      side,
      tierName,
      rowRect,
      moved: false,
      startX: e.clientX,
    };
    setDraggingEdge({ side, tierName });
  }, []);

  useEffect(() => {
    if (!draggingEdge) return;

    const onMove = (e) => {
      const st = dragStateRef.current;
      if (!st) return;
      const dx = Math.abs(e.clientX - st.startX);
      if (!st.moved && dx < 3) return;
      st.moved = true;
      justDraggedRef.current = true;

      const rect = st.rowRect;
      if (!rect || rect.width <= 0) return;
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const tStart = effStartRef.current;
      const tEnd = effEndRef.current;
      const timeAtCursor = tStart + ratio * (tEnd - tStart);

      const allIntervals = tiersRef.current[st.tierName] || [];
      if (!allIntervals.length) return;

      const cur = selectedIntervalRef.current;
      if (!cur || cur.tier !== st.tierName) return;

      // Текущий диапазон — в СЫРЫХ индексах (interval.idx)
      let i = Array.isArray(cur.intervalIndices) ? cur.intervalIndices[0] : -1;
      let j = Array.isArray(cur.intervalIndices) ? cur.intervalIndices[1] : -1;
      if (i < 0 || j < 0) return;

      if (st.side === "right") {
        // Ищем ближайшую правую границу (end) среди интервалов с idx >= i
        let newJ = j;
        let bestDist = Infinity;
        for (const iv of allIntervals) {
          if (iv.idx < i) continue;
          const d = Math.abs(iv.end - timeAtCursor);
          if (d < bestDist) {
            bestDist = d;
            newJ = iv.idx;
          }
        }
        j = newJ;
      } else {
        // Ищем ближайшую левую границу (start) среди интервалов с idx <= j
        let newI = i;
        let bestDist = Infinity;
        for (const iv of allIntervals) {
          if (iv.idx > j) continue;
          const d = Math.abs(iv.start - timeAtCursor);
          if (d < bestDist) {
            bestDist = d;
            newI = iv.idx;
          }
        }
        i = newI;
      }

      if (i > j) [i, j] = [j, i];

      const firstIv = allIntervals.find((x) => x.idx === i);
      const lastIv = allIntervals.find((x) => x.idx === j);
      if (!firstIv || !lastIv) return;
      const text = allIntervals
        .filter((x) => x.idx >= i && x.idx <= j)
        .map((x) => x.text)
        .filter(Boolean)
        .join(" ");

      onSelectInterval?.({
        tier: st.tierName,
        start: firstIv.start,
        end: lastIv.end,
        text,
        intervalIndices: [i, j],
      });
    };

    const onUp = () => {
      dragStateRef.current = null;
      setDraggingEdge(null);
      // Сбросим флаг чуть позже, чтобы click после mouseup не отработал
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingEdge, onSelectInterval]);

  // Блокируем click по интервалу сразу после drag
  const handleContainerClickCapture = useCallback((e) => {
    if (justDraggedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      justDraggedRef.current = false;
    }
  }, []);

  if (!tiers || !Object.keys(tiers).length) return null;

  const viewDuration = effEnd - effStart;

  return (
    <div
      className="tiers-container"
      ref={containerRef}
      onClickCapture={handleContainerClickCapture}
    >
      {Object.entries(tiers).map(([tierName, intervals]) => {
        const isCollapsed = !!collapsed[tierName];
        const isActive = tierName === activeTier;
        const visibleIntervals = intervals.filter(
          (iv) => iv.end > effStart && iv.start < effEnd,
        );

        // Границы выделения — только для активного тира
        const showHandles =
          !isCollapsed &&
          selectedInterval &&
          selectedInterval.tier === tierName &&
          Array.isArray(selectedInterval.intervalIndices);

        const selStartRatio = showHandles
          ? (selectedInterval.start - effStart) / viewDuration
          : 0;
        const selEndRatio = showHandles
          ? (selectedInterval.end - effStart) / viewDuration
          : 0;

        return (
          <div
            key={tierName}
            className={`tier-with-label${isCollapsed ? " is-collapsed" : ""}`}
            data-tier={tierName}
            style={{
              height: isCollapsed ? COLLAPSED_TIER_HEIGHT : DEFAULT_TIER_HEIGHT,
            }}
            onClick={() => onActivateTier?.(tierName)}
          >
            <div
              className={`tier-label${isActive ? " is-active" : ""}`}
              onDoubleClick={() => toggleCollapsed(tierName)}
              title={`${tierName} (double-click to collapse)`}
            >
              <button
                type="button"
                className="tier-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(tierName);
                }}
                title={isCollapsed ? "Expand tier" : "Collapse tier"}
                aria-label={isCollapsed ? "Expand tier" : "Collapse tier"}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
              <span className="tier-label-text">{tierName}</span>
            </div>
            <div className="tier-row">
              {visibleIntervals.map((interval, idx) => {
                const isSelected =
                  selectedInterval &&
                  selectedInterval.tier === tierName &&
                  Array.isArray(selectedInterval.intervalIndices) &&
                  interval.idx >= selectedInterval.intervalIndices[0] &&
                  interval.idx <= selectedInterval.intervalIndices[1];

                const isCurrent =
                  !isSelected &&
                  currentTime >= interval.start &&
                  currentTime < interval.end;

                const clampedStart = Math.max(interval.start, effStart);
                const clampedEnd = Math.min(interval.end, effEnd);
                const left = viewDuration
                  ? ((clampedStart - effStart) / viewDuration) * 100
                  : 0;
                const width = viewDuration
                  ? ((clampedEnd - clampedStart) / viewDuration) * 100
                  : 0;

                return (
                  <div
                    key={idx}
                    className={`tier-interval${isSelected ? " is-selected" : isCurrent ? " is-current" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onClick={() =>
                      onSelectInterval &&
                      onSelectInterval({
                        ...interval,
                        intervalIndices: [interval.idx, interval.idx],
                      })
                    }
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      beginEdit(tierName, interval.idx, interval.text);
                    }}
                    title={`${interval.text} (double-click to edit)`}
                  >
                    {interval.text}
                  </div>
                );
              })}

              {showHandles && selStartRatio >= 0 && selStartRatio <= 1 && (
                <div
                  className={`tier-handle tier-handle-left${draggingEdge?.side === "left" && draggingEdge?.tier === tierName ? " is-dragging" : ""}`}
                  style={{ left: `${selStartRatio * 100}%` }}
                  onMouseDown={(e) => startEdgeDrag("left", tierName, e)}
                  title="Drag to extend selection left"
                >
                  ◀
                </div>
              )}
              {editing &&
                editing.tier === tierName &&
                (() => {
                  const iv = intervals.find((x) => x.idx === editing.idx);
                  if (!iv) return null;
                  const s = Math.max(iv.start, effStart);
                  const left = viewDuration
                    ? ((s - effStart) / viewDuration) * 100
                    : 0;
                  return (
                    <input
                      className="tier-interval-editor"
                      style={{ left: `${left}%` }}
                      value={editing.value}
                      onChange={(e) =>
                        setEditing((cur) =>
                          cur ? { ...cur, value: e.target.value } : cur,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      spellCheck={false}
                    />
                  );
                })()}

              {showHandles && selEndRatio >= 0 && selEndRatio <= 1 && (
                <div
                  className={`tier-handle tier-handle-right${draggingEdge?.side === "right" && draggingEdge?.tier === tierName ? " is-dragging" : ""}`}
                  style={{ left: `${selEndRatio * 100}%` }}
                  onMouseDown={(e) => startEdgeDrag("right", tierName, e)}
                  title="Drag to extend selection right"
                >
                  ▶
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TextGridTiers;
