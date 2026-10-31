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
import { StatCard } from "../../shared/SiteChrome";
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
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      {/* ---------------------------------------------------------- */}
      {/* Hero                                                       */}
      {/* ---------------------------------------------------------- */}
      {/* Flex with rem bases, not a px breakpoint: at 200% text the two halves
          wrap instead of squeezing the board until its stats clip. */}
      <section className="flex flex-wrap gap-8">
        <div className="min-w-0 flex-[1_1_32rem]">
          <p className="eyebrow">Night shift simulator</p>
          <h1 className="mt-4 max-w-2xl font-display text-5xl font-bold uppercase leading-[0.88] tracking-tight sm:text-6xl lg:text-7xl">
            It&apos;s 03:04.{" "}
            <br />
            <span className="text-violet">Something is broken.</span>
          </h1>
          <p className="mt-5 max-w-xl font-mono text-sm leading-relaxed text-ink-soft">
            Spin a production incident, investigate it in a terminal that cannot hurt
            anything, and name the root cause before the clock eats your score.
          </p>

          <div className="mt-7">
            <SpinLever onSpin={spin} disabled={pool.length === 0} poolCount={pool.length} />
          </div>
          <p className="mt-3 font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
            Page received. Coffee not included.
          </p>
        </div>

        <div className="min-w-0 flex-[1_1_26rem]">
          <MachinePanel
            records={records}
            onNavigateProgress={onNavigateProgress}
          />
        </div>
      </section>

      <div className="hazard my-10" aria-hidden="true" />

      {/* ---------------------------------------------------------- */}
      {/* Deck & filters                                             */}
      {/* ---------------------------------------------------------- */}
      <section aria-labelledby="deck-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">The drum</p>
            <h2
              id="deck-heading"
              className="mt-2 font-display text-3xl font-bold uppercase tracking-tight"
            >
              The incident deck
            </h2>
          </div>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
            {pool.length} of {scenarios.length} incidents loaded
          </p>
        </div>

        <div className="panel mt-5 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div role="group" aria-labelledby="filter-category">
              <p id="filter-category" className="mono-label">
                Category
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
              <p id="filter-difficulty" className="mono-label">
                Difficulty
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
                className="inline-flex min-h-6 items-center self-start font-mono text-[0.625rem] uppercase tracking-[0.12em] underline decoration-2 underline-offset-4 hover:text-violet"
              >
                Reset drawer
              </button>
            ) : null}
          </div>
        </div>

        {pool.length ? (
          <ul className="mt-5 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {pool.map((scenario) => (
              <li key={scenario.id} className="scenario-card group relative">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="tag tag-amber">{CATEGORY_LABELS[scenario.category]}</span>
                  <span className="tag">{DIFFICULTY_LABELS[scenario.difficulty]}</span>
                  <span className="ml-auto font-mono text-[0.625rem] uppercase tracking-[0.1em] text-ink-faint">
                    par {formatClock(scenario.parSeconds)}
                  </span>
                </div>

                <div>
                  {/* The heading stays a heading; the link inside it names the
                      card. A stretched ::after makes the whole card clickable
                      without a click-handling div. */}
                  <h3 className="font-display text-lg font-bold leading-tight">
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
                  <p className="mt-1 line-clamp-2 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                    {scenario.alert.service} · {scenario.alert.symptom}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between border-t-2 border-ink/15 pt-3">
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em]">
                    {scenario.alert.severity} · {scenario.goodSteps.length} key checks
                  </span>
                  <span
                    aria-hidden="true"
                    className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] group-hover:text-violet"
                  >
                    Play →
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <div className="border-[3px] border-dashed border-ink bg-cream/60 px-5 py-8 text-center">
              <p className="font-display text-xl font-bold uppercase tracking-tight">
                Empty drawer
              </p>
              <p className="mx-auto mt-2 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
                No incidents match that combination yet. Widen the drawer — the
                remaining scenarios arrive with the next build.
              </p>
              <button type="button" className="btn btn-amber btn-sm mt-4" onClick={reset}>
                Reset drawer
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------- */}
      {/* How a round works                                          */}
      {/* ---------------------------------------------------------- */}
      <section className="mt-12" aria-labelledby="how-heading">
        <p className="eyebrow">The loop</p>
        <h2
          id="how-heading"
          className="mt-2 font-display text-3xl font-bold uppercase tracking-tight"
        >
          How a round works
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
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
            <article key={step.title} className="panel p-5">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.16em] text-ink-faint">
                0{index + 1}
              </p>
              <h3 className="mt-2 font-display text-xl font-bold uppercase tracking-tight">
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip border-2 border-ink px-2.5 py-1 font-mono text-[0.625rem] uppercase tracking-[0.1em] transition-colors ${
        active ? "bg-ink text-cream" : "bg-cream hover:bg-paper"
      }`}
    >
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
    <div className="panel overflow-hidden">
      <div className="hazard-thin" aria-hidden="true" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono-label">Tonight&apos;s board</p>
            <p className="mt-1 font-display text-lg font-bold uppercase leading-none">
              Shift 03:00–07:00
            </p>
          </div>
          <div className="flex items-center gap-2 border-2 border-ink bg-cream px-2 py-1">
            <Flame active={streak > 0} />
            <div>
              <p className="mono-label">Streak</p>
              <p className="font-display text-2xl font-bold leading-none">{streak}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]">
          <StatCard label="Runs" value={records.length} sub="logged" />
          <StatCard label="Pass rate" value={`${rate}%`} sub="all time" />
          <StatCard
            label="Best"
            value={best ? formatClock(best.elapsedSeconds) : "--:--"}
            sub={best ? "clean run" : "no pass yet"}
            accent="amber"
          />
        </div>

        <div className="mt-4 border-t-2 border-ink/20 pt-3">
          <p className="mono-label">Last page</p>
          {last ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold">{last.title}</p>
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
          className="btn btn-ghost btn-sm mt-4 w-full"
        >
          See the logbook
        </button>
      </div>
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
        stroke="#1C1B22"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 14c.6 2.4-1.8 3.2-1.8 5.4a2.6 2.6 0 0 0 5.2 0c0-1.4-.9-2.3-1-3.9 1.4 1 2.2 2.5 2.2 4.2a5 5 0 0 1-10 0c0-3.4 3.4-4 5.4-5.7Z"
        fill="#6C3DF4"
        stroke="#1C1B22"
        strokeWidth="1.2"
      />
    </svg>
  );
}
