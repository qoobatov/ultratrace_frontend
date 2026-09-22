import { useState, useEffect, useRef, useCallback } from "react";
import "./SpectrogramPanel.css";

const STORAGE_KEY = "ultratrace.spectrogramPanelPos";
const PANEL_MARGIN = 4;

const DEFAULT_SPECTROGRAM_PARAMS = {
  freq_max: 5000,
  window_length: 0.005,
  dynamic_range: 90,
  colormap: "grayscale",
  threshold: 0,
};

const COLORMAP_OPTIONS = [
  { value: "grayscale", label: "Grayscale" },
  { value: "thermal", label: "Thermal" },
  { value: "inferno", label: "Inferno" },
  { value: "viridis", label: "Viridis" },
];

const loadSavedPosition = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      typeof p?.x === "number" &&
      typeof p?.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y)
    ) {
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
};

const SpectrogramPanel = ({
  open,
  anchor,
  onClose,
  spectrogramParams,
  onSpectrogramParamsChange,
}) => {
  const [position, setPosition] = useState(loadSavedPosition);
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Локальный state формы (для text-инпутов, применяется по Apply)
  const [localSpecParams, setLocalSpecParams] = useState(
    spectrogramParams || DEFAULT_SPECTROGRAM_PARAMS,
  );

  // Синхронизация с внешними изменениями
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (spectrogramParams) setLocalSpecParams(spectrogramParams);
  }, [spectrogramParams]);

  // Расчёт стартовой позиции от кнопки, если ещё не сохранена
  useEffect(() => {
    if (!open) return;
    if (position) return;
    if (!anchor) return;
    const panel = panelRef.current;
    const w = panel?.offsetWidth || 260;
    const h = panel?.offsetHeight || 240;
    let x = anchor.right - w;
    let y = anchor.bottom + 6;
    x = Math.max(
      PANEL_MARGIN,
      Math.min(window.innerWidth - w - PANEL_MARGIN, x),
    );
    y = Math.max(
      PANEL_MARGIN,
      Math.min(window.innerHeight - h - PANEL_MARGIN, y),
    );
    setPosition({ x, y });
  }, [open, anchor, position]);

  // Esc закрывает
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Перетаскивание за заголовок
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const panel = panelRef.current;
      if (!panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      let x = e.clientX - dragOffsetRef.current.x;
      let y = e.clientY - dragOffsetRef.current.y;
      x = Math.max(
        PANEL_MARGIN,
        Math.min(window.innerWidth - w - PANEL_MARGIN, x),
      );
      y = Math.max(
        PANEL_MARGIN,
        Math.min(window.innerHeight - h - PANEL_MARGIN, y),
      );
      setPosition({ x, y });
    };
    const onUp = () => {
      setDragging(false);
      setPosition((p) => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        } catch {
          /* ignore */
        }
        return p;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const handleHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragging(true);
    e.preventDefault();
  }, []);

  const handleSpecChange = (field, value) => {
    setLocalSpecParams((p) => ({ ...p, [field]: value }));
  };

  const handleSpecLiveChange = (field, value) => {
    const updated = { ...localSpecParams, [field]: value };
    setLocalSpecParams(updated);
    onSpectrogramParamsChange?.(updated);
  };

  const handleSpecReset = () => {
    setLocalSpecParams(DEFAULT_SPECTROGRAM_PARAMS);
    onSpectrogramParamsChange?.(DEFAULT_SPECTROGRAM_PARAMS);
  };

  const handleSpecApply = () => {
    onSpectrogramParamsChange?.(localSpecParams);
  };

  if (!open) return null;

  const style = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : { left: 0, top: 0, visibility: "hidden" };

  return (
    <div ref={panelRef} className="spectrogram-panel" style={style}>
      <div
        className={`spectrogram-panel-header${dragging ? " dragging" : ""}`}
        onMouseDown={handleHeaderMouseDown}
      >
        <span className="spectrogram-panel-grip" aria-hidden="true">
          ⠿
        </span>
        <span className="spectrogram-panel-title">Spectrogram params</span>
        <button
          className="spectrogram-panel-close"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="spectrogram-panel-body">
        <div className="param-row">
          <span className="param-label">Freq Max</span>
          <input
            className="param-input"
            type="number"
            value={localSpecParams.freq_max}
            onChange={(e) =>
              handleSpecChange("freq_max", parseFloat(e.target.value) || 0)
            }
            onKeyUp={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown")
                handleSpecLiveChange(
                  "freq_max",
                  parseFloat(e.target.value) || 0,
                );
            }}
            step="10"
            min="0"
          />
        </div>

        <div className="param-row">
          <span className="param-label">Window</span>
          <input
            className="param-input"
            type="number"
            value={localSpecParams.window_length}
            onChange={(e) =>
              handleSpecChange(
                "window_length",
                parseFloat(e.target.value) || 0.001,
              )
            }
            onKeyUp={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown")
                handleSpecLiveChange(
                  "window_length",
                  parseFloat(e.target.value) || 0.001,
                );
            }}
            step="0.001"
            min="0.001"
          />
        </div>

        <div className="param-row">
          <span className="param-label">Dyn Range</span>
          <input
            className="param-input"
            type="number"
            value={localSpecParams.dynamic_range}
            onChange={(e) =>
              handleSpecChange("dynamic_range", parseFloat(e.target.value) || 0)
            }
            onKeyUp={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown")
                handleSpecLiveChange(
                  "dynamic_range",
                  parseFloat(e.target.value) || 0,
                );
            }}
            step="1"
            min="0"
          />
        </div>

        <div className="param-row">
          <span className="param-label">Colormap</span>
          <select
            className="param-input"
            value={localSpecParams.colormap || "grayscale"}
            onChange={(e) => handleSpecLiveChange("colormap", e.target.value)}
          >
            {COLORMAP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="param-row">
          <span className="param-label">Threshold</span>
          <input
            className="param-input param-range"
            type="range"
            min="0"
            max="255"
            step="5"
            value={localSpecParams.threshold ?? 0}
            onChange={(e) =>
              handleSpecLiveChange(
                "threshold",
                parseInt(e.target.value, 10) || 0,
              )
            }
          />
          <span className="param-value">{localSpecParams.threshold ?? 0}</span>
        </div>

        <div className="sidebar-btn-row">
          <button className="sidebar-btn" onClick={handleSpecApply}>
            Apply
          </button>
          <button className="sidebar-btn" onClick={handleSpecReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpectrogramPanel;
