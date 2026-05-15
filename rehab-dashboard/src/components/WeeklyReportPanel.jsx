function StatCard({ label, value, hint }) {
  return (
    <article className="weekly-stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

function ReportLine({ label, value }) {
  return (
    <div className="report-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function WeeklyReportPanel({
  summary,
  sessions,
  rangeLabel,
  latestReport,
  painScore,
  onPainChange,
  onDownload,
  onPrint,
  onEmail,
  onClear,
  onClearReport,
}) {
  return (
    <section className="weekly-report-panel" aria-labelledby="weekly-report-heading">
      <div className="panel-header weekly-report-header">
        <div>
          <p className="eyebrow">Session Report</p>
          <h2 id="weekly-report-heading">End workout session and give report</h2>
          <span className="report-range">{rangeLabel}</span>
        </div>
        <div className="report-actions">
          <button className="report-button ghost" onClick={onDownload} type="button">
            Download HTML
          </button>
          <button className="report-button" onClick={onPrint} type="button">
            Print / Save PDF
          </button>
          <button className="report-button" onClick={onEmail} type="button">
            Email physiotherapist
          </button>
        </div>
      </div>

      <div className="weekly-stats-grid">
        <StatCard
          label="ROM"
          value={`${summary.avgKneeRom} / ${summary.avgAnkleRom} deg`}
          hint="Knee / ankle average range"
        />
        <StatCard
          label="Compliance"
          value={`${summary.compliancePct}%`}
          hint={`${summary.completedSessions} of ${summary.totalSessions} sessions completed`}
        />
        <StatCard
          label="Gait"
          value={`${summary.avgCadence} spm`}
          hint={`Dominant phase: ${summary.dominantPhase}`}
        />
        <StatCard label="Steps" value={`${summary.totalSteps}`} hint={`Across ${summary.totalSessions} sessions`} />
      </div>

      <div className="weekly-report-body">
        <div className="report-summary-card">
          <div className="subsection-title">
            <h3>Daily progress summary</h3>
            <div className="report-input-wrap">
              <label htmlFor="pain-score">Pain input (optional)</label>
              <input
                id="pain-score"
                max="10"
                min="0"
                onChange={(event) => onPainChange(event.target.value)}
                placeholder="4/10"
                type="number"
                value={painScore}
              />
            </div>
          </div>

          {latestReport ? (
            <div className="report-summary-output">
              <div className="report-summary-title">
                <strong>{latestReport.title}</strong>
                <span>{latestReport.dateLabel}</span>
              </div>

              <div className="report-summary-grid">
                <div className="report-summary-block">
                  <h4>Gait Cycle</h4>
                  <ReportLine label="Stance Phase" value={`${latestReport.gaitCycle.stancePhase}%`} />
                  <ReportLine label="Swing Phase" value={`${latestReport.gaitCycle.swingPhase}%`} />
                  <ReportLine label="Cadence" value={`${latestReport.gaitCycle.cadence} steps/min`} />
                  <ReportLine label="Step Time" value={`${latestReport.gaitCycle.stepTimeSeconds} sec`} />
                </div>

                <div className="report-summary-block">
                  <h4>Daily progress summary</h4>
                  <ReportLine label="Date" value={latestReport.dateLabel} />
                  <ReportLine label="Steps" value={latestReport.dailyProgress.steps} />
                  <ReportLine label="ROM Improvement" value={`+${latestReport.dailyProgress.romImprovement} deg`} />
                  <ReportLine label="Pain Input" value={latestReport.dailyProgress.painInput} />
                  <ReportLine label="Status" value={latestReport.dailyProgress.status} />
                </div>
              </div>

              <ul className="report-notes">
                {latestReport.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="weekly-report-empty">
              End a workout session and the summary will appear here in the same format as your sample report.
            </p>
          )}

          <div className="report-summary-actions">
            <button className="report-button ghost" onClick={onClearReport} type="button" disabled={!latestReport}>
              Clear preview
            </button>
          </div>
        </div>

        <div className="weekly-report-table-wrap">
          <div className="subsection-title">
            <h3>Recent sessions</h3>
            <button className="text-button" onClick={onClear} type="button" disabled={!sessions.length}>
              Clear history
            </button>
          </div>

          {sessions.length ? (
            <table className="weekly-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Exercise</th>
                  <th>Reps</th>
                  <th>Knee ROM</th>
                  <th>Ankle ROM</th>
                  <th>Cadence</th>
                  <th>Steps</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 6).map((session) => (
                  <tr key={session.id}>
                    <td>{new Date(session.startedAt).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                    <td>{session.exerciseName}</td>
                    <td>
                      {session.repsCompleted}/{session.targetReps}
                    </td>
                    <td>{session.kneeRom} deg</td>
                    <td>{session.ankleRom} deg</td>
                    <td>{session.avgCadence} spm</td>
                    <td>{session.stepsDelta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="weekly-report-empty">
              Completed sessions will appear here and feed the weekly history.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
