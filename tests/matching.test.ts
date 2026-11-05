import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEquivalents, parseRequirements } from '../src/lib/parse';
import { buildRequirementIndexes, matchCourse, searchCourses, suggestCoursesForArea } from '../src/lib/matching';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) => readFileSync(join(root, 'data', 'source', name), 'utf8');

const courses = parseEquivalents(read('Equivalent Courses from Henry Ford College.txt'));
const requirements = parseRequirements(read('Inquiry Course Requirements.txt'), read('Competency Requirements.txt'));
const indexes = buildRequirementIndexes(requirements);

const byCode = new Map(courses.map((c) => [c.code, c]));
const match = (code: string) => matchCourse(byCode.get(code)!, indexes);

describe('sample mappings (required checks)', () => {
  it('HFCC ENG131 → WSU ENG1020 → BC', () => {
    const m = match('ENG131');
    expect(m.hasExact).toBe(true);
    expect(m.competencyMatches.map((x) => x.area)).toEqual(['BC']);
    expect(m.competencyMatches[0].wsuCode).toBe('ENG1020');
    expect(m.inquiryMatches).toHaveLength(0);
  });

  it('HFCC ART120 → WSU AH1000 → CI', () => {
    const m = match('ART120');
    expect(m.inquiryMatches.map((x) => x.area)).toEqual(['CI']);
    expect(m.inquiryMatches[0].wsuCode).toBe('AH1000');
  });

  it('HFCC MATH131 → WSU MAT1000 → QE', () => {
    const m = match('MATH131');
    expect(m.competencyMatches.map((x) => x.area)).toEqual(['QE']);
    expect(m.competencyMatches[0].wsuCode).toBe('MAT1000');
  });

  it('HFCC ANTH131 → WSU ANT1100 → possible SI and USP matches, shown together without auto double-counting', () => {
    const m = match('ANTH131');
    expect(m.inquiryMatches.map((x) => x.area).sort()).toEqual(['SI', 'USP']);
    expect(m.allAreas.sort()).toEqual(['SI', 'USP']);
    // both are reported as *possible*; nothing claims one course fills both
    expect(m.inquiryMatches.every((x) => x.kind === 'inquiry')).toBe(true);
  });
});

describe('transfer classification', () => {
  it('broad XXX mappings transfer but are NOT a confirmed Gen Ed match', () => {
    const m = match('ACT101'); // → ET1XXX
    expect(m.transfers).toBe(true);
    expect(m.hasBroad).toBe(true);
    expect(m.hasExact).toBe(false);
    expect(m.allAreas).toEqual([]);
  });

  it('"Does not transfer" is separate from "transfers with no Gen Ed match"', () => {
    const no = match('AERO110');
    expect(no.transfers).toBe(false);
    expect(no.hasDoesNotTransfer).toBe(true);
    expect(no.allAreas).toEqual([]);

    const exactNoGenEd = match('ACC031'); // → ACC3010, which is in no requirement list
    expect(exactNoGenEd.transfers).toBe(true);
    expect(exactNoGenEd.hasExact).toBe(true);
    expect(exactNoGenEd.hasDoesNotTransfer).toBe(false);
    expect(exactNoGenEd.allAreas).toEqual([]); // transfers, but no specific Gen Ed match identified
  });

  it('preserves multiple equivalencies and effective terms', () => {
    const m = match('ART108');
    expect(m.course.equivalencies).toHaveLength(2);
    const exact = m.course.equivalencies.find((e) => e.kind === 'exact')!;
    expect(exact.effectiveTerm).toBe('Fall 2015');
  });

  it('does not blanket-flag effective-term/credit caveats on every card, but flags mixed transfer rows', () => {
    expect(match('ENG131').caveats.some((c) => c.includes('Effective term'))).toBe(false);
    expect(match('ENG131').caveats.some((c) => c.includes('credit hours'))).toBe(false);
    const mixed = courses.find((c) =>
      c.equivalencies.some((e) => e.kind === 'none') && c.equivalencies.some((e) => e.kind !== 'none'),
    )!;
    expect(match(mixed.code).caveats.some((c) => c.includes('Does not transfer'))).toBe(true);
  });
});

describe('overlapping requirement categories', () => {
  it('one WSU course in two Inquiry groups is reported in both (POLS101 → PS1010 → CIV + SI)', () => {
    const m = match('POLS101');
    expect(m.allAreas.sort()).toEqual(['CIV', 'SI']);
  });

  it('a course matching both a competency and an inquiry group shows both (PHYS120 → PHY1020 → QE + NSI)', () => {
    const m = match('PHYS120');
    expect(m.competencyMatches.map((x) => x.area)).toEqual(['QE']);
    expect(m.inquiryMatches.map((x) => x.area)).toEqual(['NSI']);
  });
});

describe('searchCourses filters', () => {
  const all = { query: '', area: 'all' as const, transfer: 'all' as const, equivalency: 'all' as const };

  it('searches by code and by name', () => {
    expect(searchCourses(courses, indexes, { ...all, query: 'eng131' }).map((m) => m.course.code)).toContain('ENG131');
    expect(searchCourses(courses, indexes, { ...all, query: 'art appreciation' }).some((m) => m.course.code === 'ART120')).toBe(true);
  });

  it('matches by code prefix first: "hum" → HUM… codes ranked before name-only matches', () => {
    const results = searchCourses(courses, indexes, { ...all, query: 'hum' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].course.code.startsWith('HUM')).toBe(true); // HUM101 first
    expect(results[0].course.code).toBe('HUM101');
    expect(results.every((m) => /hum/i.test(m.course.code + ' ' + m.course.name))).toBe(true);
  });

  it('matches by name: "humanities" finds HUM101 Intro To Humanities', () => {
    const results = searchCourses(courses, indexes, { ...all, query: 'humanities' });
    expect(results.some((m) => m.course.code === 'HUM101' && /humanities/i.test(m.course.name))).toBe(true);
  });

  it('"art12" prefix-matches ART120/ART121… before other matches', () => {
    const results = searchCourses(courses, indexes, { ...all, query: 'art12' });
    expect(results[0].course.code.startsWith('ART12')).toBe(true);
  });

  it('ignores dashes/spaces/punctuation in the query: "hum-101" and "hum 101" find HUM101', () => {
    for (const query of ['hum-101', 'hum 101', 'HUM.101', 'hum_101']) {
      const results = searchCourses(courses, indexes, { ...all, query });
      expect(results.some((m) => m.course.code === 'HUM101'), `query "${query}" should find HUM101`).toBe(true);
      expect(results[0].course.code, `query "${query}" should rank HUM101 first`).toBe('HUM101');
    }
  });

  it('filters by Gen Ed area using exact matches only', () => {
    const bc = searchCourses(courses, indexes, { ...all, area: 'BC' });
    expect(bc.some((m) => m.course.code === 'ENG131')).toBe(true);
    expect(bc.some((m) => m.course.code === 'ART120')).toBe(false);
    // broad-only courses never appear under an area filter
    expect(bc.some((m) => m.course.code === 'ACT101')).toBe(false);
  });

  it('filters by transfer status and equivalency type', () => {
    const noTransfer = searchCourses(courses, indexes, { ...all, transfer: 'does-not-transfer' });
    expect(noTransfer.some((m) => m.course.code === 'AERO110')).toBe(true);
    expect(noTransfer.every((m) => m.hasDoesNotTransfer)).toBe(true);

    const broadOnly = searchCourses(courses, indexes, { ...all, equivalency: 'broad' });
    expect(broadOnly.some((m) => m.course.code === 'ACT101')).toBe(true);
    expect(broadOnly.every((m) => m.hasBroad)).toBe(true);

    const exactOnly = searchCourses(courses, indexes, { ...all, equivalency: 'exact' });
    expect(exactOnly.some((m) => m.course.code === 'ENG131')).toBe(true);
    expect(exactOnly.every((m) => m.hasExact)).toBe(true);
  });
});

describe('suggestCoursesForArea', () => {
  it('suggests HFCC courses with exact matches for an uncovered area, excluding planned ones', () => {
    const suggestions = suggestCoursesForArea(courses, indexes, 'CI', new Set(['ART120']), 10);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((m) => m.allAreas.includes('CI'))).toBe(true);
    expect(suggestions.every((m) => m.hasExact)).toBe(true);
    expect(suggestions.some((m) => m.course.code === 'ART120')).toBe(false);
  });
});
