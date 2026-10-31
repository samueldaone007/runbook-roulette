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
    <div>
      <section className="band band-ruled">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow">
                Live incident · {CATEGORY_LABELS[run.scenario.category]} ·{" "}
                {DIFFICULTY_LABELS[run.scenario.difficulty]}
              </p>
              <h1 className="display-lg mt-4 max-w-3xl text-cream">
                {run.scenario.title}
              </h1>
            </div>
            <button
              type="button"
              onClick={quit}
              className="btn btn-ghost-dark btn-sm min-h-9"
            >
              Abandon incident
            </button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="relative z-10 -mt-10">
          <AlertBanner scenario={run.scenario} />
        </div>

        <div className="mt-6 flex flex-wrap gap-5">
          <div className="min-w-0 flex-[1_1_34rem]">
            <Terminal run={run} onCommand={onCommand} onClear={onClear} />
          </div>
          <div className="min-w-0 flex-[0_1_22rem]">
            <SidePanel run={run} onHint={onHint} onNotes={onNotes} />
          </div>
        </div>

        <div className="mt-8">
          <DiagnosisForm
            key={run.scenario.id}
            scenario={run.scenario}
            elapsedSeconds={run.elapsedSeconds}
            hintsUsed={run.hintsUsed}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}
