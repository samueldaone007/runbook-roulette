import { formatClock } from "../../engine/scoring";
import type { Scenario } from "../../engine/types";
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "../../scenarios";
import { normaliseCommand } from "../../shared/format";
import type { DebriefData } from "../run/types";

interface DebriefViewProps {
  scenario: Scenario | null;
  result: DebriefData | null;
  onNext: () => void;
  onHome: () => void;
  onRetry: (scenario: Scenario) => void;
  onProgress: () => void;
}

export function DebriefView({
  scenario,
  result,
  onNext,
  onHome,
  onRetry,
  onProgress,
}: DebriefViewProps) {
  if (!scenario) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="panel p-8 text-center">
          <p className="eyebrow justify-center">Missing incident</p>
          <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight">
            That incident isn&apos;t in the deck
          </h1>
          <p className="mx-auto mt-3 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
            The link may be stale, or the scenario was renamed. Spin a fresh page.
          </p>
          <button type="button" className="btn btn-amber mt-6" onClick={onHome}>
            Back to the board
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="panel p-8 text-center">
          <p className="eyebrow justify-center">No debrief on file</p>
          <h1 className="mt-3 font-display text-3xl font-bold uppercase tracking-tight">
            {scenario.title}
          </h1>
          <p className="mx-auto mt-3 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
            This run was not completed in this session. Debriefs live in session
            storage — run the incident again to earn one.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-amber" onClick={() => onRetry(scenario)}>
              Run this incident
            </button>
            <button type="button" className="btn btn-ghost" onClick={onHome}>
              Back to the board
            </button>
          </div>
        </div>
      </div>
    );
  }

  const chosen = scenario.options.find((option) => option.id === result.chosenRootCauseId);
  const correct = result.correctness.correct;

  const replay = scenario.seniorReplay.map((command) => ({
    command,
    ran: result.entries.some(
      (entry) => normaliseCommand(entry.command) === normaliseCommand(command),
    ),
  }));

  const verdict = !correct
    ? "Wrong call. The evidence pointed somewhere else — read the replay before the next spin."
    : !result.resolved
      ? "Right diagnosis, but the box was still broken when you called it. Naming a fault and fixing it are different skills."
      : result.hints.used > 0
        ? "Right call and a real fix. The nudge cost you points, but the instinct was sound."
        : result.total >= 90
          ? "Right call, clean fix, no help. That is the shift you want to repeat."
          : "Right diagnosis and a real fix. Tighten the investigation trail for a higher score.";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <p className="eyebrow">After action</p>

      {/* ---------------------------------------------------------- */}
      {/* Verdict header                                             */}
      {/* ---------------------------------------------------------- */}
      <div className="panel mt-4 overflow-hidden">
        <div className="grid md:grid-cols-[180px_minmax(0,1fr)]">
          <div
            className={`flex items-center justify-between gap-3 border-b-[3px] border-ink p-5 md:flex-col md:justify-center md:border-b-0 md:border-r-[3px] md:text-center ${
              result.passed ? "bg-amber" : "bg-ink text-cream"
            }`}
          >
            <p
              className={`font-mono text-[10px] uppercase tracking-[0.2em] ${
                result.passed ? "" : "text-term-dim"
              }`}
            >
              Grade
            </p>
            <p className="font-display text-6xl font-bold leading-none md:text-7xl">
              {result.grade}
            </p>
            <p
              className={`font-mono text-xs uppercase tracking-[0.16em] ${
                result.passed ? "" : "text-amber"
              }`}
            >
              {result.passed ? "Pass" : "Fail"}
            </p>
          </div>

          <div className="p-5 md:p-6">
            <p className="eyebrow">
              {CATEGORY_LABELS[scenario.category]} ·{" "}
              {DIFFICULTY_LABELS[scenario.difficulty]} · {scenario.alert.service}
            </p>

            <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-4xl">
                  {scenario.title}
                </h1>
                <p className="mt-3 max-w-2xl font-mono text-sm leading-relaxed text-ink-soft">
                  {verdict}
                </p>
              </div>
              <div className="flex items-baseline gap-2 md:flex-col md:items-end md:gap-0">
                <p className="font-display text-6xl font-bold leading-none">{result.total}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
                  / 100
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="tag">
                {formatClock(result.speed.elapsedSeconds)} elapsed
              </span>
              <span className="tag">
                {result.hints.used} {result.hints.used === 1 ? "hint" : "hints"}
              </span>
              <span className={`tag ${result.resolved ? "tag-violet" : "tag-amber"}`}>
                {result.resolved ? "Box healthy" : "Box still broken"}
              </span>
              <span className={`tag ${correct ? "tag-violet" : "tag-amber"}`}>
                {correct ? "Root cause matched" : "Wrong root cause"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Score + call                                               */}
      {/* ---------------------------------------------------------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="score-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="score-heading"
              className="font-display text-xl font-bold uppercase tracking-tight"
            >
              Score breakdown
            </h2>
            <span className="tag tag-ink">{result.passed ? "Passed" : "Failed"}</span>
          </div>

          <div className="mt-4 space-y-4">
            <ScoreLine
              label="Correct diagnosis"
              value={`${result.correctness.points}/${result.correctness.max}`}
              percent={(result.correctness.points / result.correctness.max) * 100}
              note={correct ? "Root cause matched" : "The root cause was something else"}
            />
            <ScoreLine
              label="Investigation"
              value={`${result.investigation.points}/${result.investigation.max}`}
              percent={(result.investigation.points / result.investigation.max) * 100}
              tone="amber"
              note={`${result.investigation.percent}% of the key checks were run`}
            />
            <ScoreLine
              label="Speed"
              value={`${result.speed.points}/${result.speed.max}`}
              percent={(result.speed.points / result.speed.max) * 100}
              tone="ink"
              note={`${formatClock(result.speed.elapsedSeconds)} against a ${formatClock(
                result.speed.parSeconds,
              )} par`}
            />
            <ScoreLine
              label="Safety"
              value={`${result.safety.points}/${result.safety.max}`}
              percent={(result.safety.points / result.safety.max) * 100}
              note={
                result.safety.mistakes.length
                  ? `${result.safety.mistakes.length} risky move${
                      result.safety.mistakes.length === 1 ? "" : "s"
                    }`
                  : "No risky moves"
              }
            />
            <ScoreLine
              label="Hints"
              value={result.hints.points === 0 ? "0" : `−${Math.abs(result.hints.points)}`}
              percent={0}
              tone="ink"
              note={result.hints.used ? `${result.hints.used} nudge used` : "Unassisted"}
            />
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="call-heading">
          <h2
            id="call-heading"
            className="font-display text-xl font-bold uppercase tracking-tight"
          >
            Your call
          </h2>

          <p className="mt-3 font-display text-base font-bold leading-snug">
            {chosen?.label ?? "No diagnosis recorded"}
          </p>
          <p className={`mt-2 inline-flex tag ${correct ? "tag-violet" : "tag-amber"}`}>
            {correct ? "Matched the root cause" : "Did not match"}
          </p>

          <div className="mt-4 border-t-2 border-ink/15 pt-3">
            <p className="mono-label">The real root cause</p>
            <p className="mt-1 font-mono text-xs leading-relaxed text-ink-soft">
              {scenario.rootCauseSummary}
            </p>
          </div>

          {result.fixNote ? (
            <div className="mt-4 border-t-2 border-ink/15 pt-3">
              <p className="mono-label">Your fix note</p>
              <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-soft">
                {result.fixNote}
              </p>
            </div>
          ) : null}

          {result.notes.trim() ? (
            <div className="mt-4 border-t-2 border-ink/15 pt-3">
              <p className="mono-label">Your scratchpad</p>
              <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-soft">
                {result.notes}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Explanation                                                */}
      {/* ---------------------------------------------------------- */}
      <section className="mt-6" aria-labelledby="explain-heading">
        <h2
          id="explain-heading"
          className="font-display text-xl font-bold uppercase tracking-tight"
        >
          What was really going on
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { label: "01 · What happened", body: scenario.debrief.whatHappened },
            { label: "02 · How to fix it", body: scenario.debrief.howToFix },
            { label: "03 · Prevent the sequel", body: scenario.debrief.prevention },
          ].map((block) => (
            <article key={block.label} className="panel p-5">
              <p className="mono-label">{block.label}</p>
              <p className="mt-2 font-mono text-xs leading-relaxed text-ink-soft">
                {block.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* Timeline vs replay                                         */}
      {/* ---------------------------------------------------------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="timeline-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="timeline-heading"
              className="font-display text-xl font-bold uppercase tracking-tight"
            >
              Your night
            </h2>
            <span className="tag">{result.entries.length} commands</span>
          </div>

          {result.entries.length ? (
            <ol
              className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1"
              tabIndex={0}
              aria-label="Your command timeline"
            >
              {result.entries.map((entry, index) => (
                <li
                  key={`${index}-${entry.command}`}
                  className="flex gap-3 border-b border-ink/10 pb-2 last:border-0"
                >
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
                    {formatClock(entry.atSeconds)}
                  </span>
                  <code className="min-w-0 break-words font-mono text-xs">
                    {entry.command}
                  </code>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 font-mono text-xs text-ink-faint">
              No commands. Bold strategy.
            </p>
          )}
        </section>

        <section className="panel-dark p-5" aria-labelledby="replay-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="replay-heading"
              className="font-display text-xl font-bold uppercase tracking-tight"
            >
              Senior replay
            </h2>
            <span className="tag tag-amber">Optimal path</span>
          </div>

          <ol
            className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1"
            tabIndex={0}
            aria-label="Senior replay commands"
          >
            {replay.map((row, index) => (
              <li
                key={`${index}-${row.command}`}
                className="flex items-start gap-3 border-b border-[#3a3844] pb-2 last:border-0"
              >
                <span className="w-5 shrink-0 font-mono text-[10px] text-term-dim">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <code
                  className={`min-w-0 flex-1 break-words font-mono text-[11px] ${
                    row.ran ? "text-term-ok" : "text-term"
                  }`}
                >
                  {row.command}
                </code>
                {row.ran ? (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-term-ok">
                    ran
                  </span>
                ) : null}
              </li>
            ))}
          </ol>

          <p className="mt-3 border-t border-[#3a3844] pt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-term-dim">
            Matching commands are highlighted
          </p>
        </section>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Risks + coverage                                           */}
      {/* ---------------------------------------------------------- */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="panel p-5" aria-labelledby="risk-heading">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="risk-heading"
              className="font-display text-xl font-bold uppercase tracking-tight"
            >
              Risky moves
            </h2>
            <span className={`tag ${result.safety.mistakes.length ? "tag-amber" : "tag-violet"}`}>
              {result.safety.mistakes.length
                ? `${result.safety.mistakes.length} flagged`
                : "Clean"}
            </span>
          </div>

          {result.safety.mistakes.length ? (
            <ul className="mt-3 space-y-3">
              {result.safety.mistakes.map((mistake) => (
                <li key={mistake.label} className="border-l-4 border-amber pl-3">
                  <p className="font-display text-sm font-bold">{mistake.label}</p>
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-faint">
                    {mistake.why}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 font-mono text-xs leading-relaxed text-ink-faint">
              No destructive commands, no blind restarts. A senior engineer would
              approve.
            </p>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="coverage-heading">
          <h2
            id="coverage-heading"
            className="font-display text-xl font-bold uppercase tracking-tight"
          >
            Investigation coverage
          </h2>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mono-label">Evidence found</p>
              {result.investigation.found.length ? (
                <ul className="mt-2 space-y-1.5">
                  {result.investigation.found.map((label) => (
                    <li key={label} className="flex gap-2 font-mono text-[11px] leading-snug">
                      <span className="text-violet" aria-hidden="true">
                        +
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-ink-faint">Nothing yet.</p>
              )}
            </div>

            <div>
              <p className="mono-label">Skipped</p>
              {result.investigation.missed.length ? (
                <ul className="mt-2 space-y-1.5">
                  {result.investigation.missed.map((label) => (
                    <li
                      key={label}
                      className="flex gap-2 font-mono text-[11px] leading-snug text-ink-faint"
                    >
                      <span aria-hidden="true">−</span>
                      {label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-mono text-[11px] text-violet">
                  Full coverage. Nothing missed.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Next actions                                               */}
      {/* ---------------------------------------------------------- */}
      <div className="mt-8 border-[3px] border-ink bg-amber p-5 shadow-[6px_6px_0_0_#1C1B22]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mono-label text-ink">Next page</p>
            <p className="mt-1 font-display text-2xl font-bold uppercase tracking-tight">
              The pager never sleeps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-ink" onClick={onNext}>
              Spin the next one
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onRetry(scenario)}>
              Run this again
            </button>
            <button type="button" className="btn btn-ghost" onClick={onProgress}>
              Logbook
            </button>
            <button type="button" className="btn btn-ghost" onClick={onHome}>
              Board
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ScoreLine({
  label,
  value,
  percent,
  note,
  tone = "violet",
}: {
  label: string;
  value: string;
  percent: number;
  note: string;
  tone?: "violet" | "amber" | "ink";
}) {
  const meterClass =
    tone === "amber" ? "meter meter-amber" : tone === "ink" ? "meter meter-ink" : "meter";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-sm font-bold">{label}</p>
        <p className="font-mono text-xs font-bold tabular-nums">{value}</p>
      </div>
      <div className={`${meterClass} mt-1.5`}>
        <span style={{ width: `${Math.max(0, Math.min(100, Math.round(percent)))}%` }} />
      </div>
      <p className="mt-1 font-mono text-[10px] leading-snug text-ink-faint">{note}</p>
    </div>
  );
}
