import { useEffect, useRef } from "react";
import { formatClock } from "../../../engine/scoring";
import type { ActiveRun } from "../types";

interface SidePanelProps {
  run: ActiveRun;
  onHint: () => void;
  onNotes: (value: string) => void;
}

/** Clock, real state, scratchpad, hint. Everything that is not the terminal. */
export function SidePanel({ run, onHint, onNotes }: SidePanelProps) {
  const hintRef = useRef<HTMLParagraphElement>(null);
  const overPar = run.elapsedSeconds > run.scenario.parSeconds;
  const progress = Math.min(
    100,
    Math.round((run.elapsedSeconds / run.scenario.parSeconds) * 100),
  );

  /* The reveal button disappears; move focus to the text it produced. */
  useEffect(() => {
    if (run.hintVisible) hintRef.current?.focus({ preventScroll: true });
  }, [run.hintVisible]);

  return (
    <aside className="space-y-4" aria-label="Incident side panel">
      {/* Clock ----------------------------------------------------- */}
      <div className="panel-dark on-dark p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="mono-label">Time on the clock</p>
          <span className="tag tag-ghost">{overPar ? "Over par" : "On par"}</span>
        </div>

        <p
          className={`mt-2 font-display text-5xl font-bold leading-none tabular-nums ${
            overPar ? "text-alert" : "text-cream"
          }`}
        >
          {formatClock(run.elapsedSeconds)}
        </p>

        <div className="meter meter-amber meter-dark mt-4">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-3 flex items-center justify-between border-t-2 border-ink-line pt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em]">
          <span className="text-term-dim">Par {formatClock(run.scenario.parSeconds)}</span>
          <span className="text-amber">Speed 15 pts</span>
        </div>
      </div>

      {/* Real state ------------------------------------------------- */}
      <div className="panel-paper p-4">
        <p className="mono-label">Box status</p>
        <div className="mt-2 flex items-center gap-2.5">
          <span
            className={`grid h-6 w-6 flex-none place-items-center border-[3px] border-ink ${
              run.world.fixed ? "bg-violet" : "bg-amber"
            }`}
            aria-hidden="true"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                run.world.fixed ? "bg-cream" : "bg-ink"
              }`}
            />
          </span>
          <p className="font-display text-xl font-bold uppercase leading-none">
            {run.world.fixed ? "Service healthy" : "Still broken"}
          </p>
        </div>
        <p className="mt-2 font-mono text-[0.625rem] leading-relaxed text-ink-faint">
          {run.world.fixed
            ? "The simulation agrees: you actually fixed it."
            : "The terminal agrees with the pager. Keep digging."}
        </p>
      </div>

      {/* Scratchpad ------------------------------------------------- */}
      <div className="panel p-4">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="scratchpad" className="mono-label">
            Scratchpad
          </label>
          <span className={`tag ${run.notes.trim() ? "tag-violet" : ""}`}>
            {run.notes.trim() ? "noted" : "empty"}
          </span>
        </div>
        <textarea
          id="scratchpad"
          className="field mt-2.5"
          rows={5}
          value={run.notes}
          onChange={(event) => onNotes(event.target.value)}
          placeholder="What have you ruled out? Paste the log line that convinced you."
        />
      </div>

      {/* Hint ------------------------------------------------------- */}
      <div className={run.hintVisible ? "panel-paper p-4" : "panel p-4"}>
        <div className="flex items-center justify-between gap-2">
          <p className="mono-label">Nudge</p>
          <span className="tag tag-ink">−6 pts</span>
        </div>
        {run.hintVisible ? (
          <div role="status">
            <p
              ref={hintRef}
              tabIndex={-1}
              className="mt-2 border-l-4 border-violet pl-3 font-mono text-xs leading-relaxed"
            >
              {run.scenario.hint}
            </p>
            <p className="mt-3 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
              Hint spent. Back to work.
            </p>
          </div>
        ) : (
          <>
            <p
              id="hint-cost"
              className="mt-2 font-mono text-[0.6875rem] leading-relaxed text-ink-faint"
            >
              Stuck? One nudge per run. It costs 6 points, not your pride.
            </p>
            <button
              type="button"
              className="btn btn-amber btn-sm mt-3 w-full"
              onClick={onHint}
              aria-describedby="hint-cost"
            >
              Reveal hint
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
