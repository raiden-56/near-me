import { pick, seeded } from '@/lib/utils';

/** Fictional contributor names used only for labelled sample content. */
const FIRST = [
  'Ananya', 'Rohan', 'Meera', 'Karthik', 'Divya', 'Arjun', 'Sneha', 'Vikram', 'Priya', 'Aditya', 'Lakshmi', 'Imran',
  'Nisha', 'Rahul', 'Farah', 'Suresh', 'Kavya', 'Joseph', 'Pooja', 'Naveen', 'Shreya', 'Harish', 'Zoya', 'Manoj',
  'Tanvi', 'Deepak', 'Aisha', 'Girish', 'Ritika', 'Sanjay',
];
const LAST = ['R.', 'S.', 'K.', 'M.', 'N.', 'P.', 'D.', 'G.', 'B.', 'J.', 'T.', 'V.', 'A.', 'H.'];
const LEVELS = ['Explorer', 'Explorer', 'Local Scout', 'Local Scout', 'Neighborhood Expert', 'Community Hero'];

export function samplePerson(seed: string) {
  const rand = seeded(seed);
  const level = pick(rand, LEVELS);
  return {
    id: `sample_user_${Math.floor(rand() * 1e9).toString(36)}`,
    name: `${pick(rand, FIRST)} ${pick(rand, LAST)}`,
    level,
    reputation: level === 'Community Hero' ? 92 : level === 'Neighborhood Expert' ? 78 : level === 'Local Scout' ? 61 : 42,
  };
}

/** Deterministic list of fictional voter ids, so sample confirmations have a stable count. */
export const sampleVoters = (seed: string, count: number) => Array.from({ length: count }, (_, i) => `sample_voter_${seed}_${i}`);
