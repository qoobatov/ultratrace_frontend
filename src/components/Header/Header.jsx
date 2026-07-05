import { useState, useEffect, useRef } from "react";
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [inputValue, setInputValue] = useState(String(frame));

  const debounceRef = useRef(null);

  // Первоначальная загрузка списка файлов и методов
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    Promise.all([getStudyFiles(), getAvailableMethods()])
      .then(([filesData, methodsData]) => {
        setFiles(filesData);
        if (filesData.length > 0) setSelectedFile(filesData[0].index);
        setMethods(methodsData);
        if (methodsData.length > 0) setSelectedMethod(methodsData[0]);
      })
      .catch((err) => {
        setError("Failed to load study data");
        console.error(err);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleFrameInput = (e) => {
    const raw = e.target.value;
    setInputValue(raw);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const num = Number(raw);
      if (num >= 1) setFrame(num);
    }, 300);
  };

  const handleFileChange = async (e) => {
    const idx = Number(e.target.value);
    setSelectedFile(idx);
    setIsLoading(true);
    setError(null);
    try {
      await switchFile(idx);
      onFileChange && onFileChange();
      const newMethods = await getAvailableMethods();
      setMethods(newMethods);
      if (newMethods.length > 0) setSelectedMethod(newMethods[0]);
    } catch (err) {
      setError("Failed to switch file");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMethodChange = async (e) => {
    const method = e.target.value;
    setSelectedMethod(method);
    setIsLoading(true);
    setError(null);
    try {
      await changeMethod(method);
      if (onMethodChange) onMethodChange({ methodChanged: true });
    } catch (err) {
      setError("Failed to change method");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
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
          disabled={isLoading}
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
          disabled={isLoading}
        >
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button
          className="header-btn"
          onClick={() => {
            setIsLoading(true);
            try {
              onFileChange && onFileChange();
            } finally {
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
          title="Reload frames"
        >
          {isLoading ? "Loading…" : "↺ Reload"}
        </button>
      </div>

      {error && <div className="header-error">{error}</div>}

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
          value={inputValue}
          onChange={handleFrameInput}
          onBlur={() => setInputValue(String(frame))} // при потере фокуса синхронизируем
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
