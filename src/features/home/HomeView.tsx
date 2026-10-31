import { useState } from "react";
import type { ReactNode } from "react";
import { formatClock } from "../../engine/scoring";
import type { Category, Difficulty, Scenario } from "../../engine/types";
import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
  categories,
  difficulties,
  filterScenarios,
  pickScenario,
  scenarios,
} from "../../scenarios";
import { EmptyState } from "../../shared/SiteChrome";
import { formatWhen } from "../../shared/format";
import { bestRun, currentStreak, passRate } from "../progress/storage";
import type { RunRecord } from "../progress/types";
import { SpinLever } from "../run/components/SpinLever";

interface HomeViewProps {
  records: RunRecord[];
  onPlay: (scenario: Scenario) => void;
  onNavigateProgress: () => void;
}

export function HomeView({ records, onPlay, onNavigateProgress }: HomeViewProps) {
  const [category, setCategory] = useState<Category | "all">("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");

  const pool = filterScenarios({ category, difficulty });
  const availableCategories = categories.filter((entry) =>
    scenarios.some((scenario) => scenario.category === entry),
  );
  const availableDifficulties = difficulties.filter((entry) =>
    scenarios.some((scenario) => scenario.difficulty === entry),
  );

  const customDrawer = category !== "all" || difficulty !== "all";

  const spin = () => {
    const picked = pickScenario(pool);
    if (picked) onPlay(picked);
  };

  const reset = () => {
    setCategory("all");
    setDifficulty("all");
  };

  return (
    <div>
      {/* ---------------------------------------------------------- */}
      {/* Hero cabinet                                                */}
      {/* ---------------------------------------------------------- */}
      <section className="band band-ruled">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-start lg:pb-20 lg:pt-14">
          <div className="min-w-0">
            <p className="eyebrow">Night shift simulator · 03:04</p>

            <h1 className="display-xl mt-5 max-w-3xl text-cream">
              It&apos;s 03:04.
              <br />
              <span className="text-violet-soft">Something is broken.</span>
            </h1>

            <p className="mt-6 max-w-lg font-mono text-sm leading-relaxed text-term-dim">
              Spin a production incident, investigate it in a terminal that cannot
              hurt anything, and name the root cause before the clock eats your
              score.
            </p>

            <div className="mt-8">
              <SpinLever onSpin={spin} disabled={pool.length === 0} poolCount={pool.length} />
            </div>

            <p className="mt-5 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-term-dim">
              Page received. Coffee not included.
            </p>
          </div>

          <MachinePanel records={records} onNavigateProgress={onNavigateProgress} />
        </div>

        {/* Status rail: static, so nothing moves without the user asking. */}
        <div className="border-t-2 border-ink-line bg-ink-soft">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-term-dim">
            <span className="inline-flex items-center gap-2">
              <span className="led animate-blink" aria-hidden="true" />
              Simulated tty
            </span>
            <span>{scenarios.length} incidents in the drum</span>
            <span className="text-amber">Score 0–100</span>
            <span className="ml-auto hidden sm:inline">No real systems are touched</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        {/* -------------------------------------------------------- */}
        {/* Deck & filters                                           */}
        {/* -------------------------------------------------------- */}
        <section className="pt-12" aria-labelledby="deck-heading">
          <div className="section-head">
            <div>
              <p className="eyebrow">The drum</p>
              <h2 id="deck-heading" className="display-lg mt-3">
                The incident deck
              </h2>
            </div>
            <p className="mono-label pb-1">
              {pool.length} of {scenarios.length} loaded
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-5 border-[3px] border-ink bg-ink p-4 text-cream md:flex-row md:items-start md:justify-between md:p-5">
            <div role="group" aria-labelledby="filter-category">
              <p id="filter-category" className="mono-label text-term-dim">
                Category
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip active={category === "all"} onClick={() => setCategory("all")}>
                  All
                </Chip>
                {availableCategories.map((entry) => (
                  <Chip
                    key={entry}
                    active={category === entry}
                    onClick={() => setCategory(entry)}
                  >
                    {CATEGORY_LABELS[entry]}
                  </Chip>
                ))}
              </div>
            </div>

            <div role="group" aria-labelledby="filter-difficulty">
              <p id="filter-difficulty" className="mono-label text-term-dim">
                Difficulty
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip active={difficulty === "all"} onClick={() => setDifficulty("all")}>
                  Any
                </Chip>
                {availableDifficulties.map((entry) => (
                  <Chip
                    key={entry}
                    active={difficulty === entry}
                    onClick={() => setDifficulty(entry)}
                  >
                    {DIFFICULTY_LABELS[entry]}
                  </Chip>
                ))}
              </div>
            </div>

            {customDrawer ? (
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-6 items-center self-start font-mono text-[0.625rem] uppercase tracking-[0.12em] text-cream underline decoration-amber decoration-2 underline-offset-4 hover:text-amber"
              >
                Reset drawer
              </button>
            ) : null}
          </div>

          {pool.length ? (
            <ul className="mt-8 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
              {pool.map((scenario, index) => (
                <li key={scenario.id} className="scenario-card group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="tag tag-amber">{CATEGORY_LABELS[scenario.category]}</span>
                      <span className="tag">{DIFFICULTY_LABELS[scenario.difficulty]}</span>
                    </div>
                    <span className="ticket-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <div>
                    {/* The heading stays a heading; the link inside it names the
                        card. A stretched ::after makes the whole card clickable
                        without a click-handling div. */}
                    <h3 className="font-display text-2xl font-bold leading-[1.02] tracking-tight">
                      <a
                        href={`#/incident/${scenario.id}`}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          onPlay(scenario);
                        }}
                        className="card-link decoration-2 underline-offset-4 group-hover:underline group-focus-within:underline"
                      >
                        {scenario.title}
                      </a>
                    </h3>
                    <p className="mt-2 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                      {scenario.alert.service} · {scenario.alert.symptom}
                    </p>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-3 border-t-2 border-ink/20 pt-3">
                    <div>
                      <p className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em]">
                        {scenario.alert.severity} · {scenario.goodSteps.length} key checks
                      </p>
                      <p className="mono-label mt-1">par {formatClock(scenario.parSeconds)}</p>
                    </div>
                    <span className="card-play" aria-hidden="true">
                      Play →
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-8">
              <EmptyState
                title="No cards in that drawer"
                body="Nothing matches both filters. Widen the drawer to put incidents back in the drum."
                action={
                  <button type="button" className="btn btn-amber" onClick={reset}>
                    Reset filters
                  </button>
                }
              />
            </div>
          )}
        </section>

        {/* -------------------------------------------------------- */}
        {/* How a round works                                        */}
        {/* -------------------------------------------------------- */}
        <section className="mt-16" aria-labelledby="how-heading">
          <div className="section-head">
            <div>
              <p className="eyebrow">The loop</p>
              <h2 id="how-heading" className="display-lg mt-3">
                How a round works
              </h2>
            </div>
            <p className="mono-label hidden pb-1 sm:block">Three moves, one clock</p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Spin",
                body: "A vague page lands. No root cause, no runbook, no helpful colleague. Just a symptom and a clock.",
              },
              {
                title: "Investigate",
                body: "A simulated shell with real state. Free the disk and the restart succeeds. Guess wrong and it keeps failing.",
              },
              {
                title: "Call it",
                body: "Pick the root cause, write the fix in your own words, and get scored on evidence, speed and safety.",
              },
            ].map((step, index) => (
              <article key={step.title} className="panel-paper p-5">
                <div className="flex items-baseline justify-between">
                  <p
                    className="font-display text-4xl font-bold leading-none tracking-tight text-violet"
                    aria-hidden="true"
                  >
                    0{index + 1}
                  </p>
                  <span className="mono-label">{["spin", "dig", "commit"][index]}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 font-mono text-xs leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="chip">
      {children}
    </button>
  );
}

function MachinePanel({
  records,
  onNavigateProgress,
}: {
  records: RunRecord[];
  onNavigateProgress: () => void;
}) {
  const streak = currentStreak(records);
  const rate = passRate(records);
  const best = bestRun(records);
  const last = records[0];

  return (
    <div className="on-paper min-w-0 border-[3px] border-ink bg-paper text-ink shadow-[12px_12px_0_0_var(--color-amber)]">
      <div className="hazard-thin" aria-hidden="true" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono-label">Tonight&apos;s board</p>
            <p className="mt-1 font-display text-lg font-bold uppercase leading-none">
              Shift 03:00–07:00
            </p>
          </div>
          <div className="flex items-center gap-2 border-[3px] border-ink bg-amber px-2.5 py-1.5">
            <Flame active={streak > 0} />
            <div>
              <p className="mono-label text-ink">Streak</p>
              <p className="font-display text-2xl font-bold leading-none">{streak}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-0 border-[3px] border-ink bg-ink [grid-template-columns:repeat(auto-fit,minmax(6.5rem,1fr))]">
          <BoardCell label="Runs" value={records.length} sub="logged" />
          <BoardCell label="Pass rate" value={`${rate}%`} sub="all time" />
          <BoardCell
            label="Best"
            value={best ? formatClock(best.elapsedSeconds) : "--:--"}
            sub={best ? "clean run" : "no pass yet"}
            last
          />
        </div>

        <div className="mt-4 border-t-[3px] border-ink pt-3">
          <p className="mono-label">Last page</p>
          {last ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-display text-sm font-bold">{last.title}</p>
                <p className="font-mono text-[0.625rem] text-ink-faint">
                  {formatWhen(last.completedAt)} · {last.total}/100
                </p>
              </div>
              <span className={`stamp ${last.passed ? "bg-violet text-white" : ""}`}>
                {last.grade}
              </span>
            </div>
          ) : (
            <p className="mt-1 font-mono text-xs text-ink-faint">
              Nothing yet. The pager is warm.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onNavigateProgress}
          className="btn btn-ink mt-4 w-full"
        >
          See the logbook
        </button>
      </div>
    </div>
  );
}

function BoardCell({
  label,
  value,
  sub,
  last,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  last?: boolean;
}) {
  return (
    <div className={`px-3 py-3 ${last ? "" : "border-r-2 border-ink-line"}`}>
      <p className="mono-label text-term-dim">{label}</p>
      <p className="mt-1 whitespace-nowrap font-display text-2xl font-bold leading-none text-cream">
        {value}
      </p>
      <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-amber">
        {sub}
      </p>
    </div>
  );
}

function Flame({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 32"
      className={`h-8 w-6 ${active ? "flame-active" : "opacity-30"}`}
      aria-hidden="true"
    >
      <path
        d="M12 1c1.2 6.2-4.8 7.6-4.8 13.2a4.8 4.8 0 0 0 9.6 0c0-2.6-1.4-4.4-1.4-7.4 3 2 4.9 5.4 4.9 9.2a8.3 8.3 0 1 1-16.6 0C3.7 8.6 10.2 7.6 12 1Z"
        fill="#FFB400"
        stroke="#15141B"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 14c.6 2.4-1.8 3.2-1.8 5.4a2.6 2.6 0 0 0 5.2 0c0-1.4-.9-2.3-1-3.9 1.4 1 2.2 2.5 2.2 4.2a5 5 0 0 1-10 0c0-3.4 3.4-4 5.4-5.7Z"
        fill="#6C3DF4"
        stroke="#15141B"
        strokeWidth="1.2"
      />
    </svg>
  );
}
