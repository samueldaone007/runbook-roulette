import type { Scenario } from "../../engine/types";
import { formatClock } from "../../engine/scoring";
import { CATEGORY_LABELS, getScenario } from "../../scenarios";
import { EmptyState, StatCard } from "../../shared/SiteChrome";
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
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">After-action</p>
          <h1 className="mt-2 font-display text-4xl font-bold uppercase leading-none tracking-tight md:text-5xl">
            The logbook
          </h1>
          <p className="mt-3 max-w-xl font-mono text-sm leading-relaxed text-ink-soft">
            Every shift you have worked, and the places you keep getting caught.
          </p>
        </div>

        {records.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="inline-flex min-h-6 items-center font-mono text-[0.625rem] uppercase tracking-[0.12em] underline decoration-2 underline-offset-4 hover:text-alert"
          >
            Clear history
          </button>
        ) : null}
      </div>

      {records.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing in the logbook"
            body="No runs logged yet. Spin your first incident and the debrief will start filling this page."
            action={
              <button type="button" className="btn btn-amber" onClick={onGoHome}>
                Back to the board
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
            <StatCard label="Runs" value={records.length} sub="logged" />
            <StatCard label="Pass rate" value={`${rate}%`} sub="all time" accent="amber" />
            <StatCard
              label="Best time"
              value={best ? formatClock(best.elapsedSeconds) : "--:--"}
              sub={best ? best.title : "no clean run yet"}
            />
            <StatCard
              label="Streak"
              value={streak}
              sub={streak === 1 ? "pass in a row" : "passes in a row"}
              accent="violet"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-5">
            <section className="panel min-w-0 flex-[1_1_30rem] p-5" aria-labelledby="weak-heading">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="weak-heading"
                  className="font-display text-xl font-bold uppercase tracking-tight"
                >
                  Weak spots
                </h2>
                <span className="tag">By category</span>
              </div>

              <div className="mt-4 space-y-4">
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

              <p className="mt-4 border-t-2 border-ink/15 pt-3 font-mono text-[0.625rem] leading-relaxed text-ink-faint">
                Lowest pass rate first. Categories appear once you have played them.
              </p>
            </section>

            <section className="panel p-5" aria-labelledby="fast-heading">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="fast-heading"
                  className="font-display text-xl font-bold uppercase tracking-tight"
                >
                  Fastest clean runs
                </h2>
                <span className="tag">Top 3</span>
              </div>

              {fastest.length ? (
                <ol className="mt-4 space-y-3">
                  {fastest.map((record, index) => (
                    <li
                      key={record.id}
                      className="flex items-center gap-3 border-b-2 border-ink/10 pb-3 last:border-0 last:pb-0"
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
                <p className="mt-4 font-mono text-xs leading-relaxed text-ink-faint">
                  No passes yet. The first clean run sets the benchmark.
                </p>
              )}
            </section>
          </div>

          <section className="panel mt-6 overflow-hidden" aria-labelledby="history-heading">
            <div className="flex items-center justify-between gap-3 border-b-[3px] border-ink p-4">
              <h2
                id="history-heading"
                className="font-display text-xl font-bold uppercase tracking-tight"
              >
                Run history
              </h2>
              <span className="tag">
                {records.length} {records.length === 1 ? "run" : "runs"}
              </span>
            </div>

            <ul>
              {records.map((record) => {
                const scenario = getScenario(record.scenarioId);
                return (
                  <li
                    key={record.id}
                    className="history-row flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-ink/10 px-4 py-3 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
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

                    <span className={`stamp ${record.passed ? "bg-violet text-white" : ""}`}>
                      {record.grade}
                    </span>

                    <div className="text-right font-mono text-xs tabular-nums">
                      <p className="font-bold">{record.total}/100</p>
                      <p className="text-[0.625rem] text-ink-faint">
                        {formatClock(record.elapsedSeconds)}
                      </p>
                    </div>

                    <span className={`tag ${record.passed ? "tag-violet" : "tag-amber"}`}>
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
          </section>
        </>
      )}
    </div>
  );
}
