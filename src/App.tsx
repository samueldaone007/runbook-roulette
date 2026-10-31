import { useEffect, useRef } from "react";
import type { Scenario } from "./engine/types";
import { navigate, useRoute } from "./app/router";
import { DebriefView } from "./features/debrief/DebriefView";
import { HomeView } from "./features/home/HomeView";
import { ProgressView } from "./features/progress/ProgressView";
import { useRunHistory } from "./features/progress/useRunHistory";
import { IncidentView } from "./features/run/components/IncidentView";
import { useRunController } from "./features/run/useRunController";
import { getScenario, pickScenario, scenarios } from "./scenarios";
import { SiteFooter, SiteHeader } from "./shared/SiteChrome";

export default function App() {
  const route = useRoute();
  const { records, recordRun, clearHistory } = useRunHistory();
  const controller = useRunController(recordRun);
  const { startRun, abandonRun } = controller;

  const incidentId = route.name === "incident" ? route.id : null;
  const runId = controller.run?.scenario.id ?? null;

  /**
   * Submitting or abandoning sets `run` to null before the hash change lands.
   * Without this guard the auto-start effect would immediately spin the same
   * incident back up in the gap between the two renders.
   */
  const suppressStart = useRef(false);

  useEffect(() => {
    if (!incidentId) {
      suppressStart.current = false;
      return;
    }
    if (suppressStart.current) return;
    if (runId === incidentId) return;

    const scenario = getScenario(incidentId);
    if (scenario) startRun(scenario);
  }, [incidentId, runId, startRun]);

  useEffect(() => {
    const label =
      route.name === "incident"
        ? getScenario(route.id)?.title
        : route.name === "debrief"
          ? "Debrief"
          : route.name === "progress"
            ? "Logbook"
            : null;
    document.title = label ? `${label} · Runbook Roulette` : "Runbook Roulette";
  }, [route]);

  const leaveTo = (path: string) => {
    suppressStart.current = true;
    abandonRun();
    navigate(path);
  };

  const goHome = () => leaveTo("/");
  const goProgress = () => leaveTo("/progress");

  const play = (scenario: Scenario) => {
    startRun(scenario);
    navigate(`/incident/${scenario.id}`);
  };

  const submit = (rootCauseId: string, fixNote: string) => {
    suppressStart.current = true;
    const result = controller.submitDiagnosis(rootCauseId, fixNote);
    if (result) {
      navigate(`/debrief/${result.scenarioId}`);
    } else {
      suppressStart.current = false;
    }
  };

  const next = (currentId: string) => {
    const picked = pickScenario(scenarios, Math.random, currentId);
    if (picked) play(picked);
    else goHome();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        active={route.name === "incident" ? "incident" : route.name === "progress" ? "progress" : "home"}
        onNavigateHome={goHome}
        onNavigateProgress={goProgress}
      />

      <main className="flex-1">
        {route.name === "home" ? (
          <HomeView
            records={records}
            onPlay={play}
            onNavigateProgress={goProgress}
          />
        ) : null}

        {route.name === "incident" ? (
          controller.run && controller.run.scenario.id === route.id ? (
            <IncidentView
              run={controller.run}
              onCommand={controller.runCommand}
              onHint={controller.useHint}
              onNotes={controller.setNotes}
              onClear={controller.clearTerminal}
              onSubmit={submit}
              onQuit={goHome}
            />
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-16">
              <div className="panel p-8 text-center">
                <p className="mono-label">Loading the pager</p>
                <p className="mt-2 font-display text-2xl font-bold uppercase tracking-tight">
                  Bringing the box up…
                </p>
              </div>
            </div>
          )
        ) : null}

        {route.name === "debrief" ? (
          <DebriefView
            scenario={getScenario(route.id)}
            result={
              controller.lastResult?.scenarioId === route.id ? controller.lastResult : null
            }
            onNext={() => next(route.id)}
            onHome={goHome}
            onRetry={play}
            onProgress={goProgress}
          />
        ) : null}

        {route.name === "progress" ? (
          <ProgressView
            records={records}
            onPlay={play}
            onGoHome={goHome}
            onClear={clearHistory}
          />
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
