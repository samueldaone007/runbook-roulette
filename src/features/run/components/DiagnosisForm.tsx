import { useRef, useState } from "react";
import { formatClock } from "../../../engine/scoring";
import type { Scenario } from "../../../engine/types";

interface DiagnosisFormProps {
  scenario: Scenario;
  elapsedSeconds: number;
  hintsUsed: number;
  onSubmit: (rootCauseId: string, fixNote: string) => void;
}

/** Pick the root cause, optionally write the fix, end the run. */
export function DiagnosisForm({
  scenario,
  elapsedSeconds,
  hintsUsed,
  onSubmit,
}: DiagnosisFormProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const firstOptionRef = useRef<HTMLInputElement>(null);

  /* A failed submit moves the user to the choice they still have to make, not
     just to a message. The alert is announced either way. */
  const requireChoice = () => {
    setError("Pick a root cause before submitting.");
    firstOptionRef.current?.focus();
  };

  return (
    <section className="panel-paper" aria-labelledby="diagnosis-heading">
      {/* Call-sheet header: this is the decision point, so it gets the ink
          strip and the only red LED left on screen. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink bg-ink px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="led animate-blink" aria-hidden="true" />
          <div>
            <p className="mono-label text-term-dim">Final call</p>
            <h2
              id="diagnosis-heading"
              className="mt-0.5 font-display text-2xl font-bold uppercase leading-none tracking-tight text-cream"
            >
              Diagnose the incident
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="tag tag-ghost">{formatClock(elapsedSeconds)} elapsed</span>
          <span className="tag tag-ghost">
            {hintsUsed} {hintsUsed === 1 ? "hint" : "hints"}
          </span>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <p className="max-w-xl font-mono text-xs leading-relaxed text-ink-faint">
          Pick the root cause. The fix note is optional — but writing it is how the
          lesson sticks.
        </p>

        <fieldset className="mt-5">
          <legend className="mono-label mb-2">Root cause</legend>
          <div className="grid gap-2.5 md:grid-cols-2">
            {scenario.options.map((option, index) => {
              const active = selected === option.id;
              return (
                <label
                  key={option.id}
                  className={`relative flex cursor-pointer gap-3 border-[3px] border-ink p-3 transition-[background-color,box-shadow] ${
                    active
                      ? "bg-amber shadow-[5px_5px_0_0_var(--color-ink)]"
                      : "bg-cream hover:bg-paper"
                  }`}
                >
                  <input
                    ref={index === 0 ? firstOptionRef : undefined}
                    type="radio"
                    name="root-cause"
                    value={option.id}
                    checked={active}
                    onChange={() => {
                      setSelected(option.id);
                      setError(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "diagnosis-error" : undefined}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-5 w-5 flex-none place-items-center border-2 border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet ${
                      active ? "bg-ink" : "bg-paper"
                    }`}
                  >
                    {active ? (
                      <span className="text-[0.7rem] font-bold leading-none text-amber">✓</span>
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em] ${
                        active ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      Option {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-1 block font-display text-sm font-bold leading-snug">
                      {option.label}
                    </span>
                    {option.detail ? (
                      <span className="mt-1 block font-mono text-[0.625rem] leading-relaxed text-ink-faint">
                        {option.detail}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <label htmlFor="fix-note" className="mono-label">
            Your fix note (optional)
          </label>
          <textarea
            id="fix-note"
            className="field mt-2"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. Free the volume, restart the upstream, re-enable logrotate."
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-[3px] border-ink pt-4">
          <div>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
              Wrong call = no pass, however fast you were.
            </p>
            {error ? (
              <p
                id="diagnosis-error"
                role="alert"
                className="mt-1 font-mono text-[0.625rem] font-bold uppercase tracking-[0.12em] text-alert-deep"
              >
                {error}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ink"
            onClick={() => {
              if (!selected) {
                requireChoice();
                return;
              }
              onSubmit(selected, note);
            }}
          >
            Submit diagnosis →
          </button>
        </div>
      </div>
    </section>
  );
}
