import "./App.css";
import FootHeatmap from "./components/FootHeatmap";
import ModelViewer from "./components/ModelViewer";
import WeeklyReportPanel from "./components/WeeklyReportPanel";
import useIMU from "./hooks/useIMU";
import useWeeklyReport from "./hooks/useWeeklyReport";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const exercises = [
  {
    id: "knee-flexion",
    name: "Knee Flexion",
    cue: "Bend your knee, then return with control.",
    metric: "knee",
    readyBelow: 20,
    targetAbove: 45,
  },
  {
    id: "knee-extension",
    name: "Knee Extension",
    cue: "Straighten from a bent knee, then reset.",
    metric: "knee",
    readyBelow: 15,
    targetAbove: 35,
    countDirection: "down",
  },
  {
    id: "short-arc-quad",
    name: "Short Arc Quad",
    cue: "Straighten the knee over support, then lower softly.",
    metric: "knee",
    readyBelow: 12,
    targetAbove: 28,
  },
  {
    id: "ankle-pumps",
    name: "Ankle Pumps",
    cue: "Point the toes up and down through a full pump.",
    metric: "ankle",
    readyBelow: 6,
    targetAbove: 18,
    useAbsolute: true,
  },
  {
    id: "ankle-dorsiflexion",
    name: "Ankle Dorsiflexion",
    cue: "Pull the toes toward the shin, then relax to neutral.",
    metric: "ankle",
    readyBelow: 6,
    targetAbove: 16,
  },
];

const SESSION_TARGET_REPS = 20;
const SHORT_ARC_HOLD_SECONDS = 10;
const MIN_REP_INTERVAL_MS = 900;

function formatAngle(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)} deg` : "0 deg";
}

function formatNumber(value, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}${suffix}` : `0${suffix}`;
}

function MetricCard({ label, value, hint, tone = "default", children }) {
  return (
    <article className={`metric-card ${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {hint && <span>{hint}</span>}
      {children}
    </article>
  );
}

function readExerciseValue(angles, exercise) {
  const rawValue = angles?.[exercise.metric] ?? angles?.knee ?? 0;
  const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;

  return exercise.useAbsolute ? Math.abs(value) : value;
}

function readExerciseCounterValue(angles, exercise) {
  const rawValue = angles?.[exercise.metric] ?? angles?.knee ?? 0;
  const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;

  if (exercise.metric === "knee") {
    return 180 - value;
  }

  return exercise.useAbsolute ? Math.abs(value) : value;
}

function advanceExerciseCounter(value, exercise, phaseRef, countFrameRef, lastCountAtRef, setReps) {
  const now = performance.now();
  if (now - lastCountAtRef.current < MIN_REP_INTERVAL_MS) return;

  if (phaseRef.current === "ready" && value >= exercise.targetAbove) {
    phaseRef.current = "working";
    return;
  }

  if (phaseRef.current === "working" && value <= exercise.readyBelow) {
    phaseRef.current = "ready";
    lastCountAtRef.current = now;
    countFrameRef.current = window.requestAnimationFrame(() => {
      setReps((current) => Math.min(current + 1, SESSION_TARGET_REPS));
      countFrameRef.current = null;
    });
  }
}

function useExerciseCounter({ angles, connected, exercise, active }) {
  const [reps, setReps] = useState(0);
  const phaseRef = useRef("ready");
  const countFrameRef = useRef(null);
  const lastCountAtRef = useRef(0);

  const resetCounter = useCallback(() => {
    setReps(0);
    phaseRef.current = "ready";
    lastCountAtRef.current = 0;
  }, []);

  useEffect(() => {
    if (!active) {
      phaseRef.current = "ready";
      return;
    }

    if (!connected) return;

    const value = readExerciseCounterValue(angles, exercise);
    advanceExerciseCounter(value, exercise, phaseRef, countFrameRef, lastCountAtRef, setReps);
  }, [active, angles, connected, exercise]);

  useEffect(() => {
    if (!active || connected) return;

    phaseRef.current = "ready";
    const amplitude = Math.max(8, (exercise.targetAbove - exercise.readyBelow) / 2 + 4);
    const midpoint = (exercise.targetAbove + exercise.readyBelow) / 2;
    const cycleSeconds = exercise.id === "knee-extension" || exercise.id === "knee-flexion" ? 2.8 : 3.2;
    const startTime = performance.now();

    const intervalId = window.setInterval(() => {
      const elapsedSeconds = (performance.now() - startTime) / 1000;
      const value = midpoint + Math.sin((elapsedSeconds / cycleSeconds) * Math.PI * 2) * amplitude;
      advanceExerciseCounter(value, exercise, phaseRef, countFrameRef, lastCountAtRef, setReps);
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [active, connected, exercise]);

  useEffect(
    () => () => {
      if (countFrameRef.current) {
        window.cancelAnimationFrame(countFrameRef.current);
      }
    },
    [],
  );

  return [reps, resetCounter];
}

function useExerciseHoldCountdown({ exercise, active }) {
  const [secondsLeft, setSecondsLeft] = useState(SHORT_ARC_HOLD_SECONDS);

  useEffect(() => {
    if (exercise.id !== "short-arc-quad" || !active) {
      setSecondsLeft(SHORT_ARC_HOLD_SECONDS);
      return;
    }

    setSecondsLeft(SHORT_ARC_HOLD_SECONDS);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(Math.max(0, SHORT_ARC_HOLD_SECONDS - elapsedSeconds));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [active, exercise.id]);

  return secondsLeft;
}

function ExerciseList({ selectedExercise, onSelect, sessionActive }) {
  return (
    <section className="exercise-panel" aria-labelledby="exercise-heading">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Protocol</p>
          <h2 id="exercise-heading">Exercises</h2>
        </div>
        <span className="session-chip">{SESSION_TARGET_REPS} reps</span>
      </div>

      <div className="exercise-list">
        {exercises.map((exercise) => (
          <button
            className={exercise.id === selectedExercise.id ? "exercise-item active" : "exercise-item"}
            key={exercise.id}
            onClick={() => onSelect(exercise)}
            type="button"
          >
            <span>{exercise.name}</span>
            <small>
              {exercise.id === selectedExercise.id
                ? sessionActive
                  ? "Live"
                  : "Demo"
                : "Ready"}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

function App() {
  const sensor = useIMU();
  const [selectedExercise, setSelectedExercise] = useState(exercises[0]);
  const [sessionActive, setSessionActive] = useState(false);
  const [painScore, setPainScore] = useState("");
  const [stepCounterActive, setStepCounterActive] = useState(false);
  const [stepStartCount, setStepStartCount] = useState(0);
  const [reps, resetCounter] = useExerciseCounter({
    angles: sensor.angles,
    connected: sensor.connected,
    exercise: selectedExercise,
    active: sessionActive,
  });
  const holdCountdown = useExerciseHoldCountdown({
    exercise: selectedExercise,
    active: sessionActive,
  });
  const weeklyReport = useWeeklyReport(sensor, selectedExercise, reps, sessionActive);
  const statusLabel = sensor.connected ? "Connected" : "Disconnected";
  const statusHint = sensor.connected ? "ESP32 stream active" : "Waiting for ESP32";
  const exerciseValue = useMemo(
    () => Math.round(readExerciseValue(sensor.angles, selectedExercise)),
    [selectedExercise, sensor.angles],
  );
  const displayedSteps = stepCounterActive
    ? Math.max(0, Math.round(Number(sensor.gait.steps) - stepStartCount))
    : 0;
  const lastUpdated = sensor.lastUpdated
    ? new Date(sensor.lastUpdated).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "No packets";

  function selectExercise(exercise) {
    if (sessionActive) {
      weeklyReport.endSessionWithReport(painScore, sensor, reps);
    }

    resetCounter();
    setSelectedExercise(exercise);
    setSessionActive(false);
  }

  function startSession() {
    if (sessionActive) {
      weeklyReport.endSessionWithReport(painScore, sensor, reps);
      setSessionActive(false);
      setPainScore("");
      return;
    }

    resetCounter();
    weeklyReport.beginSession(selectedExercise, sensor, 0);
    setSessionActive(true);
  }

  function endSessionAndReport() {
    weeklyReport.endSessionWithReport(painScore, sensor, reps);
    setSessionActive(false);
    setPainScore("");
  }

  function handlePainChange(value) {
    setPainScore(value);
    weeklyReport.updateLatestReportPain(value);
  }

  function toggleStepCounter() {
    if (stepCounterActive) {
      setStepCounterActive(false);
      return;
    }

    setStepStartCount(Math.round(Number(sensor.gait.steps) || 0));
    setStepCounterActive(true);
  }

  return (
    <main className="app-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Physiotherapy Assistive Device</p>
          <h1>Rehab Device Dashboard</h1>
        </div>
        <div className={`connection-banner ${sensor.connected ? "online" : "offline"}`}>
          <span />
          {statusLabel}
        </div>
      </header>

      <section className="dashboard-grid">
        <aside className="metrics-panel" aria-label="Device metrics">
          <MetricCard
            label="Device Status"
            value={statusLabel}
            hint={statusHint}
            tone={sensor.connected ? "success" : "danger"}
          />
          <MetricCard label="Knee Angle" value={formatAngle(sensor.angles.knee)} hint="Thigh to shin" />
          <MetricCard label="Ankle Angle" value={formatAngle(sensor.angles.ankle)} hint="Shin to foot" />
          <MetricCard label="Knee ROM" value={formatAngle(sensor.rom.knee)} hint="Current range" />
          <MetricCard label="Ankle ROM" value={formatAngle(sensor.rom.ankle)} hint="Current range" />
          <MetricCard label="Gait Phase" value={sensor.gait.phase} hint="Detected phase" />
          <MetricCard label="Steps" value={formatNumber(displayedSteps)} hint="Session step count">
            <button
              className={stepCounterActive ? "step-toggle active" : "step-toggle"}
              disabled={!sensor.connected}
              onClick={toggleStepCounter}
              type="button"
            >
              {stepCounterActive ? "Stop" : "Start"}
            </button>
          </MetricCard>
          <MetricCard label="Cadence" value={formatNumber(sensor.gait.cadence, " spm")} hint="Steps per minute" />
          <MetricCard label="Reps Completed" value={`${reps} / ${SESSION_TARGET_REPS}`} hint="Current session" />
          <MetricCard label="Last Packet" value={lastUpdated} hint={sensor.wsUrl} />
        </aside>

        <section className="main-panel">
          <ExerciseList
            selectedExercise={selectedExercise}
            onSelect={selectExercise}
            sessionActive={sessionActive}
          />

          <section className="visualization-panel" aria-label="Live biomechanical visualization">
            <div className="model-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Motion Capture</p>
                  <h2>{selectedExercise.name}</h2>
                </div>
                <span className="angle-chip">{formatAngle(sensor.angles.knee)}</span>
              </div>
              <ModelViewer
                angles={sensor.angles}
                connected={sensor.connected}
                exerciseId={selectedExercise.id}
                mode={sessionActive ? "live" : "demo"}
              />
              <div className="exercise-controls">
                <div>
                  <p className="control-label">{sessionActive ? "Current Session" : "Selected Demo"}</p>
                  <strong>{reps} reps</strong>
                  <span>{selectedExercise.cue}</span>
                  {selectedExercise.id === "short-arc-quad" && (
                    <span className="hold-countdown">
                      Hold for {SHORT_ARC_HOLD_SECONDS} seconds
                      {sessionActive && ` - ${holdCountdown}s left`}
                    </span>
                  )}
                </div>
                <div className="control-actions">
                  <span className={`status-pill ${sensor.connected ? "online" : "offline"}`}>
                    {sensor.connected ? "Device on" : "Device off"}
                  </span>
                    <button className="start-button" onClick={startSession} type="button">
                      {sessionActive ? "Stop Workout" : sensor.connected ? "Start Workout" : "Start Demo"}
                    </button>
                    {sessionActive && (
                      <button className="end-report-button" onClick={endSessionAndReport} type="button">
                        End workout session and give report
                      </button>
                    )}
                </div>
                <div className="rep-progress" aria-label="Exercise progress">
                  <span style={{ width: `${(reps / SESSION_TARGET_REPS) * 100}%` }} />
                </div>
                <small>
                  Counting when {selectedExercise.name.toLowerCase()} passes {selectedExercise.targetAbove} deg and returns below{" "}
                  {selectedExercise.readyBelow} deg. Live value: {exerciseValue} deg.
                </small>
              </div>
            </div>

            <FootHeatmap pressure={sensor.pressure} connected={sensor.connected} />
          </section>

          <WeeklyReportPanel
            summary={weeklyReport.summary}
            sessions={weeklyReport.sessions}
            rangeLabel={weeklyReport.rangeLabel}
            latestReport={weeklyReport.latestReport}
            painScore={painScore}
            onPainChange={handlePainChange}
            onDownload={weeklyReport.downloadReport}
            onPrint={weeklyReport.printReport}
            onEmail={weeklyReport.emailReport}
            onClear={weeklyReport.resetWeeklySessions}
            onClearReport={weeklyReport.clearLatestReport}
          />

          {sensor.error && <p className="error-message">{sensor.error}</p>}
        </section>
      </section>
    </main>
  );
}

export default App;
