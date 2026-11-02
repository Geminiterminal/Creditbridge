import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEquivalents, parseRequirements } from '../src/lib/parse';
import { buildRequirementIndexes } from '../src/lib/matching';
import { GEN_ED_STRUCTURE, areaCreditInfo, computeProgress } from '../src/lib/progress';
import { createEntry, exportPlan, importPlan, isGradeCOrBetter, loadPlan, savePlan } from '../src/lib/plan';
import type { PlanEntry } from '../src/lib/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => readFileSync(join(root, 'data', 'source', name), 'utf8');

const courses = parseEquivalents(read('Equivalent Courses from Henry Ford College.txt'));
const requirements = parseRequirements(read('Inquiry Course Requirements.txt'), read('Competency Requirements.txt'));
const indexes = buildRequirementIndexes(requirements);

const entry = (courseCode: string, over: Partial<PlanEntry> = {}): PlanEntry =>
  createEntry({ courseCode, status: 'completed', ...over });

const areaOf = (entries: PlanEntry[], code: string) => computeProgress(entries, courses, requirements, indexes).areas.find((a) => a.area === code)!;

describe('grade rule (BC/IC/QE need C or better)', () => {
  it('accepts C and better, rejects below C, flags missing/unknown grades', () => {
    expect(isGradeCOrBetter('C')).toBe(true);
    expect(isGradeCOrBetter('b+')).toBe(true);
    expect(isGradeCOrBetter('A-')).toBe(true);
    expect(isGradeCOrBetter('C-')).toBe(false);
    expect(isGradeCOrBetter('D')).toBe(false);
    expect(isGradeCOrBetter('F')).toBe(false);
    expect(isGradeCOrBetter(undefined)).toBeNull();
    expect(isGradeCOrBetter('W')).toBeNull();
  });

  it('BC is covered with grade B, needs review with grade D or no grade', () => {
    expect(areaOf([entry('ENG131', { grade: 'B' })], 'BC').status).toBe('covered');
    const low = areaOf([entry('ENG131', { grade: 'D' })], 'BC');
    expect(low.status).toBe('needs-review');
    expect(low.notes.join(' ')).toContain('below C');
    const noGrade = areaOf([entry('ENG131')], 'BC');
    expect(noGrade.status).toBe('needs-review');
    expect(noGrade.notes.join(' ')).toContain('needs confirmation');
  });
});

describe('planned / in-progress are never completed', () => {
  it('planned and in-progress entries show as on-track, not covered', () => {
    expect(areaOf([entry('ENG131', { status: 'planned' })], 'BC').status).toBe('on-track');
    expect(areaOf([entry('ENG131', { status: 'in-progress' })], 'BC').status).toBe('on-track');
    expect(areaOf([entry('ENG131', { status: 'completed', grade: 'C' })], 'BC').status).toBe('covered');
    expect(areaOf([], 'BC').status).toBe('open');
  });
});

describe('inquiry credit rule (≥3 credits, from entered or WSU-listed credits only)', () => {
  it('uses the WSU-listed credits when the student did not enter any, and flags the source', () => {
    const si = areaOf([entry('ANTH131')], 'SI'); // ANT1100 is listed as 3 credits at WSU
    expect(si.status).toBe('covered');
    expect(si.completed[0].creditsSource).toBe('wsu-list');
    expect(si.notes.join(' ')).toContain('WSU listing');
  });

  it('uses entered HFCC credits; below 3 credits does not satisfy the group', () => {
    const ok = areaOf([entry('ANTH131', { credits: 4 })], 'SI');
    expect(ok.status).toBe('covered');
    expect(ok.completed[0].creditsSource).toBe('entered');
    const low = areaOf([entry('ANTH131', { credits: 2 })], 'SI');
    expect(low.status).toBe('needs-review');
    expect(low.notes.join(' ')).toContain('at least 3');
  });
});

describe('NSI lab condition is tracked separately and never assumed', () => {
  it('unconditional lab course satisfies the lab condition', () => {
    const r = computeProgress([entry('CHEM131')], courses, requirements, indexes); // → CHM1020 (lecture/lab)
    expect(r.nsiLab.status).toBe('satisfied');
  });

  it('conditional lab course is needs-review with the preserved condition note', () => {
    const r = computeProgress([entry('ASTR131')], courses, requirements, indexes); // → AST2010, needs concurrent AST 2011
    expect(r.nsiLab.status).toBe('needs-review');
    expect(r.nsiLab.notes.join(' ')).toContain('AST 2011');
  });

  it('a completed NSI course without any lab note leaves the lab condition open', () => {
    const r = computeProgress([entry('BIO138')], courses, requirements, indexes); // → BIO1030 (conditional with BIO 1040)
    // BIO1030 is conditional; use a non-lab NSI course instead:
    const r2 = computeProgress([entry('AH141')], courses, requirements, indexes); // → PH2100 (NSI, no lab)
    expect(r2.nsiLab.status).toBe('open');
    expect(r2.nsiLab.notes.join(' ')).toContain('never assumed');
    expect(r.nsiLab.status).toBe('needs-review');
  });
});

describe('overlap warnings', () => {
  it('warns when one completed course may fit multiple inquiry groups (no auto double-count)', () => {
    const r = computeProgress([entry('ANTH131')], courses, requirements, indexes);
    expect(r.warnings.some((w) => w.includes('ANTH131') && w.includes('SI') && w.includes('USP'))).toBe(true);
    expect(r.warnings.join(' ')).toContain('not automatically counted');
  });

  it('warns when a course matches both a competency and an inquiry group', () => {
    const r = computeProgress([entry('PHYS120', { grade: 'B' })], courses, requirements, indexes); // → PHY1020: QE + NSI
    expect(r.warnings.some((w) => w.includes('Competency') && w.includes('Inquiry') && w.includes('PHYS120'))).toBe(true);
  });
});

describe('plan export / import', () => {
  it('round-trips a plan through JSON', () => {
    const entries = [entry('ENG131', { grade: 'A', term: 'Fall 2026', credits: 3, notes: 'honors?' }), entry('ART120', { status: 'planned' })];
    const json = exportPlan(entries);
    const result = importPlan(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].courseCode).toBe('ENG131');
      expect(result.entries[1].status).toBe('planned');
    }
  });

  it('rejects invalid JSON and non-Creditbridge files with clear errors', () => {
    expect(importPlan('not json').ok).toBe(false);
    expect(importPlan('{"hello":1}').ok).toBe(false);
    expect(importPlan(JSON.stringify({ app: 'creditbridge', version: 99, entries: [] })).ok).toBe(false);
  });

  it('skips invalid entries but imports valid ones, with a warning', () => {
    const bad = JSON.stringify({
      app: 'creditbridge',
      version: 1,
      entries: [entry('ENG131'), { id: 5, status: 'nope' }],
    });
    const result = importPlan(bad);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toHaveLength(1);
      expect(result.warnings.join(' ')).toContain('Skipped 1 invalid entry');
    }
  });

  it('persists to storage under the plan key', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const entries = [entry('MATH131', { grade: 'C' })];
    savePlan(entries, storage);
    expect(loadPlan(storage)).toHaveLength(1);
    expect(loadPlan(storage)[0].courseCode).toBe('MATH131');
  });
});

describe('areaCreditInfo (credits from the supplied TXT files)', () => {
  it('Inquiry groups show the parsed minimum credits required per course', () => {
    for (const g of ['CIV', 'CI', 'GL', 'SI', 'USP'] as const) {
      const info = areaCreditInfo(requirements, g);
      expect(info.label).toBe('3 cr required'); // "a course of at least three credits" (Inquiry txt)
      expect(info.title).toContain('Inquiry Course Requirements.txt');
      expect(info.courseCount).toBeGreaterThan(0);
    }
  });

  it('NSI is 7 cr = two courses, one with a lab (seven inquiry courses total)', () => {
    const info = areaCreditInfo(requirements, 'NSI');
    expect(info.label).toContain('7 cr');
    expect(info.label).toContain('with lab');
    expect(info.credits).toBe(7);
    expect(info.title).toContain('second NSI course with a lab section');
    expect(info.title).toContain('seven courses');
  });

  it('Competencies each count as 3 cr toward the 34-credit Gen Ed minimum', () => {
    for (const c of ['BC', 'IC', 'OC', 'QE'] as const) {
      const info = areaCreditInfo(requirements, c);
      expect(info.label).toBe('3 cr required');
      expect(info.credits).toBe(3);
      expect(info.title).toContain('34-credit');
      expect(info.title).toContain('Competency Requirements.txt');
    }
  });

  it('GEN_ED_STRUCTURE: 4 competencies × 3 + 5 inquiry × 3 + NSI 7 = 34 credits', () => {
    expect(GEN_ED_STRUCTURE.totalCredits).toBe(34);
    expect(4 * GEN_ED_STRUCTURE.competencyCredits + 5 * GEN_ED_STRUCTURE.inquiryCredits + GEN_ED_STRUCTURE.nsiCredits).toBe(
      GEN_ED_STRUCTURE.totalCredits,
    );
  });
});

describe('creditsCovered summary (of the 34-credit minimum)', () => {
  it('sums required credits of covered areas (BC 3 + NSI 7 = 10)', () => {
    const r = computeProgress([entry('ENG131', { grade: 'B' }), entry('CHEM131'), entry('AH141')], courses, requirements, indexes);
    expect(r.areas.find((a) => a.area === 'BC')!.status).toBe('covered');
    expect(r.areas.find((a) => a.area === 'NSI')!.status).toBe('covered');
    expect(r.areasCovered).toBe(2);
    expect(r.creditsCovered).toBe(10);
  });
});

describe('appliedArea (student chooses which category a multi-category course counts toward)', () => {
  it('counts only toward the chosen category and drops the overlap warning', () => {
    const r = computeProgress([entry('ANTH131', { appliedArea: 'SI' })], courses, requirements, indexes);
    expect(r.areas.find((a) => a.area === 'SI')!.status).toBe('covered');
    expect(r.areas.find((a) => a.area === 'USP')!.status).toBe('open');
    expect(r.warnings.length).toBe(0);
  });

  it('without a choice, both areas are possible matches and the warning is shown', () => {
    const r = computeProgress([entry('ANTH131')], courses, requirements, indexes);
    expect(r.areas.find((a) => a.area === 'SI')!.status).toBe('covered');
    expect(r.areas.find((a) => a.area === 'USP')!.status).toBe('covered');
    expect(r.warnings.some((w) => w.includes('ANTH131') && w.includes('not automatically counted'))).toBe(true);
  });
});

describe('NSI two-course + lab rule ("minimum total of seven courses")', () => {
  it('one NSI course alone is needs-review, not covered — the second lab course is still required', () => {
    const r = computeProgress([entry('CHEM131')], courses, requirements, indexes); // → CHM1020 (unconditional lab)
    const nsi = r.areas.find((a) => a.area === 'NSI')!;
    expect(r.nsiLab.status).toBe('satisfied'); // the lab part is fine
    expect(nsi.status).toBe('needs-review'); // ...but the group needs TWO NSI courses
    expect(nsi.notes.join(' ')).toContain('second NSI course with a lab');
    expect(nsi.notes.join(' ')).toContain('seven courses');
    expect(r.inquiryCourses).toEqual({ count: 1, required: 7 });
  });

  it('two NSI courses with one lab course → NSI covered, counter at 2 of 7', () => {
    const r = computeProgress([entry('CHEM131'), entry('AH141')], courses, requirements, indexes); // CHM1020 (lab) + PH2100
    expect(r.areas.find((a) => a.area === 'NSI')!.status).toBe('covered');
    expect(r.inquiryCourses).toEqual({ count: 2, required: 7 });
  });

  it('two NSI courses without any lab → still needs-review (lab never assumed)', () => {
    const r = computeProgress([entry('AH141'), entry('PSY131')], courses, requirements, indexes); // PH2100 + PSY1020, neither lab
    expect(r.areas.find((a) => a.area === 'NSI')!.status).toBe('needs-review');
    expect(r.nsiLab.status).toBe('open');
  });

  it('inquiry counter counts each completed course once and respects appliedArea', () => {
    const r = computeProgress([entry('ANTH131', { appliedArea: 'SI' }), entry('ART120')], courses, requirements, indexes);
    expect(r.inquiryCourses).toEqual({ count: 2, required: 7 }); // ANTH131 counts once (SI), ART120 → CI
    expect(r.areas.find((a) => a.area === 'USP')!.status).toBe('open');
  });
});
