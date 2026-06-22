import { describe, it, expect } from 'vitest';
import { ViewTracker } from '../viewTracker';

describe('ViewTracker', () => {
  it('attributes a sample to the profile open at sample time, not the current one', () => {
    const vt = new ViewTracker({ guardMs: 1000 });
    vt.enter('anna', 0);
    vt.enter('marco', 10_000); // anna: [0,10000), marco: [10000, ∞)

    // A delayed sample timestamped while anna was on screen must go to anna,
    // even though marco is the current profile now.
    expect(vt.attribute(5_000)).toBe('anna');
    expect(vt.currentProfile()).toBe('marco');
  });

  it('drops samples near a window boundary as ambiguous', () => {
    const vt = new ViewTracker({ guardMs: 1500 });
    vt.enter('anna', 0);
    vt.enter('marco', 10_000);

    expect(vt.attribute(9_500)).toBeNull();  // 500ms before anna's window closes
    expect(vt.attribute(10_400)).toBeNull(); // 400ms into marco's window
    expect(vt.attribute(5_000)).toBe('anna'); // safely inside anna
  });

  it('returns null for samples outside every window', () => {
    const vt = new ViewTracker({ guardMs: 500 });
    vt.enter('anna', 1_000);
    expect(vt.attribute(0)).toBeNull(); // before any window
  });

  it('ignores re-entering the same profile (no spurious boundary)', () => {
    const vt = new ViewTracker({ guardMs: 1000 });
    vt.enter('anna', 0);
    vt.enter('anna', 5_000); // no-op
    expect(vt.attribute(3_000)).toBe('anna');
  });

  it('closeCurrent ends the open window so late samples after leaving drop', () => {
    const vt = new ViewTracker({ guardMs: 500 });
    vt.enter('anna', 0);
    vt.closeCurrent(10_000);
    expect(vt.attribute(11_000)).toBeNull();
    expect(vt.attribute(5_000)).toBe('anna');
  });
});
