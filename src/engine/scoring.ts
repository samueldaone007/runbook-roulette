/**
 * Scoring.
 *
 * Five inputs, exactly as advertised on the debrief screen:
 *   correctness (40) · investigation (30) · speed (15) · safety (15) · hints (-6 each)
 *
 * A wrong root cause can never pass, no matter how fast or safe the run was.
 */

import type { BadAction, CommandStep, Scenario } from "./types";

export interface RunEntry {
  command: string;
  /** Seconds since the incident started. */
  atSeconds: number;
}

export interface ScoreInput {
  scenario: Scenario;
  entries: RunEntry[];
  elapsedSeconds: number;
  hintsUsed: number;
  rootCauseId: string | null;
  /** Whether the box was actually left healthy. Shown, not required to pass. */
  resolved: boolean;
}

export interface ScoreBreakdown {
  total: number;
  grade: string;
  passed: boolean;
  correctness: { points: number; max: number; correct: boolean };
  investigation: {
    points: number;
    max: number;
    found: CommandStep[];
    missed: CommandStep[];
    percent: number;
  };
  speed: { points: number; max: number; elapsedSeconds: number; parSeconds: number };
  safety: { points: number; max: number; mistakes: BadAction[] };
  hints: { points: number; used: number };
  resolved: boolean;
}

const MAX = {
  correctness: 40,
  investigation: 30,
  speed: 15,
  safety: 15,
  hint: 6,
} as const;

function stripSudo(command: string): string {
  return command.trim().replace(/^sudo\s+/, "").replace(/\s+/g, " ");
}

export function stepMatches(step: CommandStep, command: string): boolean {
  const clean = stripSudo(command);
  if (step.match) return step.match.test(clean);
  return clean === stripSudo(step.command);
}

export function scoreRun(input: ScoreInput): ScoreBreakdown {
  const { scenario, entries, elapsedSeconds, hintsUsed, rootCauseId, resolved } = input;

  /* --- correctness: all or nothing ------------------------------- */
  const correct = rootCauseId === scenario.rootCauseId;
  const correctness = correct ? MAX.correctness : 0;

  /* --- investigation: weighted coverage of the good steps --------- */
  const found: CommandStep[] = [];
  const missed: CommandStep[] = [];
  for (const step of scenario.goodSteps) {
    const hit = entries.some((entry) => stepMatches(step, entry.command));
    (hit ? found : missed).push(step);
  }
  const totalWeight = scenario.goodSteps.reduce((sum, step) => sum + (step.weight ?? 1), 0);
  const foundWeight = found.reduce((sum, step) => sum + (step.weight ?? 1), 0);
  const coverage = totalWeight === 0 ? 1 : foundWeight / totalWeight;
  const investigation = Math.round(MAX.investigation * coverage);

  /* --- speed: full marks at or under par, zero at 3x par ---------- */
  const par = scenario.parSeconds;
  const speedRatio =
    elapsedSeconds <= par ? 1 : Math.max(0, 1 - (elapsedSeconds - par) / (par * 2));
  const speed = Math.round(MAX.speed * speedRatio);

  /* --- safety: repeated risky commands only sting once ------------ */
  const mistakes: BadAction[] = [];
  for (const action of scenario.badActions) {
    const hit = entries.some((entry) => action.pattern.test(stripSudo(entry.command)));
    if (hit) mistakes.push(action);
  }
  const penalty = mistakes.reduce((sum, action) => sum + action.penalty, 0);
  const safety = Math.max(0, MAX.safety - penalty);

  /* --- hints ------------------------------------------------------ */
  const hintPenalty = Math.max(0, hintsUsed) * MAX.hint;

  const raw = correctness + investigation + speed + safety - hintPenalty;
  const total = Math.max(0, Math.min(100, Math.round(raw)));
  const passed = correct && total >= 60;

  return {
    total,
    grade: gradeFor(total, correct),
    passed,
    correctness: { points: correctness, max: MAX.correctness, correct },
    investigation: {
      points: investigation,
      max: MAX.investigation,
      found,
      missed,
      percent: Math.round(coverage * 100),
    },
    speed: { points: speed, max: MAX.speed, elapsedSeconds, parSeconds: par },
    safety: { points: safety, max: MAX.safety, mistakes },
    hints: { points: -hintPenalty, used: hintsUsed },
    resolved,
  };
}

export function gradeFor(total: number, correct: boolean): string {
  // A wrong diagnosis is capped at D on purpose: speed is not the lesson.
  if (!correct) return total >= 50 ? "D" : "F";
  if (total >= 95) return "A+";
  if (total >= 88) return "A";
  if (total >= 78) return "B";
  if (total >= 68) return "C";
  if (total >= 60) return "D";
  return "F";
}

/** `03:42` style clock for the debrief and the run log. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
