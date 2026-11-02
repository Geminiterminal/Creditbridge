// Student plan: stored only in the browser's localStorage. Never uploaded anywhere.
// JSON export/import is provided so students can back up or move their plan.

import type { PlanEntry, PlanFile, PlanStatus } from './types';

export const PLAN_STORAGE_KEY = 'creditbridge:plan:v1';

export const PLAN_STATUSES: PlanStatus[] = ['completed', 'in-progress', 'planned'];

export const STATUS_LABELS: Record<PlanStatus, string> = {
  completed: 'Completed',
  'in-progress': 'In progress',
  planned: 'Planned',
};

/** Grades ordered best to worst. Used for the "C or better" rule on BC/IC/QE. */
export const GRADE_ORDER = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F',
] as const;

export const GRADES: string[] = [...GRADE_ORDER, 'W', 'I'];

/** Returns true/false when the grade is known, or null when it cannot be determined. */
export function isGradeCOrBetter(grade: string | undefined): boolean | null {
  if (!grade) return null;
  const normalized = grade.trim().toUpperCase();
  const index = GRADE_ORDER.findIndex((g) => g === normalized);
  if (index === -1) return null; // unrecognized grade (e.g. W, I, transfer) — needs confirmation
  const cIndex = GRADE_ORDER.findIndex((g) => g === 'C');
  return index <= cIndex;
}

export function createEntry(partial: Omit<PlanEntry, 'id' | 'addedAt'> & { id?: string }): PlanEntry {
  return {
    id: partial.id ?? `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    addedAt: new Date().toISOString(),
    ...partial,
  };
}

export function loadPlan(storage: Pick<Storage, 'getItem'> = localStorage): PlanEntry[] {
  try {
    const raw = storage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

export function savePlan(entries: PlanEntry[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(entries));
}

export function isValidEntry(value: unknown): value is PlanEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.courseCode === 'string' &&
    typeof v.status === 'string' &&
    PLAN_STATUSES.includes(v.status as PlanStatus)
  );
}

/** Serialize the plan to a portable JSON backup file. */
export function exportPlan(entries: PlanEntry[]): string {
  const file: PlanFile = {
    app: 'creditbridge',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | { ok: true; entries: PlanEntry[]; warnings: string[] }
  | { ok: false; error: string };

export type { PlanStatus } from './types';

/** Parse and validate an imported plan file. Unknown/invalid entries are reported, not silently kept. */
export function importPlan(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'The file does not look like a Creditbridge backup.' };
  }
  const file = parsed as Partial<PlanFile>;
  if (file.app !== 'creditbridge') {
    return { ok: false, error: 'The file is not a Creditbridge plan backup (missing "app": "creditbridge").' };
  }
  if (file.version !== 1) {
    return { ok: false, error: `Unsupported backup version "${String(file.version)}". This app reads version 1.` };
  }
  if (!Array.isArray(file.entries)) {
    return { ok: false, error: 'The backup has no "entries" list.' };
  }
  const entries: PlanEntry[] = [];
  const problems: string[] = [];
  file.entries.forEach((entry, i) => {
    if (!isValidEntry(entry)) {
      problems.push(`entry #${i + 1}`);
      return;
    }
    const validAreas = ['CIV', 'CI', 'GL', 'NSI', 'SI', 'USP', 'BC', 'IC', 'OC', 'QE'];
    entries.push({
      ...entry,
      status: entry.status as PlanStatus,
      credits: typeof entry.credits === 'number' && Number.isFinite(entry.credits) ? entry.credits : undefined,
      appliedArea:
        typeof entry.appliedArea === 'string' && validAreas.includes(entry.appliedArea.toUpperCase())
          ? (entry.appliedArea.toUpperCase() as PlanEntry['appliedArea'])
          : undefined,
    });
  });
  if (entries.length === 0 && file.entries.length > 0) {
    return { ok: false, error: 'None of the entries in that file were valid.' };
  }
  const warnings: string[] = [];
  if (problems.length > 0) {
    warnings.push(`Skipped ${problems.length} invalid ${problems.length === 1 ? 'entry' : 'entries'} (${problems.join(', ')}).`);
  }
  return { ok: true, entries: dedupeEntries(entries), warnings };
}

function dedupeEntries(entries: PlanEntry[]): PlanEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
