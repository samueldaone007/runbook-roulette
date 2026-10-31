import { useCallback, useState } from "react";
import { loadRecords, saveRecords } from "./storage";
import type { RunRecord } from "./types";

/** Owns the logbook and keeps localStorage in sync. */
export function useRunHistory() {
  const [records, setRecords] = useState<RunRecord[]>(() => loadRecords());

  const recordRun = useCallback((record: RunRecord) => {
    setRecords((previous) => {
      const next = [record, ...previous].slice(0, 200);
      saveRecords(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setRecords([]);
    saveRecords([]);
  }, []);

  return { records, recordRun, clearHistory };
}
