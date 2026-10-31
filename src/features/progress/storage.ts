/**
 * Progress persistence.
 *
 * localStorage only — no backend, no account. Every read is defensive: a
 * corrupted or hand-edited value should never break the app.
 */

import type { Category } from "../../engine/types";
import { CATEGORY_LABELS } from "../../scenarios";
import type { RunRecord } from "./types";

const RUNS_KEY = "runbook-roulette.runs.v1";
const MAX_RECORDS = 200;

function isRecord(value: unknown): value is RunRecord {
  const candidate = value as Partial<RunRecord> | null;
  return Boolean(
    candidate &&
      typeof candidate.id === "string" &&
      typeof candidate.scenarioId === "string" &&
      typeof candidate.completedAt === "string" &&
      typeof candidate.total === "number" &&
      typeof candidate.grade === "string" &&
      typeof candidate.passed === "boolean" &&
      typeof candidate.elapsedSeconds === "number",
  );
}

export function loadRecords(): RunRecord[] {
  try {
    const raw = window.localStorage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord).slice(0, MAX_RECORDS) : [];
  } catch {
    return [];
  }
}

export function saveRecords(records: RunRecord[]): void {
  try {
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // Private mode or a full quota: the current session still works.
  }
}

/* ------------------------------------------------------------------ */
/* Derived stats                                                       */
/* ------------------------------------------------------------------ */

/** Consecutive passes counting back from the most recent run. */
export function currentStreak(records: RunRecord[]): number {
  let streak = 0;
  for (const record of records) {
    if (!record.passed) break;
    streak += 1;
  }
  return streak;
}

export function passRate(records: RunRecord[]): number {
  if (!records.length) return 0;
  return Math.round((records.filter((record) => record.passed).length / records.length) * 100);
}

/** Fastest passing run, or null if nothing has passed yet. */
export function bestRun(records: RunRecord[]): RunRecord | null {
  const passes = records.filter((record) => record.passed);
  if (!passes.length) return null;
  return passes.reduce((best, record) =>
    record.elapsedSeconds < best.elapsedSeconds ? record : best,
  );
}

export function fastestPasses(records: RunRecord[], limit = 3): RunRecord[] {
  return records
    .filter((record) => record.passed)
    .slice()
    .sort((a, b) => a.elapsedSeconds - b.elapsedSeconds)
    .slice(0, limit);
}

export interface CategoryStat {
  category: Category;
  label: string;
  runs: number;
  passes: number;
  rate: number;
}

/**
 * Weakest categories first. Categories only appear once they have been played,
 * so the panel never scolds you about something you have not tried.
 */
export function categoryStats(records: RunRecord[]): CategoryStat[] {
  const buckets = new Map<Category, { runs: number; passes: number }>();

  for (const record of records) {
    const bucket = buckets.get(record.category) ?? { runs: 0, passes: 0 };
    bucket.runs += 1;
    if (record.passed) bucket.passes += 1;
    buckets.set(record.category, bucket);
  }

  return [...buckets.entries()]
    .map(([category, bucket]) => ({
      category,
      label: CATEGORY_LABELS[category],
      runs: bucket.runs,
      passes: bucket.passes,
      rate: Math.round((bucket.passes / bucket.runs) * 100),
    }))
    .sort((a, b) => a.rate - b.rate || b.runs - a.runs);
}
