import { t } from '../i18n';
import { PEDIGREE_VERSION } from './types';
import type { Pedigree } from './types';

/**
 * The demo family, also used by tests. Keep it exactly as specified:
 * proband (34), sister (31), mother (60, breast cancer at 38), father (63,
 * heart attack at 57), maternal grandmother (breast cancer at 52, deceased),
 * maternal grandfather, maternal aunt (ovarian cancer at 44, deceased),
 * paternal uncle (58, bypass surgery at 54), paternal grandparents unknown.
 * Ages are stated ages, not birth years, so nothing depends on today's date.
 */
export function createSamplePedigree(): Pedigree {
  return {
    version: PEDIGREE_VERSION,
    probandId: 'proband',
    persons: {
      proband: {
        id: 'proband',
        displayName: t('sample.proband'),
        sex: 'female',
        ageNow: 34,
        deceased: false,
        conditions: [],
      },
      sister: {
        id: 'sister',
        displayName: t('sample.sister'),
        sex: 'female',
        ageNow: 31,
        deceased: false,
        conditions: [],
      },
      mother: {
        id: 'mother',
        displayName: t('sample.mother'),
        sex: 'female',
        ageNow: 60,
        deceased: false,
        conditions: [
          {
            id: 'c1',
            code: 'breast',
            domain: 'cancer',
            ageAtOnset: 38,
            ageUnknown: false,
            confirmed: 'reported',
          },
        ],
      },
      father: {
        id: 'father',
        displayName: t('sample.father'),
        sex: 'male',
        ageNow: 63,
        deceased: false,
        conditions: [
          {
            id: 'c1',
            code: 'coronary_event',
            domain: 'cardio',
            ageAtOnset: 57,
            ageUnknown: false,
            subtype: 'heart_attack',
            confirmed: 'reported',
          },
        ],
      },
      mgm: {
        id: 'mgm',
        displayName: t('sample.mgm'),
        sex: 'female',
        deceased: true,
        conditions: [
          {
            id: 'c1',
            code: 'breast',
            domain: 'cancer',
            ageAtOnset: 52,
            ageUnknown: false,
            confirmed: 'reported',
          },
        ],
      },
      mgf: {
        id: 'mgf',
        displayName: t('sample.mgf'),
        sex: 'male',
        deceased: false,
        conditions: [],
      },
      maunt: {
        id: 'maunt',
        displayName: t('sample.maunt'),
        sex: 'female',
        deceased: true,
        conditions: [
          {
            id: 'c1',
            code: 'ovarian',
            domain: 'cancer',
            ageAtOnset: 44,
            ageUnknown: false,
            confirmed: 'reported',
          },
        ],
      },
      puncle: {
        id: 'puncle',
        displayName: t('sample.puncle'),
        sex: 'male',
        ageNow: 58,
        deceased: false,
        conditions: [
          {
            id: 'c1',
            code: 'coronary_event',
            domain: 'cardio',
            ageAtOnset: 54,
            ageUnknown: false,
            subtype: 'bypass_surgery',
            confirmed: 'reported',
          },
        ],
      },
      pgm: {
        id: 'pgm',
        displayName: t('sample.pgm'),
        sex: 'female',
        deceased: false,
        conditions: [],
        vitalStatusUnknown: true,
        healthHistoryUnknown: true,
      },
      pgf: {
        id: 'pgf',
        displayName: t('sample.pgf'),
        sex: 'male',
        deceased: false,
        conditions: [],
        vitalStatusUnknown: true,
        healthHistoryUnknown: true,
      },
    },
    parentLinks: [
      { childId: 'proband', parentId: 'mother', kind: 'biological' },
      { childId: 'proband', parentId: 'father', kind: 'biological' },
      { childId: 'sister', parentId: 'mother', kind: 'biological' },
      { childId: 'sister', parentId: 'father', kind: 'biological' },
      { childId: 'mother', parentId: 'mgm', kind: 'biological' },
      { childId: 'mother', parentId: 'mgf', kind: 'biological' },
      { childId: 'maunt', parentId: 'mgm', kind: 'biological' },
      { childId: 'maunt', parentId: 'mgf', kind: 'biological' },
      { childId: 'father', parentId: 'pgm', kind: 'biological' },
      { childId: 'father', parentId: 'pgf', kind: 'biological' },
      { childId: 'puncle', parentId: 'pgm', kind: 'biological' },
      { childId: 'puncle', parentId: 'pgf', kind: 'biological' },
    ],
    partnerships: [
      { id: 'u1', aId: 'mother', bId: 'father', status: 'current' },
      { id: 'u2', aId: 'mgm', bId: 'mgf', status: 'current' },
      { id: 'u3', aId: 'pgm', bId: 'pgf', status: 'current' },
    ],
  };
}
