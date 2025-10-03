export type CandyColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

export interface Candy {
  id: string;
  color: CandyColor;
  isHighlighted?: boolean;
  special?: 'bomb';
}

export type Board = Candy[][];

export interface Position {
  row: number;
  col: number;
}

export type MissionType = 'collect-color';

export interface Mission {
  id: string;
  type: MissionType;
  color: CandyColor;
  target: number;
  progress: number;
  baseMoves?: number;
  reward?: {
    type: 'extra-moves';
    amount: number;
  };
  rewardClaimed?: boolean;
  title?: string;
  summary?: string;
  // Optional score-based objective and rewards
  scoreTarget?: number; // total score target for the mission tier
  scoreProgress?: number; // accumulated score during this mission tier
  scoreMilestone?: number; // grant moves each time this threshold is crossed
  movesPerMilestone?: number; // how many moves to grant per milestone
  refillBonus?: number; // on mission completion, refill to BASE_MOVE_LIMIT + refillBonus
}

export type GameStatus = 'idle' | 'resolving' | 'won' | 'lost' | 'locked';

export interface FallingCandy {
  from: Position;
  to: Position;
  distance: number;
}

export interface SpawnedCandy {
  to: Position;
  distance: number;
}

export interface MatchCascadeStep {
  positions: Position[];
  board: Board;
  fallingTargets: FallingCandy[];
  spawnedTargets: SpawnedCandy[];
  removedCountByColor?: Partial<Record<CandyColor, number>>;
}

export interface SpawnAnimationInfo {
  distance: number;
  delay: number;
}

export interface MatchResult {
  board: Board;
  removed: Candy[];
  points: number;
  steps: MatchCascadeStep[];
  extraMoveReward: number;
}
