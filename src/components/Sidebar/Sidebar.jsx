import { useState, useEffect, useCallback } from "react";
import {
  getTraces,
  createTrace,
  renameTrace,
  deleteTrace,
  setTraceColor,
  setDefaultTrace,
  clearFramePoints,
  clearAllPoints,
  getTextGridIntervals,
  getFrameTimes,
} from "../../api/client";
import "./Sidebar.css";

const DEFAULT_SPECTROGRAM_PARAMS = {
  freq_max: 5000,
  window_length: 0.005,
  dynamic_range: 90,
};

const DISPLAY_TIERS = ["sentence", "word", "orthographic vowel"];

const Sidebar = ({
  activeTrace,
  onSelectTrace,
  onTracesUpdate,
  frameNumber,
  spectrogramParams,
  onSpectrogramParamsChange,
  offset,
  onOffsetApply,
}) => {
  const [traces, setTraces] = useState([]);
  const [traceColors, setTraceColors] = useState({});
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [colorPickerVisible, setColorPickerVisible] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [defaultTraceName, setDefaultTraceName] = useState(null);
  const [localSpecParams, setLocalSpecParams] = useState(
    spectrogramParams || DEFAULT_SPECTROGRAM_PARAMS,
  );
  const [localOffset, setLocalOffset] = useState(offset || 0);

  // Annotations state
  const [tierIntervals, setTierIntervals] = useState({});
  const [frameTimes, setFrameTimes] = useState([]);
  const [currentIndices, setCurrentIndices] = useState({});

  useEffect(() => {
    const loadStats = async () => {
      try {
        const intervals = await getTextGridIntervals();
        const ftData = await getFrameTimes();
        const times = ftData.times || [];
        setFrameTimes(times);

        const grouped = {};
        intervals.forEach((item) => {
          if (!grouped[item.tier]) grouped[item.tier] = [];
          grouped[item.tier].push(item);
        });
        Object.keys(grouped).forEach((tier) => {
          grouped[tier].sort((a, b) => a.start - b.start);
        });
        setTierIntervals(grouped);
      } catch (err) {
        console.error("Failed to load TextGrid stats", err);
      }
    };
    loadStats();
  }, []);

  useEffect(() => {
    if (!frameTimes.length || !Object.keys(tierIntervals).length) return;
    const t = frameTimes[frameNumber];
    if (t == null) return;

    const indices = {};
    Object.entries(tierIntervals).forEach(([tier, intervals]) => {
      indices[tier] = intervals.findIndex((iv) => t >= iv.start && t < iv.end);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentIndices(indices);
  }, [frameNumber, frameTimes, tierIntervals]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (spectrogramParams) setLocalSpecParams(spectrogramParams);
  }, [spectrogramParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOffset(offset);
  }, [offset]);

  const fetchTraces = useCallback(async () => {
    try {
      const data = await getTraces();
      const traceList = data.traces || [];
      setTraces(traceList);
      setTraceColors(data.colors || {});
      setDefaultTraceName(data.default || null);
      if (!initialized) {
        const defaultTrace = data.default || traceList[0];
        if (defaultTrace && !activeTrace) onSelectTrace(defaultTrace);
        setInitialized(true);
      }
    } catch (err) {
      console.error("Failed to fetch traces", err);
    }
  }, [activeTrace, onSelectTrace, initialized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTraces();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTrace(newName.trim());
      setNewName("");
      await fetchTraces();
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to create trace", err);
    }
  };

  const handleRename = async (oldName) => {
    if (!renameValue.trim()) return;
    try {
      await renameTrace(oldName, renameValue.trim());
      setRenameTarget(null);
      setRenameValue("");
      await fetchTraces();
      if (activeTrace === oldName) onSelectTrace(renameValue.trim());
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to rename trace", err);
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete trace "${name}"?`)) return;
    try {
      await deleteTrace(name);
      await fetchTraces();
      if (activeTrace === name) onSelectTrace(null);
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to delete trace", err);
    }
  };

  const handleColorChange = async (name, color) => {
    try {
      await setTraceColor(name, color);
      setColorPickerVisible(null);
      await fetchTraces();
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to set color", err);
    }
  };

  const handleSetDefault = async (name) => {
    try {
      await setDefaultTrace(name);
      await fetchTraces();
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to set default trace", err);
    }
  };

  const handleClearFrame = async () => {
    if (!activeTrace || !frameNumber) return;
    if (
      !window.confirm(
        `Clear points for "${activeTrace}" on frame ${frameNumber}?`,
      )
    )
      return;
    try {
      await clearFramePoints(activeTrace, frameNumber);
      onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to clear frame points", err);
    }
  };

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

  return (
    <div className="sidebar">
      {/* ── Zone 1: Landmarks ── */}
      <div className="sidebar-zone zone-landmarks">
        <div className="sidebar-section-title">Landmarks</div>
        <ul className="trace-list">
          {traces.map((name) => (
            <li
              key={name}
              className={`trace-item ${name === activeTrace ? "active" : ""}`}
            >
              <span
                className="trace-dot"
                style={{ background: traceColors[name] || "#6c7086" }}
              />
              {renameTarget === name ? (
                <input
                  className="trace-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => setRenameTarget(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(name);
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className="trace-name"
                  onClick={() => onSelectTrace(name)}
                >
                  {name}
                </span>
              )}
              <button
                className={`icon-btn ${name === defaultTraceName ? "active-star" : ""}`}
                onClick={() => handleSetDefault(name)}
                title="Set as default"
              >
                ★
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  setRenameTarget(name);
                  setRenameValue(name);
                }}
                title="Rename"
              >
                ✎
              </button>
              <button
                className="icon-btn"
                onClick={() => setColorPickerVisible(name)}
                title="Change color"
              >
                ◉
              </button>
              <button
                className="icon-btn"
                onClick={() => handleDelete(name)}
                title="Delete"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="add-trace-row">
          <input
            className="sidebar-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New trace name"
          />
          <button className="sidebar-btn" onClick={handleCreate}>
            Add
          </button>
        </div>
        <div className="sidebar-btn-row">
          <button
            className="sidebar-btn danger"
            onClick={handleClearFrame}
            disabled={!activeTrace}
          >
            Clear Frame
          </button>
          <button
            className="sidebar-btn danger"
            disabled={!activeTrace}
            onClick={() => {
              if (!activeTrace) return;
              if (!window.confirm(`Remove all points for "${activeTrace}"?`))
                return;
              clearAllPoints(activeTrace).then(() => onTracesUpdate?.());
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* ── Zone 2: Spectrogram params ── */}
      <div className="sidebar-zone zone-spectrogram">
        <div className="sidebar-section-title">Spectrogram</div>
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
        <div className="sidebar-btn-row">
          <button className="sidebar-btn" onClick={handleSpecApply}>
            Apply
          </button>
          <button className="sidebar-btn" onClick={handleSpecReset}>
            Reset
          </button>
        </div>
      </div>

      {/* ── Zone 3: Annotations ── */}
      <div className="sidebar-zone zone-annotations">
        <div className="sidebar-section-title">Annotations</div>
        {DISPLAY_TIERS.map((tierName) => {
          const intervals = tierIntervals[tierName] || [];
          const idx = currentIndices[tierName] ?? -1;
          return (
            <div key={tierName} className="annotation-row">
              <span className="annotation-label">{tierName}</span>
              <span className="annotation-badge">
                {idx >= 0 ? idx + 1 : "—"} / {intervals.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Zone 4: Offset ── */}
      <div className="sidebar-zone zone-offset">
        <div className="sidebar-section-title">Offset</div>
        <div className="offset-row">
          <input
            className="sidebar-input"
            type="number"
            value={localOffset}
            onChange={(e) => setLocalOffset(Number(e.target.value))}
            step="1"
          />
          <span className="offset-unit">ms</span>
        </div>
        {/* <button
          className="sidebar-btn"
          onClick={() => onOffsetApply(localOffset)}
        >
          Apply
        </button> */}
      </div>

      {/* ── Color picker modal ── */}
      {colorPickerVisible && (
        <div
          className="color-picker-overlay"
          onClick={() => setColorPickerVisible(null)}
        >
          <div
            className="color-picker-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="color-picker-title">
              Color for "{colorPickerVisible}"
            </div>
            <input
              type="color"
              defaultValue={traceColors[colorPickerVisible] || "#ffffff"}
              onChange={(e) =>
                handleColorChange(colorPickerVisible, e.target.value)
              }
            />
            <button
              className="sidebar-btn"
              onClick={() => setColorPickerVisible(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
