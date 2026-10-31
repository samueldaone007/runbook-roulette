import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Site chrome                                                         */
/* ------------------------------------------------------------------ */

interface SiteHeaderProps {
  active: "home" | "incident" | "progress";
  onNavigateHome: () => void;
  onNavigateProgress: () => void;
}

export function SiteHeader({ active, onNavigateHome, onNavigateProgress }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-cream/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={onNavigateHome}
          className="group flex items-center gap-3 text-left"
          aria-label="Runbook Roulette home"
        >
          <span className="logo-mark" aria-hidden="true">
            RR
          </span>
          <span>
            <span className="block font-display text-lg font-bold uppercase leading-none tracking-tight">
              Runbook Roulette
            </span>
            <span className="mono-label hidden sm:block">Incident response practice</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 border-2 border-ink bg-cream px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] md:inline-flex">
            <span className="inline-block h-2 w-2 animate-blink rounded-full bg-alert" aria-hidden="true" />
            Simulated · nothing real runs
          </span>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavButton
              active={active === "home" || active === "incident"}
              onClick={onNavigateHome}
            >
              Play
            </NavButton>
            <NavButton active={active === "progress"} onClick={onNavigateProgress}>
              Progress
            </NavButton>
          </nav>
        </div>
      </div>
    </header>
  );
}

function NavButton({
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
      aria-current={active ? "page" : undefined}
      className={[
        "border-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-ink bg-amber text-ink shadow-[2px_2px_0_0_#1C1B22]"
          : "border-transparent text-ink hover:border-ink hover:bg-cream-deep",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16">
      <div className="hazard" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-4 py-6 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint sm:flex-row">
        <p>Runbook Roulette · a simulator, not a production terminal</p>
        <p>Page received. Coffee not included.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  sub,
  accent = "cream",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: "cream" | "amber" | "violet" | "ink";
}) {
  return (
    <div className={`stat-card${accent === "cream" ? "" : ` stat-${accent}`}`}>
      <p className="mono-label">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-none sm:text-3xl">{value}</p>
      {sub ? (
        <p className="stat-sub mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-faint">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-[3px] border-dashed border-ink bg-cream/60 px-5 py-8 text-center">
      <p className="font-display text-xl font-bold uppercase tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
        {body}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
