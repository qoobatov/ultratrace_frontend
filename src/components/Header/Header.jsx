import { useState, useEffect } from "react";
import {
  getStudyFiles,
  switchFile,
  getAvailableMethods,
  changeMethod,
} from "../../api/client";
import "./Header.css";

const Header = ({ frame, setFrame, onFileChange, onMethodChange }) => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(0);
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("");

  useEffect(() => {
    getStudyFiles().then((data) => {
      setFiles(data);
      if (data.length > 0) setSelectedFile(data[0].index);
    });
    getAvailableMethods().then(setMethods);
  }, []);

  const handleFileChange = async (e) => {
    const idx = Number(e.target.value);
    setSelectedFile(idx);
    await switchFile(idx);
    onFileChange && onFileChange();
    const newMethods = await getAvailableMethods();
    setMethods(newMethods);
    if (newMethods.length > 0) setSelectedMethod(newMethods[0]);
  };

  const handleMethodChange = async (e) => {
    const method = e.target.value;
    setSelectedMethod(method);
    await changeMethod(method);
    onMethodChange && onMethodChange();
  };

  return (
    <header className="header">
      <span className="header-logo">UltraTrace</span>

      <div className="header-divider" />

      <div className="header-group">
        <select
          className="header-select"
          value={selectedFile}
          onChange={handleFileChange}
        >
          {files.map((f) => (
            <option key={f.index} value={f.index}>
              {f.name}
            </option>
          ))}
        </select>

        <select
          className="header-select"
          value={selectedMethod}
          onChange={handleMethodChange}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button
          className="header-btn"
          onClick={() => onFileChange && onFileChange()}
          title="Reload frames"
        >
          ↺ Reload
        </button>
      </div>

      <div className="header-divider" />

      <div className="header-group">
        <button
          className="header-btn icon"
          onClick={() => setFrame((f) => Math.max(1, f - 1))}
          title="Previous frame"
        >
          ‹
        </button>
        <input
          className="header-frame-input"
          type="number"
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          title="Frame number"
        />
        <button
          className="header-btn icon"
          onClick={() => setFrame((f) => f + 1)}
          title="Next frame"
        >
          ›
        </button>
      </div>

      <div className="header-spacer" />
    </header>
  );
};

export default Header;
