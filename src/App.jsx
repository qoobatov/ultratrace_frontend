import { useState, useCallback, useRef, useEffect } from "react";
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
  const [studyVersion, setStudyVersion] = useState(0);

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

  const fullRefresh = useCallback(
    async (options = {}) => {
      try {
        const [ftData, traceData, offsetRes] = await Promise.all([
          getFrameTimes(),
          getTraces(),
          getStudyOffset(),
        ]);

        setFrameTimes(ftData.times || []);
        setFrame(1);
        setTraceColors(traceData.colors || {});
        if (!activeTrace) {
          const def =
            traceData.default || (traceData.traces && traceData.traces[0]);
          if (def) setActiveTrace(def);
        }
        setPointsVersion((v) => v + 1);
        setOffset(offsetRes.offset);

        if (options.methodChanged) {
          setStudyVersion((v) => v + 1);
        }
      } catch (err) {
        console.error("Full refresh failed", err);
      }
    },
    [activeTrace],
  );

  // Загружаем данные при первом маунте
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fullRefresh();
  }, []);

  const handleMethodChange = useCallback(
    (opts) => {
      fullRefresh(opts);
    },
    [fullRefresh],
  );

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
      const ftData = await getFrameTimes();
      setFrameTimes(ftData.times || []);
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
        onMethodChange={handleMethodChange}
        activeTrace={activeTrace}
        totalFrames={frameTimes.length}
        pointsVersion={pointsVersion}
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
              key={studyVersion}
              frameNumber={frame}
              activeTrace={activeTrace}
              traceColor={traceColors[activeTrace] || "red"}
              pointsVersion={pointsVersion}
              onPointsSaved={() => setPointsVersion((v) => v + 1)}
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
