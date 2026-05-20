import { useState, useEffect } from "react";
import {
  getStudyFiles,
  switchFile,
  getAvailableMethods,
  changeMethod,
} from "../../api/client";

const Header = ({ frame, setFrame, onFileChange, onMethodChange }) => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(0);
  const [methods, setMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState("");

  // Загружаем список файлов при монтировании
  useEffect(() => {
    getStudyFiles().then((data) => {
      setFiles(data);
      if (data.length > 0) {
        setSelectedFile(data[0].index);
      }
    });
    getAvailableMethods().then(setMethods);
  }, []);

  const handleFileChange = async (e) => {
    const idx = Number(e.target.value);
    setSelectedFile(idx);
    await switchFile(idx);
    // Сообщаем родителю, чтобы обновил данные (трассы, цвета, кадры)
    onFileChange && onFileChange();
    // После смены файла обновим список методов
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
    <header
      style={{
        padding: "1rem",
        background: "#f0f0f0",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <h1 style={{ margin: 0 }}>UltraTrace Web</h1>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <select value={selectedFile} onChange={handleFileChange}>
          {files.map((f) => (
            <option key={f.index} value={f.index}>
              {f.name}
            </option>
          ))}
        </select>

        <select value={selectedMethod} onChange={handleMethodChange}>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <button onClick={() => onFileChange && onFileChange()}>
          Load frames
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button onClick={() => setFrame((f) => Math.max(1, f - 1))}>
          Prev
        </button>
        <input
          type="number"
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          style={{ width: "60px", margin: "0 8px" }}
        />
        <button onClick={() => setFrame((f) => f + 1)}>Next</button>
      </div>
    </header>
  );
};

export default Header;
