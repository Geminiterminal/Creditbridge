// Plan state: kept in localStorage only (never uploaded). Provides React context
// plus JSON export/import helpers.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createEntry, exportPlan, importPlan, loadPlan, savePlan, type ImportResult } from './plan';
import type { PlanEntry, PlanStatus } from './types';

interface PlanContextValue {
  entries: PlanEntry[];
  addEntry: (input: { courseCode: string; status: PlanStatus; term?: string; grade?: string; credits?: number; notes?: string }) => PlanEntry;
  updateEntry: (id: string, patch: Partial<Omit<PlanEntry, 'id'>>) => void;
  removeEntry: (id: string) => void;
  replaceAll: (entries: PlanEntry[]) => void;
  exportJson: () => string;
  importJson: (json: string) => ImportResult;
  entryForCourse: (courseCode: string) => PlanEntry | undefined;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<PlanEntry[]>(() => loadPlan());

  const commit = useCallback((next: PlanEntry[]) => {
    setEntries(next);
    savePlan(next);
  }, []);

  const addEntry = useCallback<PlanContextValue['addEntry']>(
    (input) => {
      const entry = createEntry(input);
      commit([...loadPlan(), entry]);
      return entry;
    },
    [commit],
  );

  const updateEntry = useCallback<PlanContextValue['updateEntry']>(
    (id, patch) => {
      commit(loadPlan().map((e) => (e.id === id ? { ...e, ...patch, id } : e)));
    },
    [commit],
  );

  const removeEntry = useCallback<PlanContextValue['removeEntry']>(
    (id) => {
      commit(loadPlan().filter((e) => e.id !== id));
    },
    [commit],
  );

  const replaceAll = useCallback<PlanContextValue['replaceAll']>(
    (next) => commit(next),
    [commit],
  );

  const value = useMemo<PlanContextValue>(
    () => ({
      entries,
      addEntry,
      updateEntry,
      removeEntry,
      replaceAll,
      exportJson: () => exportPlan(entries),
      importJson: (json: string) => importPlan(json),
      entryForCourse: (courseCode: string) =>
        entries.find((e) => e.courseCode.toUpperCase() === courseCode.toUpperCase()),
    }),
    [entries, addEntry, updateEntry, removeEntry, replaceAll],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider');
  return ctx;
}
