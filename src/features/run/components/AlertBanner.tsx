import type { Scenario } from "../../../engine/types";

/** The pager alert. Vague on purpose — no root cause, no comfort. */
export function AlertBanner({ scenario }: { scenario: Scenario }) {
  return (
    <section className="alert-banner" role="alert" aria-live="assertive">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="alert-badge">
            {scenario.alert.severity}
          </span>
          <div>
            <p className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.2em]">
              Page received
            </p>
            <p className="mt-1 font-mono text-xs font-bold">
              {scenario.alert.at} · {scenario.alert.service}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 border-t-2 border-ink/40 pt-3 sm:border-l-2 sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="font-display text-xl font-bold leading-[1.15] md:text-2xl">
            {scenario.alert.symptom}
          </p>
        </div>

        <div className="shrink-0 border-t-2 border-ink/40 pt-2 font-mono text-[0.625rem] uppercase leading-relaxed tracking-[0.12em] sm:border-t-0 sm:pt-0 sm:text-right">
          <p>
            <span className="inline-block w-[4.5rem] font-bold">Responder</span>{" "}
            {scenario.user}
          </p>
          <p>
            <span className="inline-block w-[4.5rem] font-bold">Status</span>{" "}
            investigating
          </p>
        </div>
      </div>
    </section>
  );
}
