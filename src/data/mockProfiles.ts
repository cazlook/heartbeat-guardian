/**
 * Mock profiles + BPM simulator.
 *
 * Used only client-side in Discovery to enrich the candidate list while we
 * test the experience. They do NOT touch the backend — IDs are prefixed
 * with `mock-` so persistence/match logic skips them automatically.
 */

export interface MockProfile {
  id: string;
  name: string;
  age: number;
  bio: string;
  interests: string[];
  distance_km: number;
  photos: string[];
  bpm_baseline: number;
}

export const MOCK_PROFILES: MockProfile[] = [
  {
    id: 'mock-aurora',
    name: 'Aurora',
    age: 27,
    bio: 'Fotografa di concerti, vivo di notte e di vinili. Cerco qualcuno che mi faccia battere il cuore senza dirlo.',
    interests: ['Musica', 'Fotografia', 'Cinema d\'autore', 'Viaggi slow'],
    distance_km: 2,
    photos: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1521119989659-a83eee488004?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 64,
  },
  {
    id: 'mock-leo',
    name: 'Leo',
    age: 31,
    bio: 'Ingegnere di giorno, surfer nei weekend. Caffè nero, conversazioni lunghe, alba in spiaggia.',
    interests: ['Surf', 'Tech', 'Specialty coffee', 'Trekking'],
    distance_km: 4,
    photos: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 58,
  },
  {
    id: 'mock-noor',
    name: 'Noor',
    age: 26,
    bio: 'Architetta junior con un debole per le città mediterranee. Disegno, ballo, rido troppo forte.',
    interests: ['Architettura', 'Danza', 'Cucina', 'Mostre'],
    distance_km: 1,
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1517365830460-955ce3ccd263?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 72,
  },
  {
    id: 'mock-mateo',
    name: 'Mateo',
    age: 29,
    bio: 'Chef in una trattoria contemporanea. Mi piacciono i mercati, i dischi vecchi, le persone curiose.',
    interests: ['Cucina', 'Vinili', 'Mercati', 'Vino naturale'],
    distance_km: 6,
    photos: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 66,
  },
  {
    id: 'mock-yuki',
    name: 'Yuki',
    age: 28,
    bio: 'Illustratrice freelance. Tè matcha, librerie indipendenti, gatti randagi. Empatica più del normale.',
    interests: ['Illustrazione', 'Lettura', 'Tè', 'Yoga'],
    distance_km: 3,
    photos: [
      'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1502323777036-f29e3972d82f?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 70,
  },
  {
    id: 'mock-david',
    name: 'David',
    age: 33,
    bio: 'Producer musicale, runner, lettore di saggi. Cerco profondità, non perfezione.',
    interests: ['Produzione musicale', 'Running', 'Saggistica', 'Boulder'],
    distance_km: 8,
    photos: [
      'https://images.unsplash.com/photo-1463453091185-61582044d556?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 60,
  },
  {
    id: 'mock-sofia',
    name: 'Sofia',
    age: 25,
    bio: 'Studio neuroscienze, ballo tango il martedì. Mi entusiasmo facilmente — è un pregio, credo.',
    interests: ['Neuroscienze', 'Tango', 'Podcast', 'Vino rosso'],
    distance_km: 2,
    photos: [
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1499714608240-22fc6ad53fb2?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 75,
  },
  {
    id: 'mock-elias',
    name: 'Elias',
    age: 30,
    bio: 'Scrittore di racconti brevi. Sere di pioggia, jazz, biciclette. Penso troppo, ma con grazia.',
    interests: ['Scrittura', 'Jazz', 'Bici', 'Cinema muto'],
    distance_km: 5,
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=900&auto=format&fit=crop&q=70',
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=900&auto=format&fit=crop&q=70',
    ],
    bpm_baseline: 62,
  },
];

export const isMockProfileId = (id: string): boolean => id.startsWith('mock-');

/**
 * MockBpmSimulator
 * ----------------
 * Per ogni profilo mock genera un BPM simulato che fluttua attorno a
 * `bpm_baseline ± 5-15 bpm`, con occasionali "spike" più ampi (per
 * generare reazioni varie nell'engine). Emette un solo valore "corrente"
 * accessibile via getBpm(profileId). Internamente un singolo setInterval
 * aggiorna tutti i profili.
 */
export class MockBpmSimulator {
  private values = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly tickMs: number;

  constructor(profiles: MockProfile[], tickMs = 1000) {
    this.tickMs = tickMs;
    profiles.forEach((p) => this.values.set(p.id, p.bpm_baseline));
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.values.forEach((current, id) => {
        // 8% chance of a "spike" event (±10..18), otherwise gentle drift (±1..4)
        const spike = Math.random() < 0.08;
        const delta = spike
          ? (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8)
          : (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 3);
        const next = Math.max(48, Math.min(140, current + delta));
        this.values.set(id, next);
      });
    }, this.tickMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getBpm(profileId: string): number | null {
    return this.values.get(profileId) ?? null;
  }
}
