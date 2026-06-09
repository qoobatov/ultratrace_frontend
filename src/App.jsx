import { useState, useEffect, useCallback, useRef } from "react";
import FrameCanvas from "./components/FrameViewer/FrameCanvas";
import Sidebar from "./components/Sidebar/Sidebar";
import Timeline from "./components/Timeline/Timeline";
import Header from "./components/Header/Header";
import {
  getTraces,
  getFrameTimes,
  getStudyOffset,
  setFrameOffset,
} from "./api/client";
import "./App.css";

function App() {
  const [frame, setFrame] = useState(1);
  const [activeTrace, setActiveTrace] = useState(null);
  const [traceColors, setTraceColors] = useState({});
  const [pointsVersion, setPointsVersion] = useState(0);
  const [frameTimes, setFrameTimes] = useState([]);
  const [spectrogramParams, setSpectrogramParams] = useState({
    freq_max: 5000,
    window_length: 0.005,
    dynamic_range: 90,
  });
  const [offset, setOffset] = useState(0);

  const timelineRef = useRef(null);

  const setFrameAndSync = useCallback((newFrame) => {
    const fn = typeof newFrame === "function" ? newFrame : () => newFrame;
    setFrame((prev) => {
      const next = fn(prev);
      if (timelineRef.current && !timelineRef.current.isPlaying?.()) {
        timelineRef.current.seekToFrame(next);
      }
      return next;
    });
  }, []);

  const refreshFrameTimes = useCallback(async () => {
    try {
      const data = await getFrameTimes();
      setFrameTimes(data.times || []);
    } catch (err) {
      console.error("Failed to refresh frame times", err);
    }
  }, []);

  const loadOffset = useCallback(async () => {
    try {
      const res = await getStudyOffset();
      setOffset(res.offset);
    } catch (err) {
      console.error("Failed to load offset", err);
    }
  }, []);

  const fullRefresh = useCallback(async () => {
    try {
      const ftData = await getFrameTimes();
      setFrameTimes(ftData.times || []);
      setFrame(1);
      const traceData = await getTraces();
      setTraceColors(traceData.colors || {});
      if (!activeTrace) {
        const def =
          traceData.default || (traceData.traces && traceData.traces[0]);
        if (def) setActiveTrace(def);
      }
      setPointsVersion((v) => v + 1);
      await loadOffset();
    } catch (err) {
      console.error("Full refresh failed", err);
    }
  }, [activeTrace, loadOffset]);

  useEffect(() => {
    fullRefresh();
  }, []);

  const handleSelectTrace = (name) => setActiveTrace(name);

  const refreshTraces = async () => {
    try {
      const data = await getTraces();
      setTraceColors(data.colors || {});
      setPointsVersion((v) => v + 1);
    } catch (err) {
      console.error("Failed to refresh traces", err);
    }
  };

  const handleOffsetApply = async (newOffsetMs) => {
    try {
      await setFrameOffset(newOffsetMs);
      setOffset(newOffsetMs);
      refreshFrameTimes();
    } catch (err) {
      console.error("Failed to apply offset", err);
    }
  };

  return (
    <div className="app-root">
      <Header
        frame={frame}
        setFrame={setFrameAndSync}
        onFileChange={fullRefresh}
        onMethodChange={fullRefresh}
      />
      <div className="app-body">
        <Sidebar
          activeTrace={activeTrace}
          onSelectTrace={handleSelectTrace}
          onTracesUpdate={refreshTraces}
          frameNumber={frame}
          spectrogramParams={spectrogramParams}
          onSpectrogramParamsChange={setSpectrogramParams}
          offset={offset}
          onOffsetApply={handleOffsetApply}
        />
        <main className="app-main">
          <div className="app-canvas-area">
            <FrameCanvas
              frameNumber={frame}
              activeTrace={activeTrace}
              traceColor={traceColors[activeTrace] || "red"}
              pointsVersion={pointsVersion}
            />
          </div>
          <Timeline
            ref={timelineRef}
            frame={frame}
            setFrame={setFrameAndSync}
            frameTimes={frameTimes}
            spectrogramParams={spectrogramParams}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
