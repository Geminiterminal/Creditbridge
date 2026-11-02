// Bundled data: normalized from the supplied source files at build time
// (npm run build:data) and committed as JSON, so the app needs no server,
// no live API, and no scraping — everything is cached with the app for offline use.

import coursesJson from '../data/courses.json';
import requirementsJson from '../data/requirements.json';
import { buildRequirementIndexes } from './matching';
import type { CatalogData, RequirementsData } from './types';

export const catalog = coursesJson as CatalogData;
export const requirements = requirementsJson as RequirementsData;
export const indexes = buildRequirementIndexes(requirements);

export const courseByCode = new Map(catalog.courses.map((c) => [c.code, c]));
