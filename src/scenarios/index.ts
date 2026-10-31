/**
 * Scenario registry.
 *
 * Adding a scenario:
 *   1. create `src/scenarios/my-incident.ts` exporting a `Scenario`
 *   2. import it here and push it into `scenarios`
 *   3. run `npm test` — the shared scenario contract test will validate it
 *
 * Future scenarios live behind the same interface, so the UI never changes.
 */

import type { Category, Difficulty, Scenario } from "../engine/types";
import { diskFull } from "./disk-full";
import { expiredCert } from "./expired-cert";

export const scenarios: Scenario[] = [diskFull, expiredCert];

export const scenariosById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

export const CATEGORY_LABELS: Record<Category, string> = {
  linux: "Linux",
  network: "Network",
  tls: "TLS",
  containers: "Containers",
  orchestration: "Kubernetes",
  database: "Database",
  access: "Access",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
};

export const categories: Category[] = [
  "linux",
  "network",
  "tls",
  "containers",
  "orchestration",
  "database",
  "access",
];

export const difficulties: Difficulty[] = ["junior", "mid", "senior"];

export interface ScenarioFilter {
  category: Category | "all";
  difficulty: Difficulty | "all";
}

export function filterScenarios(filter: ScenarioFilter): Scenario[] {
  return scenarios.filter(
    (scenario) =>
      (filter.category === "all" || scenario.category === filter.category) &&
      (filter.difficulty === "all" || scenario.difficulty === filter.difficulty),
  );
}

/** Deterministic when a random source is injected, which is what tests use. */
export function pickScenario(
  pool: Scenario[],
  random: () => number = Math.random,
  excludeId?: string,
): Scenario | null {
  const candidates = pool.length > 1 && excludeId ? pool.filter((s) => s.id !== excludeId) : pool;
  if (!candidates.length) return null;
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}

export function getScenario(id: string | null | undefined): Scenario | null {
  if (!id) return null;
  return scenariosById.get(id) ?? null;
}
