import type { Scenario } from "../../../engine/types";

/** The pager alert. Vague on purpose — no root cause, no comfort. */
export function AlertBanner({ scenario }: { scenario: Scenario }) {
  return (
    <section className="alert-banner" role="alert" aria-live="assertive">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="alert-badge">{scenario.alert.severity}</span>
          <div className="hidden sm:block">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Page received</p>
            <p className="mt-0.5 font-mono text-xs font-bold">
              {scenario.alert.at} · {scenario.alert.service}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 border-t-2 border-ink/40 pt-3 sm:border-l-2 sm:border-t-0 sm:pl-5 sm:pt-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] sm:hidden">
            {scenario.alert.at} · {scenario.alert.service}
          </p>
          <p className="mt-1 font-display text-lg font-bold leading-snug sm:text-xl">
            {scenario.alert.symptom}
          </p>
        </div>

        <div className="shrink-0 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em]">
          <p>Responder: {scenario.user}</p>
          <p>Status: investigating</p>
        </div>
      </div>
    </section>
  );
}
