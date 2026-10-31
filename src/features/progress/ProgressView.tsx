import type { Scenario } from "../../engine/types";
import { formatClock } from "../../engine/scoring";
import { CATEGORY_LABELS, getScenario } from "../../scenarios";
import { EmptyState } from "../../shared/SiteChrome";
import { formatWhen } from "../../shared/format";
import {
  bestRun,
  categoryStats,
  currentStreak,
  fastestPasses,
  passRate,
} from "./storage";
import type { RunRecord } from "./types";

interface ProgressViewProps {
  records: RunRecord[];
  onPlay: (scenario: Scenario) => void;
  onGoHome: () => void;
  onClear: () => void;
}

export function ProgressView({ records, onPlay, onGoHome, onClear }: ProgressViewProps) {
  const rate = passRate(records);
  const best = bestRun(records);
  const streak = currentStreak(records);
  const stats = categoryStats(records);
  const fastest = fastestPasses(records);

  const clear = () => {
    if (window.confirm("Clear all run history? This cannot be undone.")) onClear();
  };

  return (
    <div>
      {/* ---------------------------------------------------------- */}
      {/* Logbook header                                             */}
      {/* ---------------------------------------------------------- */}
      <section className="band band-ruled">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">After-action</p>
              <h1 className="display-lg mt-4 text-cream">The logbook</h1>
              <p className="mt-4 max-w-xl font-mono text-sm leading-relaxed text-term-dim">
                Every shift you have worked, and the places you keep getting caught.
              </p>
            </div>

            {records.length > 0 ? (
              <button
                type="button"
                onClick={clear}
                className="btn btn-ghost-dark btn-sm min-h-9"
              >
                Clear history
              </button>
            ) : null}
          </div>

          {records.length > 0 ? (
            <div className="scoreboard mt-10">
              <LogCell label="Shifts" value={records.length} sub="logged" />
              <LogCell label="Pass rate" value={`${rate}%`} sub="all time" />
              <LogCell
                label="Best time"
                value={best ? formatClock(best.elapsedSeconds) : "--:--"}
                sub={best ? best.title : "no clean run yet"}
              />
              <LogCell
                label="Streak"
                value={streak}
                sub={streak === 1 ? "pass in a row" : "passes in a row"}
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-4 pt-10">
        {records.length === 0 ? (
          <EmptyState
            title="Nothing in the logbook"
            body="No runs logged yet. Spin your first incident and the debrief will start filling this page."
            action={
              <button type="button" className="btn btn-amber" onClick={onGoHome}>
                Back to the board
              </button>
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-6">
              <section className="min-w-0 flex-[1_1_30rem]" aria-labelledby="weak-heading">
                <div className="section-head">
                  <div>
                    <p className="mono-label">01 · Where it hurts</p>
                    <h2 id="weak-heading" className="display-md mt-2">
                      Weak spots
                    </h2>
                  </div>
                  <span className="tag">By category</span>
                </div>

                <div className="panel-paper mt-4 p-5">
                  <div className="space-y-4">
                    {stats.map((stat) => (
                      <div key={stat.category}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-display text-sm font-bold">{stat.label}</p>
                          <p className="font-mono text-xs font-bold tabular-nums">
                            {stat.rate}%
                          </p>
                        </div>
                        <div className={`meter mt-1.5 ${stat.rate < 60 ? "meter-amber" : ""}`}>
                          <span style={{ width: `${stat.rate}%` }} />
                        </div>
                        <p className="mt-1 font-mono text-[0.625rem] text-ink-faint">
                          {stat.passes}/{stat.runs} passed
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4 border-t-2 border-ink/20 pt-3 font-mono text-[0.625rem] leading-relaxed text-ink-faint">
                    Lowest pass rate first. Categories appear once you have played them.
                  </p>
                </div>
              </section>

              <section className="min-w-0 flex-[0_1_22rem]" aria-labelledby="fast-heading">
                <div className="section-head">
                  <div>
                    <p className="mono-label">02 · Clean runs</p>
                    <h2 id="fast-heading" className="display-md mt-2">
                      Fastest
                    </h2>
                  </div>
                  <span className="tag">Top 3</span>
                </div>

                <div className="panel mt-4 p-5">
                  {fastest.length ? (
                    <ol className="space-y-3">
                      {fastest.map((record, index) => (
                        <li
                          key={record.id}
                          className="flex items-center gap-3 border-b-2 border-ink/15 pb-3 last:border-0 last:pb-0"
                        >
                          <span className="grid h-8 w-8 flex-none place-items-center border-2 border-ink bg-amber font-mono text-xs font-bold">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-display text-sm font-bold">
                              {record.title}
                            </p>
                            <p className="font-mono text-[0.625rem] text-ink-faint">
                              {formatWhen(record.completedAt)} ·{" "}
                              {CATEGORY_LABELS[record.category]}
                            </p>
                          </div>
                          <p className="font-mono text-lg font-bold tabular-nums">
                            {formatClock(record.elapsedSeconds)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="font-mono text-xs leading-relaxed text-ink-faint">
                      No passes yet. The first clean run sets the benchmark.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <section className="mt-12" aria-labelledby="history-heading">
              <div className="section-head">
                <div>
                  <p className="mono-label">03 · Every shift</p>
                  <h2 id="history-heading" className="display-md mt-2">
                    Run history
                  </h2>
                </div>
                <span className="tag">
                  {records.length} {records.length === 1 ? "run" : "runs"}
                </span>
              </div>

              <div className="panel mt-4 overflow-hidden">
                <ul>
                  {records.map((record) => {
                    const scenario = getScenario(record.scenarioId);
                    return (
                      <li
                        key={record.id}
                        className="history-row flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-ink/15 px-4 py-3 last:border-0"
                      >
                        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                          <p className="break-words font-display text-sm font-bold">
                            {record.title}
                          </p>
                          <p className="font-mono text-[0.625rem] text-ink-faint">
                            {formatWhen(record.completedAt)} ·{" "}
                            {CATEGORY_LABELS[record.category]} ·{" "}
                            {record.hintsUsed === 0
                              ? "no hints"
                              : `${record.hintsUsed} hint${record.hintsUsed === 1 ? "" : "s"}`}
                          </p>
                        </div>

                        <span
                          className={`stamp ${record.passed ? "bg-violet text-white" : ""}`}
                        >
                          {record.grade}
                        </span>

                        <div className="text-right font-mono text-xs tabular-nums">
                          <p className="font-bold">{record.total}/100</p>
                          <p className="text-[0.625rem] text-ink-faint">
                            {formatClock(record.elapsedSeconds)}
                          </p>
                        </div>

                        <span
                          className={`tag ${record.passed ? "tag-violet" : "tag-amber"}`}
                        >
                          {record.passed ? "Pass" : "Fail"}
                        </span>

                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={!scenario}
                          onClick={() => {
                            if (scenario) onPlay(scenario);
                          }}
                        >
                          Retry
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LogCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="score-cell">
      <p className="mono-label">{label}</p>
      <p className="score-value">{value}</p>
      <p className="score-sub">{sub}</p>
    </div>
  );
}
