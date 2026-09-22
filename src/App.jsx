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

const HIDDEN_TRACES_KEY = "ultratrace.hiddenTraces";

const loadHiddenTraces = () => {
  try {
    const raw = localStorage.getItem(HIDDEN_TRACES_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

function App() {
  const [frame, setFrame] = useState(1);
  const [activeTrace, setActiveTrace] = useState(null);
  const [traces, setTraces] = useState([]);
  const [traceColors, setTraceColors] = useState({});
  const [defaultTraceName, setDefaultTraceName] = useState(null);
  const [hiddenTraces, setHiddenTraces] = useState(loadHiddenTraces);
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

  const applyTraceData = useCallback((data) => {
    setTraces(data.traces || []);
    setTraceColors(data.colors || {});
    setDefaultTraceName(data.default || null);
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
        applyTraceData(traceData);
        setPointsVersion((v) => v + 1);
        setOffset(offsetRes.offset);

        setActiveTrace((prev) => {
          if (prev && (traceData.traces || []).includes(prev)) return prev;
          return (
            traceData.default ||
            (traceData.traces && traceData.traces[0]) ||
            null
          );
        });

        if (options.methodChanged) {
          setStudyVersion((v) => v + 1);
        }
      } catch (err) {
        console.error("Full refresh failed", err);
      }
    },
    [applyTraceData],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fullRefresh();
  }, [fullRefresh]);

  const handleMethodChange = useCallback(
    (opts) => {
      fullRefresh(opts);
    },
    [fullRefresh],
  );

  const handleSelectTrace = useCallback((name) => setActiveTrace(name), []);

  const refreshTraces = useCallback(async () => {
    try {
      const data = await getTraces();
      applyTraceData(data);
      setPointsVersion((v) => v + 1);
      setActiveTrace((prev) => {
        if (prev && (data.traces || []).includes(prev)) return prev;
        return data.default || (data.traces && data.traces[0]) || null;
      });
    } catch (err) {
      console.error("Failed to refresh traces", err);
    }
  }, [applyTraceData]);

  const toggleTraceVisibility = useCallback((name) => {
    setHiddenTraces((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(HIDDEN_TRACES_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

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
          traces={traces}
          traceColors={traceColors}
          defaultTraceName={defaultTraceName}
          hiddenTraces={hiddenTraces}
          onToggleTraceVisibility={toggleTraceVisibility}
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
              traces={traces}
              traceColors={traceColors}
              hiddenTraces={hiddenTraces}
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
