/**
 * The run controller.
 *
 * Owns the live World, the terminal transcript, the clock and the hint budget.
 * The engine below it is pure, so every command produces a brand new World and
 * the UI only ever swaps state — no hidden mutation while React renders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { scoreRun } from "../../engine/scoring";
import { createWorld, execute } from "../../engine/shell";
import type { OutputLine, Scenario } from "../../engine/types";
import type { RunRecord } from "../progress/types";
import { formatPrompt } from "./prompt";
import type { ActiveRun, DebriefData } from "./types";

const LAST_RESULT_KEY = "runbook-roulette.last-result.v1";

function openingLines(scenario: Scenario): OutputLine[] {
  return [
    ...scenario.banner.map((text) => ({ kind: "sys" as const, text })),
    { kind: "sys" as const, text: "" },
    {
      kind: "ok" as const,
      text: "Simulated session established. Nothing here touches a real machine.",
    },
    {
      kind: "sys" as const,
      text: "First move is yours. Investigate, fix what you can, then submit a diagnosis.",
    },
  ];
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveLastResult(data: DebriefData): void {
  try {
    window.sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data));
  } catch {
    // Ignore: the in-memory result still works for this session.
  }
}

function loadLastResult(): DebriefData | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DebriefData;
    return typeof parsed?.scenarioId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function useRunController(recordRun: (record: RunRecord) => void) {
  const [run, setRun] = useState<ActiveRun | null>(null);
  const [lastResult, setLastResult] = useState<DebriefData | null>(() => loadLastResult());
  const startedAtRef = useRef<number | null>(null);

  /* Tick once a second while an incident is open. */
  useEffect(() => {
    if (!run) return;
    const id = window.setInterval(() => {
      setRun((current) =>
        current
          ? {
              ...current,
              elapsedSeconds: Math.max(
                0,
                Math.floor((Date.now() - current.startedAt) / 1000),
              ),
            }
          : current,
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [run?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRun = useCallback((scenario: Scenario) => {
    const now = Date.now();
    startedAtRef.current = now;
    setRun({
      scenario,
      world: createWorld(scenario),
      lines: openingLines(scenario),
      entries: [],
      startedAt: now,
      elapsedSeconds: 0,
      hintsUsed: 0,
      hintVisible: false,
      notes: "",
    });
  }, []);

  const abandonRun = useCallback(() => {
    setRun(null);
    startedAtRef.current = null;
  }, []);

  const runCommand = useCallback((raw: string) => {
    const command = raw.trim();
    if (!command) return;

    setRun((current) => {
      if (!current) return current;

      const atSeconds = Math.max(
        0,
        Math.floor((Date.now() - current.startedAt) / 1000),
      );
      const result = execute(current.scenario, current.world, command);
      const prompt = formatPrompt(current.scenario, current.world);

      const added: OutputLine[] = [
        { kind: "cmd", text: `${prompt} ${command}` },
        ...result.lines,
      ];

      // Celebrate the real state change, not the command that looks right.
      if (!current.world.fixed && result.world.fixed) {
        added.push(
          { kind: "sys", text: "" },
          {
            kind: "ok",
            text: "● SERVICE HEALTHY — that fixed it. Submit your diagnosis when you are ready.",
          },
        );
      }

      return {
        ...current,
        world: result.world,
        lines: [...current.lines, ...added],
        entries: [...current.entries, { command, atSeconds }],
        elapsedSeconds: atSeconds,
      };
    });
  }, []);

  const useHint = useCallback(() => {
    setRun((current) => {
      if (!current || current.hintVisible) return current;
      return { ...current, hintVisible: true, hintsUsed: current.hintsUsed + 1 };
    });
  }, []);

  const setNotes = useCallback((notes: string) => {
    setRun((current) => (current ? { ...current, notes } : current));
  }, []);

  const clearTerminal = useCallback(() => {
    setRun((current) =>
      current
        ? {
            ...current,
            lines: [
              ...openingLines(current.scenario),
              { kind: "sys", text: "Screen cleared. The incident is still live." },
            ],
          }
        : current,
    );
  }, []);

  const submitDiagnosis = useCallback(
    (rootCauseId: string, fixNote: string): DebriefData | null => {
      if (!run) return null;

      const elapsedSeconds = Math.max(
        1,
        Math.floor((Date.now() - run.startedAt) / 1000),
      );
      const resolved = run.world.fixed;

      const score = scoreRun({
        scenario: run.scenario,
        entries: run.entries,
        elapsedSeconds,
        hintsUsed: run.hintsUsed,
        rootCauseId,
        resolved,
      });

      const data: DebriefData = {
        scenarioId: run.scenario.id,
        chosenRootCauseId: rootCauseId,
        total: score.total,
        grade: score.grade,
        passed: score.passed,
        correctness: score.correctness,
        investigation: {
          points: score.investigation.points,
          max: score.investigation.max,
          percent: score.investigation.percent,
          found: score.investigation.found.map((step) => step.label),
          missed: score.investigation.missed.map((step) => step.label),
        },
        speed: score.speed,
        safety: {
          points: score.safety.points,
          max: score.safety.max,
          mistakes: score.safety.mistakes.map((mistake) => ({
            label: mistake.label,
            why: mistake.why,
          })),
        },
        hints: score.hints,
        resolved,
        entries: run.entries,
        fixNote: fixNote.trim(),
        notes: run.notes,
        completedAt: new Date().toISOString(),
      };

      recordRun({
        id: createId(),
        scenarioId: run.scenario.id,
        title: run.scenario.title,
        category: run.scenario.category,
        difficulty: run.scenario.difficulty,
        completedAt: data.completedAt,
        total: data.total,
        grade: data.grade,
        passed: data.passed,
        correct: data.correctness.correct,
        resolved,
        elapsedSeconds,
        hintsUsed: run.hintsUsed,
      });

      saveLastResult(data);
      setLastResult(data);
      setRun(null);
      startedAtRef.current = null;
      return data;
    },
    [run, recordRun],
  );

  return {
    run,
    lastResult,
    startRun,
    abandonRun,
    runCommand,
    useHint,
    setNotes,
    clearTerminal,
    submitDiagnosis,
    clearLastResult: () => setLastResult(null),
  };
}
