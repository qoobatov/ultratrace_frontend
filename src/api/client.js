import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

const client = axios.create({
  baseURL: API_BASE,
});

// --- Фреймы ---
export const getFrameUrl = (frameNumber) => `${API_BASE}/frames/${frameNumber}`;
export const getFrameTimes = async () => {
  const response = await client.get("/frames/times");
  return response.data;
};

// --- Трассы ---
export const getTraces = async () => {
  const response = await client.get("/contours/traces");
  return response.data;
};

export const createTrace = async (name, color = null) => {
  const response = await client.post("/contours/traces", { name, color });
  return response.data;
};

export const renameTrace = async (oldName, newName) => {
  await client.put("/contours/traces/rename", {
    old_name: oldName,
    new_name: newName,
  });
};

export const deleteTrace = async (name) => {
  await client.delete(`/contours/traces/${name}`);
};

export const setTraceColor = async (name, color) => {
  await client.put(`/contours/traces/${name}/color`, { color });
};

export const setDefaultTrace = async (name) => {
  await client.put(`/contours/traces/${name}/set-default`);
};

export const clearAllPoints = async (traceName) => {
  await client.delete(`/contours/traces/${traceName}/frames`);
};

export const clearFramePoints = async (traceName, frameNumber) => {
  await client.delete(`/contours/traces/${traceName}/frames/${frameNumber}`);
};

// --- Точки ---
export const getPoints = async (traceName, frameNumber) => {
  const response = await client.get(
    `/contours/traces/${traceName}/frames/${frameNumber}`,
  );
  return response.data.points;
};

export const savePoints = async (traceName, frameNumber, points) => {
  await client.put(`/contours/traces/${traceName}/frames/${frameNumber}`, {
    points,
  });
};

// --- Аудио ---
export const getAudioUrl = () => `${API_BASE}/audio/file`;
export const getAudioSegmentUrl = (start, end) =>
  `${API_BASE}/audio/segment?start=${start}&end=${end}`;
export const getAudioInfo = async () => {
  const response = await client.get("/audio/info");
  return response.data;
};

// --- TextGrid ---
export const getTextGridIntervals = async () => {
  const response = await client.get("/textgrid/intervals");
  return response.data;
};

// --- Спектрограмма ---
export const getSpectrogramUrl = () => `${API_BASE}/spectrogram/`;

// --- Study / методы / файлы (для Header) ---
export const getStudyFiles = async () => {
  const response = await client.get("/study/files");
  return response.data;
};

export const switchFile = async (index) => {
  await client.post(`/study/switch-file?index=${index}`);
};

export const getAvailableMethods = async () => {
  const response = await client.get("/study/methods");
  return response.data;
};

export const changeMethod = async (method) => {
  await client.post(
    `/study/change-method?method=${encodeURIComponent(method)}`,
  );
};

// --- Offset ---
export const setFrameOffset = async (offsetMs) => {
  await client.post(`/study/set-offset?offset_ms=${offsetMs}`);
};

export const getStudyOffset = async () => {
  const response = await client.get("/study/offset");
  return response.data;
};

export default client;
