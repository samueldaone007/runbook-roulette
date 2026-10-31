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
        <div className="panel-paper p-8 text-center">
          <p className="eyebrow justify-center">Missing incident</p>
          <h1 className="display-md mt-4">That incident isn&apos;t in the deck</h1>
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
        <div className="panel-paper p-8 text-center">
          <p className="eyebrow justify-center">No debrief on file</p>
          <h1 className="display-md mt-4">{scenario.title}</h1>
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
    <div>
      {/* ---------------------------------------------------------- */}
      {/* Verdict band                                               */}
      {/* ---------------------------------------------------------- */}
      <section className="band band-ruled">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">After action</p>
            <span className="tag tag-ghost">
              {CATEGORY_LABELS[scenario.category]} · {DIFFICULTY_LABELS[scenario.difficulty]} ·{" "}
              {scenario.alert.service}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="display-lg max-w-2xl text-cream">{scenario.title}</h1>
              <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-term-dim">
                {verdict}
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <span className={`tag ${result.resolved ? "tag-violet" : "tag-amber"}`}>
                  {result.resolved ? "Box healthy" : "Box still broken"}
                </span>
                <span className={`tag ${correct ? "tag-violet" : "tag-amber"}`}>
                  {correct ? "Root cause matched" : "Wrong root cause"}
                </span>
                <span className="tag tag-ghost">
                  {result.hints.used} {result.hints.used === 1 ? "hint" : "hints"}
                </span>
              </div>
            </div>

            <div className="flex flex-none flex-wrap items-center gap-6 sm:gap-8">
              <div className={`grade-stamp${result.passed ? "" : " is-fail"}`}>
                <span className="grade-word">Grade</span>
                <span className="grade-letter">{result.grade}</span>
                <span className="grade-word">{result.passed ? "Pass" : "Fail"}</span>
              </div>

              <div className="text-right">
                <p className="mono-label">Night score</p>
                <p className="mt-1 font-display text-7xl font-bold leading-[0.8] tracking-tighter text-cream sm:text-8xl">
                  {result.total}
                </p>
                <p className="mono-label mt-2">out of 100</p>
              </div>
            </div>
          </div>

          <div className="scoreboard mt-10">
            <ScoreCell
              label="Clock"
              value={formatClock(result.speed.elapsedSeconds)}
              sub={`par ${formatClock(result.speed.parSeconds)}`}
            />
            <ScoreCell
              label="Evidence"
              value={`${result.investigation.percent}%`}
              sub={`${result.investigation.found.length} checks found`}
            />
            <ScoreCell
              label="Risky moves"
              value={result.safety.mistakes.length}
              sub={result.safety.mistakes.length ? "flagged below" : "clean shift"}
            />
            <ScoreCell
              label="Result"
              value={result.passed ? "PASS" : "FAIL"}
              sub={correct ? "diagnosis correct" : "diagnosis wrong"}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-4 pt-10">
        {/* -------------------------------------------------------- */}
        {/* Score + call                                             */}
        {/* -------------------------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="score-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">01 · The maths</p>
                <h2 id="score-heading" className="display-md mt-2">
                  Score breakdown
                </h2>
              </div>
              <span className={`tag ${result.passed ? "tag-violet" : "tag-amber"}`}>
                {result.passed ? "Passed" : "Failed"}
              </span>
            </div>

            <div className="panel-paper mt-4 p-5">
              <div className="space-y-4">
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
            </div>
          </section>

          <section aria-labelledby="call-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">02 · Your read</p>
                <h2 id="call-heading" className="display-md mt-2">
                  Your call
                </h2>
              </div>
              <span className={`tag ${correct ? "tag-violet" : "tag-amber"}`}>
                {correct ? "Matched" : "Missed"}
              </span>
            </div>

            <div className="panel mt-4 p-5">
              <p className="font-display text-lg font-bold leading-snug">
                {chosen?.label ?? "No diagnosis recorded"}
              </p>

              <div className="mt-4 border-t-2 border-ink/20 pt-3">
                <p className="mono-label">The real root cause</p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-ink-soft">
                  {scenario.rootCauseSummary}
                </p>
              </div>

              {result.fixNote ? (
                <div className="mt-4 border-t-2 border-ink/20 pt-3">
                  <p className="mono-label">Your fix note</p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-soft">
                    {result.fixNote}
                  </p>
                </div>
              ) : null}

              {result.notes.trim() ? (
                <div className="mt-4 border-t-2 border-ink/20 pt-3">
                  <p className="mono-label">Your scratchpad</p>
                  <p className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-soft">
                    {result.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* -------------------------------------------------------- */}
        {/* Explanation                                              */}
        {/* -------------------------------------------------------- */}
        <section className="mt-12" aria-labelledby="explain-heading">
          <div className="section-head">
            <div>
              <p className="mono-label">03 · The story</p>
              <h2 id="explain-heading" className="display-md mt-2">
                What was really going on
              </h2>
            </div>
            <span className="mono-label hidden pb-1 sm:block">Plain English</span>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {[
              { label: "What happened", body: scenario.debrief.whatHappened },
              { label: "How to fix it", body: scenario.debrief.howToFix },
              { label: "Prevent the sequel", body: scenario.debrief.prevention },
            ].map((block, index) => (
              <article key={block.label} className="panel-paper p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p
                    className="font-display text-4xl font-bold leading-none tracking-tight text-violet"
                    aria-hidden="true"
                  >
                    0{index + 1}
                  </p>
                  <p className="mono-label text-right">{block.label}</p>
                </div>
                <p className="mt-4 font-mono text-xs leading-relaxed text-ink-soft">
                  {block.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- */}
        {/* Timeline vs replay                                       */}
        {/* -------------------------------------------------------- */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="timeline-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">04 · Your trail</p>
                <h2 id="timeline-heading" className="display-md mt-2">
                  Your night
                </h2>
              </div>
              <span className="tag">{result.entries.length} commands</span>
            </div>

            <div className="panel mt-4 p-5">
              {result.entries.length ? (
                <ol
                  className="max-h-80 space-y-2 overflow-y-auto pr-1"
                  tabIndex={0}
                  aria-label="Your command timeline"
                >
                  {result.entries.map((entry, index) => (
                    <li
                      key={`${index}-${entry.command}`}
                      className="flex gap-3 border-b border-ink/10 pb-2 last:border-0"
                    >
                      <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-ink-faint">
                        {formatClock(entry.atSeconds)}
                      </span>
                      <code className="min-w-0 break-words font-mono text-xs">
                        {entry.command}
                      </code>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="font-mono text-xs text-ink-faint">
                  No commands. Bold strategy.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="replay-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">05 · The benchmark</p>
                <h2 id="replay-heading" className="display-md mt-2">
                  Senior replay
                </h2>
              </div>
              <span className="tag tag-amber">Optimal path</span>
            </div>

            <div className="panel-dark on-dark mt-4 p-5">
              <ol
                className="max-h-80 space-y-2 overflow-y-auto pr-1"
                tabIndex={0}
                aria-label="Senior replay commands"
              >
                {replay.map((row, index) => (
                  <li
                    key={`${index}-${row.command}`}
                    className="flex items-start gap-3 border-b border-ink-line pb-2 last:border-0"
                  >
                    <span className="w-5 shrink-0 font-mono text-[0.625rem] text-term-dim">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <code
                      className={`min-w-0 flex-1 break-words font-mono text-[0.6875rem] ${
                        row.ran ? "text-term-ok" : "text-term"
                      }`}
                    >
                      {row.command}
                    </code>
                    {row.ran ? (
                      <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-term-ok">
                        ran
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>

              <p className="mt-3 border-t border-ink-line pt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-term-dim">
                Matching commands are highlighted
              </p>
            </div>
          </section>
        </div>

        {/* -------------------------------------------------------- */}
        {/* Risks + coverage                                         */}
        {/* -------------------------------------------------------- */}
        <div className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section aria-labelledby="risk-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">06 · Safety</p>
                <h2 id="risk-heading" className="display-md mt-2">
                  Risky moves
                </h2>
              </div>
              <span
                className={`tag ${
                  result.safety.mistakes.length ? "tag-amber" : "tag-violet"
                }`}
              >
                {result.safety.mistakes.length
                  ? `${result.safety.mistakes.length} flagged`
                  : "Clean"}
              </span>
            </div>

            <div className="panel mt-4 p-5">
              {result.safety.mistakes.length ? (
                <ul className="space-y-3">
                  {result.safety.mistakes.map((mistake) => (
                    <li key={mistake.label} className="border-l-4 border-amber pl-3">
                      <p className="font-display text-sm font-bold">{mistake.label}</p>
                      <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                        {mistake.why}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono text-xs leading-relaxed text-ink-faint">
                  No destructive commands, no blind restarts. A senior engineer would
                  approve.
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="coverage-heading">
            <div className="section-head">
              <div>
                <p className="mono-label">07 · Coverage</p>
                <h2 id="coverage-heading" className="display-md mt-2">
                  Investigation
                </h2>
              </div>
              <span className="tag">
                {result.investigation.found.length} /{" "}
                {result.investigation.found.length + result.investigation.missed.length}
              </span>
            </div>

            <div className="panel mt-4 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mono-label">Evidence found</p>
                  {result.investigation.found.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {result.investigation.found.map((label) => (
                        <li
                          key={label}
                          className="flex gap-2 font-mono text-[0.6875rem] leading-snug"
                        >
                          <span className="font-bold text-violet" aria-hidden="true">
                            +
                          </span>
                          {label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 font-mono text-[0.6875rem] text-ink-faint">
                      Nothing yet.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mono-label">Skipped</p>
                  {result.investigation.missed.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {result.investigation.missed.map((label) => (
                        <li
                          key={label}
                          className="flex gap-2 font-mono text-[0.6875rem] leading-snug text-ink-faint"
                        >
                          <span aria-hidden="true">−</span>
                          {label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 font-mono text-[0.6875rem] text-violet">
                      Full coverage. Nothing missed.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* -------------------------------------------------------- */}
        {/* Next actions                                             */}
        {/* -------------------------------------------------------- */}
        <div className="mt-12 border-[3px] border-ink bg-amber p-5 shadow-[8px_8px_0_0_var(--color-ink)]">
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
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ScoreCell({
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
      <p className="mt-1 font-mono text-[0.625rem] leading-snug text-ink-faint">{note}</p>
    </div>
  );
}
