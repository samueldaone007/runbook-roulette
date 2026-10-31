import {
  CATEGORY_LABELS,
  DIFFICULTY_LABELS,
} from "../../../scenarios";
import type { ActiveRun } from "../types";
import { AlertBanner } from "./AlertBanner";
import { DiagnosisForm } from "./DiagnosisForm";
import { SidePanel } from "./SidePanel";
import { Terminal } from "./Terminal";

interface IncidentViewProps {
  run: ActiveRun;
  onCommand: (command: string) => void;
  onHint: () => void;
  onNotes: (value: string) => void;
  onClear: () => void;
  onSubmit: (rootCauseId: string, fixNote: string) => void;
  onQuit: () => void;
}

export function IncidentView({
  run,
  onCommand,
  onHint,
  onNotes,
  onClear,
  onSubmit,
  onQuit,
}: IncidentViewProps) {
  const quit = () => {
    if (window.confirm("Abandon this incident? The run won't be scored.")) {
      onQuit();
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            Live incident · {CATEGORY_LABELS[run.scenario.category]} ·{" "}
            {DIFFICULTY_LABELS[run.scenario.difficulty]}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-none tracking-tight md:text-4xl">
            {run.scenario.title}
          </h1>
        </div>
        <button
          type="button"
          onClick={quit}
          className="font-mono text-[10px] uppercase tracking-[0.14em] underline decoration-2 underline-offset-4 hover:text-violet"
        >
          Abandon incident
        </button>
      </div>

      <AlertBanner scenario={run.scenario} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <Terminal run={run} onCommand={onCommand} onClear={onClear} />
        <SidePanel run={run} onHint={onHint} onNotes={onNotes} />
      </div>

      <div className="mt-6">
        <DiagnosisForm
          scenario={run.scenario}
          elapsedSeconds={run.elapsedSeconds}
          hintsUsed={run.hintsUsed}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
