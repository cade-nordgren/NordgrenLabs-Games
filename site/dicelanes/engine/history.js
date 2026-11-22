// Undo by whole-state snapshots: locks, closed colours and dice come back with everything else.
import { validState } from './reducer.js';

export const CAP = 200; // steps kept while playing
export const SAVE_CAP = 60; // steps kept in a save record

export const record = (hist, g, cap = CAP) => [...hist, JSON.stringify(g)].slice(-cap);

export function undo(hist) {
  if (!hist.length) return null;
  return { g: JSON.parse(hist[hist.length - 1]), hist: hist.slice(0, -1) };
}

// Keeps only snapshots that parse to a valid state, so a tampered history can never be undone into.
export const cleanHist = hist => (Array.isArray(hist) ? hist : []).filter(h => {
  try { return typeof h === 'string' && validState(JSON.parse(h)); } catch { return false; }
}).slice(-CAP);
