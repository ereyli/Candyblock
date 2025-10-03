import type { CandyColor, Mission } from './types';

export const BOARD_SIZE = 8;

export const CANDY_COLORS: CandyColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

export const BASE_MOVE_LIMIT = 17;
export const MAX_RESHUFFLES_PER_RUN = 1;

export const MATCH_SCORE_BASE = 10; // points per candy

// Bonus score granted upon mission completion. Scales with mission target
export const MISSION_SCORE_MULTIPLIER = 5; // points per required candy

export interface MissionTemplate {
  id: string;
  color: CandyColor;
  target: number; // collect-color target
  rewardMoves: number; // on-completion extra moves added to pool
  baseMoves: number; // base moves granted at start of this tier
  title: string;
  summary: string;
  // difficulty/scoring knobs
  scoreTarget: number; // target score for this tier (for display/bonus)
  scoreMilestone: number; // every time this is crossed, grant movesPerMilestone
  movesPerMilestone: number; // additional moves per milestone
  refillBonus: number; // on-completion refill to BASE_MOVE_LIMIT + refillBonus
}

export const MISSION_SEQUENCE: MissionTemplate[] = [
  {
    id: 'mission-1',
    color: 'red',
    target: 24,
    rewardMoves: 1,
    baseMoves: 18,
    title: 'Warm-Up',
    summary: 'Collect 24 red candies with a tight move budget.',
    scoreTarget: 1200,
    scoreMilestone: 600,
    movesPerMilestone: 1,
    refillBonus: 0
  },
  {
    id: 'mission-2',
    color: 'blue',
    target: 28,
    rewardMoves: 1,
    baseMoves: 19,
    title: 'Cool Combo',
    summary: 'Stay efficient while clearing blue chains.',
    scoreTarget: 1700,
    scoreMilestone: 700,
    movesPerMilestone: 1,
    refillBonus: 1
  },
  {
    id: 'mission-3',
    color: 'green',
    target: 36,
    rewardMoves: 2,
    baseMoves: 20,
    title: 'Verdant Rush',
    summary: 'Chase 36 greens before the clock runs dry.',
    scoreTarget: 2200,
    scoreMilestone: 800,
    movesPerMilestone: 1,
    refillBonus: 1
  },
  {
    id: 'mission-4',
    color: 'yellow',
    target: 44,
    rewardMoves: 2,
    baseMoves: 21,
    title: 'Sunburst Sprint',
    summary: 'Limited moves, bigger yellow chains.',
    scoreTarget: 2800,
    scoreMilestone: 900,
    movesPerMilestone: 1,
    refillBonus: 2
  },
  {
    id: 'mission-5',
    color: 'purple',
    target: 55,
    rewardMoves: 3,
    baseMoves: 22,
    title: 'Royal Finale',
    summary: 'Finish the opening set with 55 purples.',
    scoreTarget: 3400,
    scoreMilestone: 1000,
    movesPerMilestone: 1,
    refillBonus: 2
  },
  // Extended missions
  {
    id: 'mission-6', color: 'orange', target: 64, rewardMoves: 3, baseMoves: 23,
    title: 'Amber Surge', summary: 'Push deeper with compact orange clears.',
    scoreTarget: 4000, scoreMilestone: 1100, movesPerMilestone: 1, refillBonus: 2
  },
  {
    id: 'mission-7', color: 'red', target: 76, rewardMoves: 3, baseMoves: 24,
    title: 'Crimson Drive', summary: 'Master long cascades for high score.',
    scoreTarget: 4600, scoreMilestone: 1200, movesPerMilestone: 1, refillBonus: 3
  },
  {
    id: 'mission-8', color: 'blue', target: 88, rewardMoves: 3, baseMoves: 25,
    title: 'Azure Flow', summary: 'Keep the combos rolling.',
    scoreTarget: 5200, scoreMilestone: 1300, movesPerMilestone: 1, refillBonus: 3
  },
  {
    id: 'mission-9', color: 'green', target: 100, rewardMoves: 3, baseMoves: 26,
    title: 'Emerald Path', summary: 'Bigger goals, bigger rewards.',
    scoreTarget: 5800, scoreMilestone: 1400, movesPerMilestone: 1, refillBonus: 3
  },
  {
    id: 'mission-10', color: 'yellow', target: 115, rewardMoves: 4, baseMoves: 27,
    title: 'Solar Bloom', summary: 'Score high, earn more moves.',
    scoreTarget: 6400, scoreMilestone: 1500, movesPerMilestone: 1, refillBonus: 3
  },
  {
    id: 'mission-11', color: 'purple', target: 130, rewardMoves: 4, baseMoves: 28,
    title: 'Violet Storm', summary: 'Chase long snakes and T/L shapes.',
    scoreTarget: 7000, scoreMilestone: 1600, movesPerMilestone: 1, refillBonus: 4
  },
  {
    id: 'mission-12', color: 'orange', target: 146, rewardMoves: 4, baseMoves: 29,
    title: 'Citrus Rush', summary: 'Stay efficient with every swap.',
    scoreTarget: 7600, scoreMilestone: 1700, movesPerMilestone: 1, refillBonus: 4
  },
  {
    id: 'mission-13', color: 'red', target: 162, rewardMoves: 4, baseMoves: 30,
    title: 'Scarlet Sprint', summary: 'Precision swaps pay off.',
    scoreTarget: 8200, scoreMilestone: 1800, movesPerMilestone: 1, refillBonus: 4
  },
  {
    id: 'mission-14', color: 'blue', target: 180, rewardMoves: 4, baseMoves: 31,
    title: 'Deep Tide', summary: 'Keep momentum across cascades.',
    scoreTarget: 8800, scoreMilestone: 1900, movesPerMilestone: 1, refillBonus: 4
  },
  {
    id: 'mission-15', color: 'green', target: 198, rewardMoves: 5, baseMoves: 32,
    title: 'Forest Rally', summary: 'Sustain long runs.',
    scoreTarget: 9400, scoreMilestone: 2000, movesPerMilestone: 1, refillBonus: 5
  },
  {
    id: 'mission-16', color: 'yellow', target: 218, rewardMoves: 5, baseMoves: 33,
    title: 'Solar Flare', summary: 'More tiles, more fun.',
    scoreTarget: 10000, scoreMilestone: 2100, movesPerMilestone: 1, refillBonus: 5
  },
  {
    id: 'mission-17', color: 'purple', target: 238, rewardMoves: 5, baseMoves: 34,
    title: 'Royal Parade', summary: 'Challenging, but rewarding.',
    scoreTarget: 10600, scoreMilestone: 2200, movesPerMilestone: 1, refillBonus: 5
  },
  {
    id: 'mission-18', color: 'orange', target: 260, rewardMoves: 5, baseMoves: 35,
    title: 'Amber Apex', summary: 'Maximize every cascade.',
    scoreTarget: 11200, scoreMilestone: 2300, movesPerMilestone: 1, refillBonus: 5
  },
  {
    id: 'mission-19', color: 'red', target: 282, rewardMoves: 5, baseMoves: 36,
    title: 'Crimson Peak', summary: 'Only the best survive.',
    scoreTarget: 11800, scoreMilestone: 2400, movesPerMilestone: 1, refillBonus: 6
  },
  {
    id: 'mission-20', color: 'blue', target: 306, rewardMoves: 6, baseMoves: 37,
    title: 'Abyss Run', summary: 'Endurance challenge.',
    scoreTarget: 12400, scoreMilestone: 2500, movesPerMilestone: 1, refillBonus: 6
  }
];

// Compute base moves from difficulty: scales with target and level index.
export const computeBaseMoves = (template: MissionTemplate, levelIndex: number): number => {
  // Slight easing: a bit more baseline and per-level growth.
  const base = 13;                           // was 12
  const targetFactor = template.target / 6;  // +1 move per +6 target
  const levelFactor = levelIndex * 0.8;      // was 0.7
  const moves = Math.round(base + targetFactor + levelFactor);
  // Never below 10; small cap for extreme tiers can be added later if needed.
  return Math.max(10, moves);
};

export const createMissionFromTemplate = (template: MissionTemplate, levelIndex = 0): Mission => ({
  id: template.id,
  type: 'collect-color',
  color: template.color,
  target: template.target,
  progress: 0,
  // Dynamically computed base moves based on difficulty progression
  baseMoves: computeBaseMoves(template, levelIndex),
  reward: {
    type: 'extra-moves',
    amount: Math.max(0, template.rewardMoves)
  },
  rewardClaimed: false,
  title: template.title,
  summary: template.summary,
  scoreTarget: template.scoreTarget,
  scoreProgress: 0,
  scoreMilestone: template.scoreMilestone,
  movesPerMilestone: Math.max(0, template.movesPerMilestone),
  refillBonus: template.refillBonus
});
