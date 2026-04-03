import type { OpenerID } from '../openers/types';

export interface QuizStatsData {
  total: number;
  correct: number;
  streak: number;
  bestStreak: number;
  avgTimeMs: number;
}

export interface StoredQuizStats {
  version: 1;
  total: number;
  correct: number;
  byOpener: Record<OpenerID, { total: number; correct: number }>;
  responseTimes: number[]; // last 100
  bestStreak: number;
}

const STORAGE_KEY = 'tetris-td-quiz-stats';
const MAX_RESPONSE_TIMES = 100;

function createDefaultStats(): StoredQuizStats {
  return {
    version: 1,
    total: 0,
    correct: 0,
    byOpener: {
      stray_cannon: { total: 0, correct: 0 },
      honey_cup: { total: 0, correct: 0 },
      gamushiro: { total: 0, correct: 0 },
      ms2: { total: 0, correct: 0 },
    },
    responseTimes: [],
    bestStreak: 0,
  };
}

function isValidStats(data: unknown): data is StoredQuizStats {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    obj.version === 1 &&
    typeof obj.total === 'number' &&
    typeof obj.correct === 'number' &&
    typeof obj.bestStreak === 'number' &&
    Array.isArray(obj.responseTimes) &&
    typeof obj.byOpener === 'object' &&
    obj.byOpener !== null
  );
}

export function loadQuizStats(): StoredQuizStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultStats();
    const parsed: unknown = JSON.parse(raw);
    if (isValidStats(parsed)) return parsed;
    return createDefaultStats();
  } catch {
    return createDefaultStats();
  }
}

export function saveQuizStats(stats: StoredQuizStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Silently fail if storage is unavailable
  }
}

export function recordAnswer(
  stats: StoredQuizStats,
  opener: OpenerID,
  isCorrect: boolean,
  responseTimeMs: number,
): StoredQuizStats {
  const updated: StoredQuizStats = {
    ...stats,
    total: stats.total + 1,
    correct: stats.correct + (isCorrect ? 1 : 0),
    byOpener: {
      ...stats.byOpener,
      [opener]: {
        total: (stats.byOpener[opener]?.total ?? 0) + 1,
        correct: (stats.byOpener[opener]?.correct ?? 0) + (isCorrect ? 1 : 0),
      },
    },
    responseTimes: [...stats.responseTimes, responseTimeMs].slice(-MAX_RESPONSE_TIMES),
    bestStreak: stats.bestStreak, // updated below via getDisplayStats caller
  };

  return updated;
}

export function getDisplayStats(stats: StoredQuizStats): QuizStatsData {
  // Compute current streak from the end of the response history
  // We need to track correct/incorrect per answer; responseTimes alone doesn't tell us.
  // Since we only store aggregate correct count, streak must be tracked externally.
  // We'll compute avg time from responseTimes.
  const avgTimeMs =
    stats.responseTimes.length > 0
      ? stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
      : 0;

  return {
    total: stats.total,
    correct: stats.correct,
    streak: 0, // Streak is tracked in app state, not in stored stats
    bestStreak: stats.bestStreak,
    avgTimeMs,
  };
}
