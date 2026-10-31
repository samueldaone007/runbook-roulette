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
    <header className="sticky top-0 z-40 bg-ink text-cream">
      <div className="hazard-thin" aria-hidden="true" />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        {/* A real link, so the browser shows a destination and modified clicks
            can open a new tab. The handler keeps the SPA's in-place navigation. */}
        <a
          href="#/"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onNavigateHome();
          }}
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
            <span className="mono-label mt-1 hidden text-term-dim sm:block">
              Night shift simulator
            </span>
          </span>
        </a>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 border-2 border-ink-line px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-term-dim lg:inline-flex">
            <span className="led animate-blink" aria-hidden="true" />
            Simulated · nothing real runs
          </span>
          <nav className="flex items-center gap-1 border-2 border-ink-line p-1" aria-label="Main">
            <NavLink
              href="#/"
              active={active === "home" || active === "incident"}
              onClick={onNavigateHome}
            >
              Play
            </NavLink>
            <NavLink href="#/progress" active={active === "progress"} onClick={onNavigateProgress}>
              Logbook
            </NavLink>
          </nav>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onClick();
      }}
      aria-current={active ? "page" : undefined}
      className="nav-link"
    >
      {children}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="band mt-16">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-4 pb-8 pt-6 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-term-dim sm:flex-row">
        <p>Runbook Roulette · a simulator, not a production terminal</p>
        <p className="text-amber">Page received. Coffee not included.</p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

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
    <div className="border-[3px] border-dashed border-ink bg-paper px-5 py-10 text-center">
      <p className="font-display text-2xl font-bold uppercase tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-md font-mono text-xs leading-relaxed text-ink-faint">
        {body}
      </p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
