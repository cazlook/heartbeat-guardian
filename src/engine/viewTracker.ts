/**
 * ViewTracker — attributes a heart-rate sample to the profile the user was
 * *actually looking at* when the sample was recorded by the watch.
 *
 * Why this exists: HealthKit / Health Connect do not stream in real time. We
 * poll every few seconds and receive samples timestamped up to ~60s in the
 * past (see heartRatePoller). Meanwhile the user may have swiped to another
 * profile. Attributing a sample to the *currently visible* profile is wrong —
 * the reaction belongs to whoever was on screen at `sample.sampleTime`.
 *
 * The tracker records view windows [enteredAt, leftAt) per profile and maps a
 * sample timestamp back to the correct window. Samples that fall on a window
 * boundary (within `guardMs`) are ambiguous and rejected, so a reaction is
 * never split between two people.
 */

export interface ViewWindow {
  profileId: string;
  enteredAt: number;
  leftAt: number | null; // null = still open (current profile)
}

export interface ViewTrackerOptions {
  /** Drop samples within this many ms of a window boundary (default 1500). */
  guardMs?: number;
  /** Max windows kept in memory (default 64). */
  maxWindows?: number;
}

export class ViewTracker {
  private windows: ViewWindow[] = [];
  private guardMs: number;
  private maxWindows: number;

  constructor(opts: ViewTrackerOptions = {}) {
    this.guardMs = opts.guardMs ?? 1500;
    this.maxWindows = opts.maxWindows ?? 64;
  }

  /** Open a window for `profileId`, closing the previous one at `t`. */
  enter(profileId: string, t: number = Date.now()): void {
    const current = this.windows[this.windows.length - 1];
    if (current && current.leftAt === null) {
      if (current.profileId === profileId) return; // already viewing it
      current.leftAt = t;
    }
    this.windows.push({ profileId, enteredAt: t, leftAt: null });
    if (this.windows.length > this.maxWindows) {
      this.windows = this.windows.slice(-this.maxWindows);
    }
  }

  /** Close the current open window (e.g. when leaving Discovery). */
  closeCurrent(t: number = Date.now()): void {
    const current = this.windows[this.windows.length - 1];
    if (current && current.leftAt === null) current.leftAt = t;
  }

  /**
   * Return the profileId whose view window contains `sampleTime`, or null if
   * the sample is ambiguous (near a boundary) or falls outside every window.
   */
  attribute(sampleTime: number): string | null {
    for (const w of this.windows) {
      const start = w.enteredAt;
      const end = w.leftAt ?? Number.POSITIVE_INFINITY;
      if (sampleTime < start || sampleTime >= end) continue;

      // Guard band: reject if too close to either edge of a *closed* window,
      // since the true viewer at that instant is uncertain.
      if (sampleTime - start < this.guardMs) return null;
      if (w.leftAt !== null && end - sampleTime < this.guardMs) return null;
      return w.profileId;
    }
    return null;
  }

  /** Currently open profile, if any. */
  currentProfile(): string | null {
    const current = this.windows[this.windows.length - 1];
    return current && current.leftAt === null ? current.profileId : null;
  }

  reset(): void {
    this.windows = [];
  }
}
