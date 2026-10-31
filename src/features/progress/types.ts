import type { Category, Difficulty } from "../../engine/types";

/** One completed run, as stored in localStorage for the logbook. */
export interface RunRecord {
  id: string;
  scenarioId: string;
  title: string;
  category: Category;
  difficulty: Difficulty;
  completedAt: string;
  total: number;
  grade: string;
  passed: boolean;
  correct: boolean;
  resolved: boolean;
  elapsedSeconds: number;
  hintsUsed: number;
}
