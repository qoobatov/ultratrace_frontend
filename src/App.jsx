import { useState, useEffect, useCallback } from "react";
import FrameCanvas from "./components/FrameViewer/FrameCanvas";
import Sidebar from "./components/Sidebar/Sidebar";
import Timeline from "./components/Timeline/Timeline";
import Header from "./components/Header/Header";
import { getTraces, getFrameTimes } from "./api/client";

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
    } catch (err) {
      console.error("Full refresh failed", err);
    }
  }, [activeTrace]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header
        frame={frame}
        setFrame={setFrame}
        onFileChange={fullRefresh}
        onMethodChange={fullRefresh}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar
          activeTrace={activeTrace}
          onSelectTrace={handleSelectTrace}
          onTracesUpdate={refreshTraces}
          frameNumber={frame}
          spectrogramParams={spectrogramParams}
          onSpectrogramParamsChange={setSpectrogramParams}
        />
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex" }}>
            <FrameCanvas
              frameNumber={frame}
              activeTrace={activeTrace}
              traceColor={traceColors[activeTrace] || "red"}
              pointsVersion={pointsVersion}
            />
          </div>
          <Timeline
            frame={frame}
            setFrame={setFrame}
            frameTimes={frameTimes}
            spectrogramParams={spectrogramParams}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
