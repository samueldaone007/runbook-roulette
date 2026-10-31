import type { RunEntry } from "../../engine/scoring";
import type { OutputLine, Scenario, World } from "../../engine/types";

/** A run in progress. Everything the incident screen needs. */
export interface ActiveRun {
  scenario: Scenario;
  world: World;
  lines: OutputLine[];
  entries: RunEntry[];
  startedAt: number;
  elapsedSeconds: number;
  hintsUsed: number;
  hintVisible: boolean;
  notes: string;
}

/**
 * A completed run, flattened for the debrief screen.
 *
 * Deliberately not `ScoreBreakdown`: this object is written to sessionStorage,
 * and the raw breakdown carries RegExp values that JSON would silently eat.
 */
export interface DebriefData {
  scenarioId: string;
  chosenRootCauseId: string;
  total: number;
  grade: string;
  passed: boolean;
  correctness: { points: number; max: number; correct: boolean };
  investigation: {
    points: number;
    max: number;
    percent: number;
    found: string[];
    missed: string[];
  };
  speed: { points: number; max: number; elapsedSeconds: number; parSeconds: number };
  safety: { points: number; max: number; mistakes: { label: string; why: string }[] };
  hints: { points: number; used: number };
  resolved: boolean;
  entries: RunEntry[];
  /** The free-text fix written on the diagnosis form. */
  fixNote: string;
  /** The scratchpad from the side panel. */
  notes: string;
  completedAt: string;
}
