// Builds the normalized JSON data bundled with the app from the verbatim source
// files in data/source/. Run with: npm run build:data
// The generated files are committed to the repo, so the app never reads the
// source text files at runtime and never depends on upload paths or a server.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalog, parseRequirements } from '../src/lib/parse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'data', 'source');
const outDir = join(root, 'src', 'data');
mkdirSync(outDir, { recursive: true });

const equivalentsText = readFileSync(join(sourceDir, 'Equivalent Courses from Henry Ford College.txt'), 'utf8');
const inquiryText = readFileSync(join(sourceDir, 'Inquiry Course Requirements.txt'), 'utf8');
const competencyText = readFileSync(join(sourceDir, 'Competency Requirements.txt'), 'utf8');

const catalog = parseCatalog(equivalentsText, new Date().toISOString());
const requirements = parseRequirements(inquiryText, competencyText);

writeFileSync(join(outDir, 'courses.json'), JSON.stringify(catalog));
writeFileSync(join(outDir, 'requirements.json'), JSON.stringify(requirements));

const broad = catalog.courses.flatMap((c) => c.equivalencies).filter((e) => e.kind === 'broad').length;
const none = catalog.courses.flatMap((c) => c.equivalencies).filter((e) => e.kind === 'none').length;
const exact = catalog.courses.flatMap((c) => c.equivalencies).filter((e) => e.kind === 'exact').length;
console.log(`courses: ${catalog.courses.length}`);
console.log(`equivalency rows: exact=${exact} broad=${broad} none=${none}`);
console.log(`inquiry groups: ${requirements.inquiry.map((g) => `${g.code}=${g.courses.length}`).join(' ')}`);
console.log(`competencies: ${requirements.competencies.map((c) => `${c.code}=${c.courses.length}`).join(' ')}`);
console.log('rules:', JSON.stringify(requirements.rules));
