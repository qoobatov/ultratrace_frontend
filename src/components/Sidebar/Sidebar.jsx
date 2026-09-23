import { useState, useEffect, useRef } from "react";
import {
  createTrace,
  renameTrace,
  deleteTrace,
  setTraceColor,
  setDefaultTrace,
  clearFramePoints,
  clearAllPoints,
  exportContours,
} from "../../api/client";
import { HexColorPicker } from "react-colorful";
import "./Sidebar.css";

const Sidebar = ({
  activeTrace,
  onSelectTrace,
  traces,
  traceColors,
  defaultTraceName,
  hiddenTraces,
  onToggleTraceVisibility,
  onTracesUpdate,
  frameNumber,
  offset,
  onOffsetApply,
}) => {
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [colorPickerVisible, setColorPickerVisible] = useState(null);
  const [pendingColor, setPendingColor] = useState("#ffffff");
  const [localOffset, setLocalOffset] = useState(offset || 0);

  const cancelRef = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOffset(offset);
  }, [offset]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTrace(newName.trim());
      setNewName("");
      await onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to create trace", err);
    }
  };

  const handleRename = async (oldName) => {
    const next = renameValue.trim();
    if (!next || next === oldName) {
      setRenameTarget(null);
      setRenameValue("");
      return;
    }
    try {
      await renameTrace(oldName, next);
      setRenameTarget(null);
      setRenameValue("");
      await onTracesUpdate?.();
      if (activeTrace === oldName) onSelectTrace(next);
    } catch (err) {
      console.error("Failed to rename trace", err);
    }
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Delete trace "${name}"?`)) return;
    try {
      await deleteTrace(name);
      await onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to delete trace", err);
    }
  };

  const handleColorChange = async (name, color) => {
    try {
      await setTraceColor(name, color);
      setColorPickerVisible(null);
      await onTracesUpdate?.();
    } catch (err) {
      console.error("Failed to set color", err);
    }
  };

  const openColorPicker = (name) => {
    setColorPickerVisible(name);
    setPendingColor(traceColors[name] || "#ffffff");
  };

  const handleSetDefault = async (name) => {
    try {
      await setDefaultTrace(name);
      await onTracesUpdate?.();
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

  return (
    <div className="sidebar">
      {/* ── Zone 1: Landmarks ── */}
      <div className="sidebar-zone zone-landmarks">
        <div className="sidebar-section-title">Landmarks</div>
        <ul className="trace-list">
          {traces.map((name) => {
            const isHidden = hiddenTraces?.has(name);
            return (
              <li
                key={name}
                className={`trace-item ${
                  name === activeTrace ? "active" : ""
                } ${isHidden ? "trace-hidden" : ""}`}
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
                    onBlur={() => {
                      if (cancelRef.current) {
                        cancelRef.current = false;
                        setRenameTarget(null);
                        return;
                      }
                      handleRename(name);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.target.blur();
                      }
                      if (e.key === "Escape") {
                        cancelRef.current = true;
                        e.target.blur();
                      }
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
                  className={`icon-btn ${isHidden ? "hidden-trace" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTraceVisibility?.(name);
                  }}
                  title={isHidden ? "Show trace" : "Hide trace"}
                >
                  {isHidden ? "🚫" : "👁"}
                </button>
                <button
                  className={`icon-btn ${
                    name === defaultTraceName ? "active-star" : ""
                  }`}
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
                  onClick={() => openColorPicker(name)}
                  title="Change color"
                  style={{ color: traceColors[name] || "#6c7086" }}
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
            );
          })}
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
          <div className="sidebar-btn-row export-row">
            <button
              className="sidebar-btn"
              onClick={exportContours}
              title="Export all annotated points to CSV"
            >
              ↓ Export CSV
            </button>
          </div>
        </div>
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
          <button
            className="sidebar-btn"
            onClick={() => onOffsetApply(localOffset)}
          >
            Apply
          </button>
        </div>
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
            <div className="color-picker-body">
              <HexColorPicker color={pendingColor} onChange={setPendingColor} />
            </div>
            <div className="color-picker-hex">
              <span
                className="color-picker-preview"
                style={{ background: pendingColor }}
              />
              <input
                className="sidebar-input color-picker-hex-input"
                type="text"
                value={pendingColor}
                onChange={(e) => setPendingColor(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="sidebar-btn-row">
              <button
                className="sidebar-btn"
                onClick={() =>
                  handleColorChange(colorPickerVisible, pendingColor)
                }
              >
                OK
              </button>
              <button
                className="sidebar-btn"
                onClick={() => setColorPickerVisible(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
