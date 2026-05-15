import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "rehab-dashboard.weekly-report.sessions";
const MAX_STORED_SESSIONS = 180;
const WEEK_WINDOW_DAYS = 7;

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeParseSessions(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSessions() {
  if (typeof window === "undefined") return [];
  return safeParseSessions(window.localStorage.getItem(STORAGE_KEY));
}

function saveSessions(sessions) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function phaseKey(value) {
  return String(value || "Unknown");
}

function createDraft(selectedExercise, sensor, reps) {
  const now = Date.now();
  return {
    id: `${selectedExercise.id}-${now}`,
    exerciseId: selectedExercise.id,
    exerciseName: selectedExercise.name,
    targetReps: 20,
    startedAt: now,
    startSteps: safeNumber(sensor.gait.steps),
    startReps: safeNumber(reps),
    kneeMin: safeNumber(sensor.angles.knee),
    kneeMax: safeNumber(sensor.angles.knee),
    ankleMin: safeNumber(sensor.angles.ankle),
    ankleMax: safeNumber(sensor.angles.ankle),
    cadenceSum: safeNumber(sensor.gait.cadence),
    cadenceSamples: 1,
    phaseCounts: { [phaseKey(sensor.gait.phase)]: 1 },
    lastPhase: phaseKey(sensor.gait.phase),
    lastUpdated: now,
  };
}

function updateDraft(draft, sensor, reps) {
  if (!draft) return draft;

  const knee = safeNumber(sensor.angles.knee);
  const ankle = safeNumber(sensor.angles.ankle);
  const cadence = safeNumber(sensor.gait.cadence);
  const currentPhase = phaseKey(sensor.gait.phase);

  return {
    ...draft,
    endReps: safeNumber(reps),
    kneeMin: Math.min(draft.kneeMin, knee),
    kneeMax: Math.max(draft.kneeMax, knee),
    ankleMin: Math.min(draft.ankleMin, ankle),
    ankleMax: Math.max(draft.ankleMax, ankle),
    cadenceSum: draft.cadenceSum + cadence,
    cadenceSamples: draft.cadenceSamples + 1,
    phaseCounts: {
      ...draft.phaseCounts,
      [currentPhase]: (draft.phaseCounts[currentPhase] ?? 0) + 1,
    },
    lastPhase: currentPhase,
    lastUpdated: Date.now(),
  };
}

function finalizeDraft(draft, sensor, reps) {
  const endedAt = Date.now();
  const updated = updateDraft(draft, sensor, reps);
  const durationMs = Math.max(0, endedAt - updated.startedAt);
  const stepsDelta = Math.max(0, safeNumber(sensor.gait.steps) - updated.startSteps);
  const repsCompleted = Math.max(0, safeNumber(reps) - updated.startReps);
  const compliancePct = updated.targetReps
    ? Math.min(100, Math.round((repsCompleted / updated.targetReps) * 100))
    : 0;

  const session = {
    ...updated,
    endedAt,
    durationMs,
    durationLabel: formatDuration(durationMs),
    stepsDelta,
    repsCompleted,
    compliancePct,
    kneeRom: Math.max(0, Math.round(updated.kneeMax - updated.kneeMin)),
    ankleRom: Math.max(0, Math.round(updated.ankleMax - updated.ankleMin)),
    avgCadence: updated.cadenceSamples
      ? Math.round(updated.cadenceSum / updated.cadenceSamples)
      : 0,
    dominantPhase: Object.entries(updated.phaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown",
    kneeMin: Math.round(updated.kneeMin),
    kneeMax: Math.round(updated.kneeMax),
    ankleMin: Math.round(updated.ankleMin),
    ankleMax: Math.round(updated.ankleMax),
  };

  return session;
}

function buildSessionSummary(session, painScore) {
  const stanceSamples = Object.entries(session.phaseCounts || {}).reduce((total, [phase, count]) => {
    return phase.toLowerCase().includes("swing") ? total : total + count;
  }, 0);
  const swingSamples = Object.entries(session.phaseCounts || {}).reduce((total, [phase, count]) => {
    return phase.toLowerCase().includes("swing") ? total + count : total;
  }, 0);
  const totalSamples = Math.max(1, stanceSamples + swingSamples);
  const stancePhase = Math.round((stanceSamples / totalSamples) * 100);
  const swingPhase = Math.max(0, 100 - stancePhase);
  const stepTimeSeconds = session.avgCadence > 0 ? Math.round((60 / session.avgCadence) * 100) / 100 : 0;
  const romImprovement = Math.max(0, Math.round((session.kneeRom + session.ankleRom) / 40));
  const painLabel = painScore === "" || painScore == null ? "Not entered" : `${painScore}/10`;
  const status = session.compliancePct >= 80 ? "Improving" : session.compliancePct >= 50 ? "Steady" : "Needs review";

  return {
    title: "Daily progress summary",
    dateLabel: formatDate(session.startedAt),
    gaitCycle: {
      stancePhase,
      swingPhase,
      cadence: session.avgCadence,
      stepTimeSeconds,
    },
    dailyProgress: {
      steps: session.stepsDelta,
      romImprovement,
      painInput: painLabel,
      status,
    },
    notes: [
      `Exercise: ${session.exerciseName}`,
      `Session length: ${session.durationLabel}`,
      `Reps completed: ${session.repsCompleted}/${session.targetReps}`,
      `Knee ROM: ${session.kneeRom} deg`,
      `Ankle ROM: ${session.ankleRom} deg`,
    ],
  };
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function getWindowStart() {
  return Date.now() - WEEK_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function inReportWindow(session) {
  return safeNumber(session.startedAt) >= getWindowStart();
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function computeSummary(sessions) {
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((session) => session.repsCompleted >= session.targetReps).length;
  const totalReps = sum(sessions.map((session) => session.repsCompleted));
  const totalSteps = sum(sessions.map((session) => session.stepsDelta));
  const avgKneeRom = average(sessions.map((session) => session.kneeRom));
  const avgAnkleRom = average(sessions.map((session) => session.ankleRom));
  const avgCadence = average(sessions.map((session) => session.avgCadence));
  const totalMinutes = Math.round(sum(sessions.map((session) => session.durationMs)) / 60000);
  const phaseCounts = sessions.reduce((counts, session) => {
    const key = phaseKey(session.dominantPhase);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const dominantPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";

  return {
    totalSessions,
    completedSessions,
    compliancePct: totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0,
    totalReps,
    totalSteps,
    avgKneeRom,
    avgAnkleRom,
    avgCadence,
    totalMinutes,
    dominantPhase,
  };
}

function formatDate(value) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildMailBody(summary, sessions) {
  const lines = [
    "Weekly Rehab Report",
    `Sessions: ${summary.totalSessions}`,
    `Compliance: ${summary.compliancePct}%`,
    `Average knee ROM: ${summary.avgKneeRom} deg`,
    `Average ankle ROM: ${summary.avgAnkleRom} deg`,
    `Average cadence: ${summary.avgCadence} spm`,
    `Total steps: ${summary.totalSteps}`,
    `Total time: ${summary.totalMinutes} min`,
    "",
    "Recent sessions:",
    ...sessions.slice(0, 5).map((session) => {
      return `${formatDate(session.startedAt)} - ${session.exerciseName}: ${session.repsCompleted}/${session.targetReps} reps, ${session.kneeRom} deg knee ROM, ${session.ankleRom} deg ankle ROM`;
    }),
  ];

  return lines.join("\n");
}

function buildReportHtml(summary, sessions, rangeLabel) {
  const rows = sessions
    .map(
      (session) => `
        <tr>
          <td>${formatDate(session.startedAt)}</td>
          <td>${session.exerciseName}</td>
          <td>${session.repsCompleted}/${session.targetReps}</td>
          <td>${session.compliancePct}%</td>
          <td>${session.kneeRom} deg</td>
          <td>${session.ankleRom} deg</td>
          <td>${session.avgCadence} spm</td>
          <td>${session.stepsDelta}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Weekly Rehab Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #111827; }
        h1, h2 { margin: 0 0 12px; }
        .meta { color: #4b5563; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
        .card { border: 1px solid #d1d5db; border-radius: 12px; padding: 14px; }
        .card strong { display: block; font-size: 22px; margin-top: 8px; }
        table { width: 100%; border-collapse: collapse; margin-top: 18px; }
        th, td { border-bottom: 1px solid #e5e7eb; text-align: left; padding: 10px 8px; font-size: 14px; }
        th { background: #f9fafb; }
      </style>
    </head>
    <body>
      <h1>Weekly Rehab Report</h1>
      <div class="meta">${rangeLabel}</div>
      <div class="grid">
        <div class="card"><span>Compliance</span><strong>${summary.compliancePct}%</strong></div>
        <div class="card"><span>Avg Knee ROM</span><strong>${summary.avgKneeRom} deg</strong></div>
        <div class="card"><span>Avg Ankle ROM</span><strong>${summary.avgAnkleRom} deg</strong></div>
        <div class="card"><span>Avg Cadence</span><strong>${summary.avgCadence} spm</strong></div>
        <div class="card"><span>Total Steps</span><strong>${summary.totalSteps}</strong></div>
        <div class="card"><span>Total Time</span><strong>${summary.totalMinutes} min</strong></div>
        <div class="card"><span>Dominant Gait</span><strong>${summary.dominantPhase}</strong></div>
      </div>
      <h2>Sessions</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Exercise</th>
            <th>Reps</th>
            <th>Compliance</th>
            <th>Knee ROM</th>
            <th>Ankle ROM</th>
            <th>Cadence</th>
            <th>Steps</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan='8'>No sessions recorded</td></tr>"}</tbody>
      </table>
    </body>
  </html>`;
}

export default function useWeeklyReport(sensor, selectedExercise, reps, sessionActive) {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [latestReport, setLatestReport] = useState(null);
  const draftRef = useRef(null);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!sessionActive || !draftRef.current) return;
    draftRef.current = updateDraft(draftRef.current, sensor, reps);
  }, [
    reps,
    sessionActive,
    sensor.angles.knee,
    sensor.angles.ankle,
    sensor.gait.cadence,
    sensor.gait.phase,
    sensor.gait.steps,
  ]);

  const beginSession = (exercise = selectedExercise, currentSensor = sensor, currentReps = reps) => {
    draftRef.current = createDraft(exercise, currentSensor, currentReps);
  };

  const endSession = (currentSensor = sensor, currentReps = reps) => {
    if (!draftRef.current) return null;

    const completedSession = finalizeDraft(draftRef.current, currentSensor, currentReps);
    draftRef.current = null;
    setSessions((current) => [...current, completedSession].slice(-MAX_STORED_SESSIONS));
    setLatestReport(buildSessionSummary(completedSession, ""));
    return completedSession;
  };

  const endSessionWithReport = (painScore = "", currentSensor = sensor, currentReps = reps) => {
    if (!draftRef.current) return null;

    const completedSession = finalizeDraft(draftRef.current, currentSensor, currentReps);
    draftRef.current = null;
    setSessions((current) => [...current, completedSession].slice(-MAX_STORED_SESSIONS));
    setLatestReport(buildSessionSummary(completedSession, painScore));
    return completedSession;
  };

  const updateLatestReportPain = (painScore = "") => {
    setLatestReport((current) => {
      if (!current) return current;

      return {
        ...current,
        dailyProgress: {
          ...current.dailyProgress,
          painInput: painScore === "" || painScore == null ? "Not entered" : `${painScore}/10`,
        },
      };
    });
  };

  const reportSessions = useMemo(
    () =>
      sessions
        .filter(inReportWindow)
        .slice()
        .sort((a, b) => b.startedAt - a.startedAt),
    [sessions],
  );
  const summary = useMemo(() => computeSummary(reportSessions), [reportSessions]);
  const rangeLabel = useMemo(() => {
    const start = new Date(getWindowStart());
    const end = new Date();
    return `${start.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} to ${end.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }, []);

  const resetWeeklySessions = () => setSessions([]);

  const downloadReport = () => {
    const blob = new Blob([buildReportHtml(summary, reportSessions, rangeLabel)], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weekly-rehab-report-${new Date().toISOString().slice(0, 10)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
    if (!reportWindow) return;

    reportWindow.document.write(buildReportHtml(summary, reportSessions, rangeLabel));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  const emailReport = () => {
    const subject = encodeURIComponent("Weekly Rehab Report");
    const body = encodeURIComponent(buildMailBody(summary, reportSessions));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const clearLatestReport = () => setLatestReport(null);

  return {
    sessions: reportSessions,
    summary,
    rangeLabel,
    beginSession,
    endSession,
    endSessionWithReport,
    updateLatestReportPain,
    downloadReport,
    printReport,
    emailReport,
    resetWeeklySessions,
    latestReport,
    clearLatestReport,
    hasData: reportSessions.length > 0,
  };
}
