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
} from "../../api/client";

const DEFAULT_SPECTROGRAM_PARAMS = {
  freq_max: 5000,
  window_length: 0.005,
  dynamic_range: 90,
};

const Sidebar = ({
  activeTrace,
  onSelectTrace,
  onTracesUpdate,
  frameNumber,
  spectrogramParams,
  onSpectrogramParamsChange,
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

  useEffect(() => {
    if (spectrogramParams) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalSpecParams(spectrogramParams);
    }
  }, [spectrogramParams]);

  const fetchTraces = useCallback(async () => {
    try {
      const data = await getTraces();
      const traceList = data.traces || [];
      setTraces(traceList);
      setTraceColors(data.colors || {});
      setDefaultTraceName(data.default || null);
      if (!initialized) {
        const defaultTrace = data.default || traceList[0];
        if (defaultTrace && !activeTrace) {
          onSelectTrace(defaultTrace);
        }
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
      onTracesUpdate && onTracesUpdate();
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
      if (activeTrace === oldName) {
        onSelectTrace(renameValue.trim());
      }
      onTracesUpdate && onTracesUpdate();
    } catch (err) {
      console.error("Failed to rename trace", err);
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete trace "${name}"?`)) return;
    try {
      await deleteTrace(name);
      await fetchTraces();
      if (activeTrace === name) {
        onSelectTrace(null);
      }
      onTracesUpdate && onTracesUpdate();
    } catch (err) {
      console.error("Failed to delete trace", err);
    }
  };

  const handleColorChange = async (name, color) => {
    try {
      await setTraceColor(name, color);
      setColorPickerVisible(null);
      await fetchTraces();
      onTracesUpdate && onTracesUpdate();
    } catch (err) {
      console.error("Failed to set color", err);
    }
  };

  const handleSetDefault = async (name) => {
    try {
      await setDefaultTrace(name);
      await fetchTraces();
      onTracesUpdate && onTracesUpdate();
    } catch (err) {
      console.error("Failed to set default trace", err);
    }
  };

  const handleClearFrame = async () => {
    if (!activeTrace || !frameNumber) return;
    if (
      !window.confirm(
        `Clear all points for trace "${activeTrace}" on frame ${frameNumber}?`,
      )
    )
      return;
    try {
      await clearFramePoints(activeTrace, frameNumber);
      onTracesUpdate && onTracesUpdate();
    } catch (err) {
      console.error("Failed to clear frame points", err);
    }
  };

  const handleSpecChange = (field, value) => {
    const newParams = { ...localSpecParams, [field]: value };
    setLocalSpecParams(newParams);
    if (onSpectrogramParamsChange) {
      onSpectrogramParamsChange(newParams);
    }
  };

  const handleSpecReset = () => {
    setLocalSpecParams(DEFAULT_SPECTROGRAM_PARAMS);
    if (onSpectrogramParamsChange) {
      onSpectrogramParamsChange(DEFAULT_SPECTROGRAM_PARAMS);
    }
  };

  const handleSpecApply = () => {
    // уже применено мгновенно, но оставим для явной фиксации
    if (onSpectrogramParamsChange) {
      onSpectrogramParamsChange(localSpecParams);
    }
  };

  return (
    <div
      style={{
        padding: "1rem",
        background: "#f5f5f5",
        height: "100%",
        minWidth: "220px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h3>Landmarks</h3>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ul style={{ listStyle: "none", padding: 0 }}>
          {traces.map((name) => (
            <li
              key={name}
              style={{
                padding: "4px 8px",
                cursor: "pointer",
                background: name === activeTrace ? "#d0d0ff" : "transparent",
                borderRadius: "4px",
                marginBottom: "2px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: traceColors[name] || "gray",
                  marginRight: 6,
                }}
              />
              {renameTarget === name ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => setRenameTarget(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(name);
                    if (e.key === "Escape") setRenameTarget(null);
                  }}
                  autoFocus
                  style={{ width: "100%" }}
                />
              ) : (
                <span onClick={() => onSelectTrace(name)} style={{ flex: 1 }}>
                  {name}
                </span>
              )}
              {name === defaultTraceName ? (
                <span title="Default trace" style={{ color: "gold" }}>
                  ⭐
                </span>
              ) : (
                <button
                  onClick={() => handleSetDefault(name)}
                  title="Set as default"
                  style={{
                    cursor: "pointer",
                    background: "none",
                    border: "none",
                    padding: "0 2px",
                    opacity: 0.5,
                  }}
                >
                  ⭐
                </button>
              )}
              <button
                onClick={() => {
                  setRenameTarget(name);
                  setRenameValue(name);
                }}
                title="Rename"
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: "0 2px",
                }}
              >
                ✏️
              </button>
              <button
                onClick={() => setColorPickerVisible(name)}
                title="Change color"
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: "0 2px",
                }}
              >
                🎨
              </button>
              <button
                onClick={() => handleDelete(name)}
                title="Delete trace"
                style={{
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                  padding: "0 2px",
                }}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>

        <div style={{ marginTop: "8px", display: "flex", gap: "4px" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New trace name"
            style={{ flex: 1 }}
          />
          <button onClick={handleCreate}>Add</button>
        </div>

        <div
          style={{
            marginTop: "12px",
            borderTop: "1px solid #ccc",
            paddingTop: "8px",
          }}
        >
          <button
            onClick={handleClearFrame}
            disabled={!activeTrace}
            style={{ width: "100%", marginBottom: "4px" }}
          >
            Clear Frame
          </button>
          <button
            onClick={() => {
              if (!activeTrace) return;
              if (
                !window.confirm(
                  `Remove all points from all frames for trace "${activeTrace}"?`,
                )
              )
                return;
              clearAllPoints(activeTrace).then(
                () => onTracesUpdate && onTracesUpdate(),
              );
            }}
            disabled={!activeTrace}
            style={{ width: "100%" }}
          >
            Clear All Frames
          </button>
        </div>

        {/* Spectrogram Settings */}
        <div
          style={{
            marginTop: "12px",
            borderTop: "1px solid #ccc",
            paddingTop: "8px",
          }}
        >
          <h4 style={{ margin: "0 0 4px 0" }}>Spectrogram</h4>
          <label style={{ display: "block", marginBottom: "4px" }}>
            Freq Max:
            <input
              type="number"
              value={localSpecParams.freq_max}
              onChange={(e) =>
                handleSpecChange("freq_max", parseFloat(e.target.value) || 0)
              }
              step="100"
              min="0"
              style={{ width: "80px", marginLeft: "4px" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "4px" }}>
            Window:
            <input
              type="number"
              value={localSpecParams.window_length}
              onChange={(e) =>
                handleSpecChange(
                  "window_length",
                  parseFloat(e.target.value) || 0.001,
                )
              }
              step="0.001"
              min="0.001"
              style={{ width: "80px", marginLeft: "4px" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "4px" }}>
            Dyn Range:
            <input
              type="number"
              value={localSpecParams.dynamic_range}
              onChange={(e) =>
                handleSpecChange(
                  "dynamic_range",
                  parseFloat(e.target.value) || 0,
                )
              }
              step="10"
              min="0"
              style={{ width: "80px", marginLeft: "4px" }}
            />
          </label>
          <div style={{ marginTop: "4px", display: "flex", gap: "4px" }}>
            <button onClick={handleSpecApply}>Apply</button>
            <button onClick={handleSpecReset}>Standards</button>
          </div>
        </div>
      </div>

      {colorPickerVisible && (
        <div
          style={{
            position: "fixed",
            top: "30%",
            left: "30%",
            background: "white",
            padding: "1rem",
            border: "1px solid #ccc",
            zIndex: 10,
          }}
        >
          <h4>Pick color for {colorPickerVisible}</h4>
          <input
            type="color"
            onChange={(e) =>
              handleColorChange(colorPickerVisible, e.target.value)
            }
          />
          <button onClick={() => setColorPickerVisible(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
