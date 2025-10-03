import { BOARD_SIZE, CANDY_COLORS, MATCH_SCORE_BASE } from './constants';
import type { Board, Candy, CandyColor, MatchCascadeStep, MatchResult, Mission, Position } from './types';

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}-${Date.now()}`;

const randomColor = (exclude: CandyColor[] = []): CandyColor => {
  const pool = CANDY_COLORS.filter((color) => !exclude.includes(color));
  const targetPool = pool.length > 0 ? pool : CANDY_COLORS;
  const index = Math.floor(Math.random() * targetPool.length);
  return targetPool[index];
};

const createCandy = (color: CandyColor): Candy => ({
  id: randomId(),
  color
});

export const positionKey = ({ row, col }: Position) => `${row},${col}`;
export const positionFromKey = (key: string): Position => {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
};

const wouldCreateMatch = (board: Board, row: number, col: number, color: CandyColor): boolean => {
  const left1 = board[row]?.[col - 1];
  const left2 = board[row]?.[col - 2];
  if (left1 && left2 && left1.color === color && left2.color === color) {
    return true;
  }

  const up1 = board[row - 1]?.[col];
  const up2 = board[row - 2]?.[col];
  if (up1 && up2 && up1.color === color && up2.color === color) {
    return true;
  }

  return false;
};

const createBoardCandidate = (size = BOARD_SIZE): Board => {
  const board: Board = Array.from({ length: size }, () => Array.from({ length: size }, () => createCandy(randomColor())));

  // 1) Avoid immediate straight 3-in-a-row/column while filling
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let attempts = 0;
      while (wouldCreateMatch(board, row, col, board[row][col].color) && attempts < 40) {
        board[row][col] = createCandy(randomColor([board[row][col].color]));
        attempts += 1;
      }
    }
  }

  // 2) With L/T/snake detection enabled in the resolver, ensure no pre-existing
  // connected clusters (>=3) exist at start. Iterate until stable or safety cap.
  const maxFix = size * size * 20;
  let fixes = 0;
  const seen = new Set<string>();
  const bfsCluster = (r: number, c: number): Position[] => {
    const color = board[r][c].color;
    const q: Position[] = [{ row: r, col: c }];
    const out: Position[] = [];
    const key = (p: Position) => `${p.row},${p.col}`;
    seen.add(key(q[0]));
    while (q.length) {
      const cur = q.pop() as Position;
      out.push(cur);
      const neigh = [
        { row: cur.row - 1, col: cur.col },
        { row: cur.row + 1, col: cur.col },
        { row: cur.row, col: cur.col - 1 },
        { row: cur.row, col: cur.col + 1 }
      ];
      for (const nb of neigh) {
        if (
          nb.row >= 0 && nb.row < size && nb.col >= 0 && nb.col < size &&
          board[nb.row][nb.col].color === color && !seen.has(key(nb))
        ) {
          seen.add(key(nb));
          q.push(nb);
        }
      }
    }
    return out;
  };

  while (fixes < maxFix) {
    seen.clear();
    let fixedAny = false;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const k = `${r},${c}`;
        if (seen.has(k)) continue;
        const cluster = bfsCluster(r, c);
        if (cluster.length >= 3) {
          // change a random cell in the cluster to break it
          const pick = cluster[Math.floor(Math.random() * cluster.length)];
          const original = board[pick.row][pick.col].color;
          let attempts = 0;
          do {
            board[pick.row][pick.col] = createCandy(randomColor([original]));
            attempts += 1;
          } while (attempts < 20 && wouldCreateMatch(board, pick.row, pick.col, board[pick.row][pick.col].color));
          fixedAny = true;
          fixes += 1;
          if (fixes >= maxFix) break;
        }
      }
      if (fixes >= maxFix) break;
    }
    if (!fixedAny) break;
  }

  return board;
};

export const generateInitialBoard = (size = BOARD_SIZE): Board => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = createBoardCandidate(size);
    if (hasPlayableMove(candidate)) {
      return candidate;
    }
  }
  return createBoardCandidate(size);
};

export const cloneBoard = (board: Board): Board => board.map((row) => row.map((candy) => ({ ...candy })));

export const swapCandies = (board: Board, a: Position, b: Position): Board => {
  const next = cloneBoard(board);
  const temp = next[a.row][a.col];
  next[a.row][a.col] = next[b.row][b.col];
  next[b.row][b.col] = temp;
  return next;
};

export const areAdjacent = (a: Position, b: Position): boolean => {
  const rowDiff = Math.abs(a.row - b.row);
  const colDiff = Math.abs(a.col - b.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
};

// Return connected (orthogonal) same-color groups of size >= 3.
// This enables L, T, and snake-like matches in addition to straight lines.
interface MatchGroup {
  positions: Position[];
  color: CandyColor;
}

// Strict line-match finder (only horizontal/vertical runs of >= 3)
const findLineMatches = (board: Board) => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const matchKeys = new Set<string>();
  const bombKeys = new Set<string>();
  let longGroups = 0;

  // horizontal runs
  for (let r = 0; r < rows; r += 1) {
    let c = 0;
    while (c < cols) {
      const color = board[r][c].color;
      let len = 1;
      while (c + len < cols && board[r][c + len].color === color) len += 1;
      if (len >= 3) {
        for (let k = 0; k < len; k += 1) matchKeys.add(positionKey({ row: r, col: c + k }));
        if (len >= 5) bombKeys.add(positionKey({ row: r, col: c + Math.floor(len / 2) }));
        if (len >= LONG_MATCH_LENGTH) longGroups += 1;
      }
      c += len;
    }
  }

  // vertical runs
  for (let c = 0; c < cols; c += 1) {
    let r = 0;
    while (r < rows) {
      const color = board[r][c].color;
      let len = 1;
      while (r + len < rows && board[r + len][c].color === color) len += 1;
      if (len >= 3) {
        for (let k = 0; k < len; k += 1) matchKeys.add(positionKey({ row: r + k, col: c }));
        if (len >= 5) bombKeys.add(positionKey({ row: r + Math.floor(len / 2), col: c }));
        if (len >= LONG_MATCH_LENGTH) longGroups += 1;
      }
      r += len;
    }
  }

  return { matchKeys, bombKeys, longGroups };
};

interface CollapseResult {
  board: Board;
  removed: Candy[];
  fallenTargets: { from: Position; to: Position; distance: number }[];
  spawnedTargets: { to: Position; distance: number }[];
}

const collapseBoard = (board: Board, matches: Set<string>, bombKeys?: Set<string>): CollapseResult => {
  const working: (Candy | null)[][] = board.map((row) => row.map((candy) => ({ ...candy })));
  const removed: Candy[] = [];
  const fallenTargets: { from: Position; to: Position; distance: number }[] = [];
  const spawnedTargets: { to: Position; distance: number }[] = [];

  matches.forEach((key) => {
    const { row, col } = positionFromKey(key);
    const candy = working[row][col];
    if (!candy) return;
    // If this position is reserved to become a bomb, don't remove; mark special
    if (bombKeys && bombKeys.has(key)) {
      working[row][col] = { ...candy, special: 'bomb' } as Candy;
      return;
    }
    removed.push(candy);
    working[row][col] = null;
  });

  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let writeRow = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const candy = working[row][col];
      if (candy) {
        working[writeRow][col] = candy;
        if (writeRow !== row) {
          const distance = writeRow - row;// positive number of cells moved downward
          fallenTargets.push({
            from: { row, col },
            to: { row: writeRow, col },
            distance
          });
          working[row][col] = null;
        }
        writeRow -= 1;
      }
    }

    for (let row = writeRow; row >= 0; row -= 1) {
      const neighbors: CandyColor[] = [];
      const left = working[row]?.[col - 1]?.color;
      const left2 = working[row]?.[col - 2]?.color;
      if (left) neighbors.push(left);
      if (left2) neighbors.push(left2);
      const down = working[row + 1]?.[col]?.color;
      const down2 = working[row + 2]?.[col]?.color;
      if (down) neighbors.push(down);
      if (down2) neighbors.push(down2);

      const color = randomColor(neighbors);
      const newCandy = createCandy(color);
      working[row][col] = newCandy;
      spawnedTargets.push({ to: { row, col }, distance: row + 1 });
    }
  }

  return {
    board: working.map((row) => row.map((candy) => ({ ...(candy as Candy) }))),
    removed,
    fallenTargets,
    spawnedTargets
  };
};

const createCascadeStep = (
  positions: string[],
  state: CollapseResult
): MatchCascadeStep => {
  const counts: Partial<Record<CandyColor, number>> = {};
  for (const c of state.removed) {
    counts[c.color] = (counts[c.color] ?? 0) + 1;
  }
  return {
    positions: positions.map(positionFromKey),
    board: state.board,
    fallingTargets: state.fallenTargets,
    spawnedTargets: state.spawnedTargets,
    removedCountByColor: counts
  };
};

const LONG_MATCH_LENGTH = 4;

export const getDetonationKeys = (board: Board, center: Position): Set<string> => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const keys = new Set<string>();
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      const r = center.row + dr;
      const c = center.col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) keys.add(positionKey({ row: r, col: c }));
    }
  }
  return keys;
};

export const resolveMatches = (board: Board): MatchResult => {
  let working = cloneBoard(board);
  const totalRemoved: Candy[] = [];
  let totalPoints = 0;
  const steps: MatchCascadeStep[] = [];
  let extraMoveReward = 0;

  while (true) {
    const { matchKeys, bombKeys, longGroups } = findLineMatches(working);
    if (matchKeys.size === 0) break;
    extraMoveReward += longGroups;

    const collapseState = collapseBoard(working, matchKeys, bombKeys);
    totalRemoved.push(...collapseState.removed);
    totalPoints += collapseState.removed.length * MATCH_SCORE_BASE;

    steps.push(createCascadeStep(Array.from(matchKeys), collapseState));
    working = collapseState.board;
  }

  return {
    board: working,
    removed: totalRemoved,
    points: totalPoints,
    steps,
    extraMoveReward
  };
};

export const hasPlayableMove = (board: Board): boolean => {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (col + 1 < cols) {
        const swapped = swapCandies(board, { row, col }, { row, col: col + 1 });
        if (resolveMatches(swapped).steps.length > 0) {
          return true;
        }
      }
      if (row + 1 < rows) {
        const swapped = swapCandies(board, { row, col }, { row: row + 1, col });
        if (resolveMatches(swapped).steps.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
};

export const resolveWithInitialRemoval = (board: Board, initialKeys: Set<string>): MatchResult => {
  let working = cloneBoard(board);
  const totalRemoved: Candy[] = [];
  let totalPoints = 0;
  const steps: MatchCascadeStep[] = [];
  let extraMoveReward = 0;

  // Initial detonation
  if (initialKeys.size > 0) {
    const state = collapseBoard(working, initialKeys);
    steps.push(createCascadeStep(Array.from(initialKeys), state));
    totalRemoved.push(...state.removed);
    totalPoints += state.removed.length * MATCH_SCORE_BASE;
    working = state.board;
  }

  // Then continue with normal cascades
  while (true) {
    const { matchKeys, bombKeys, longGroups } = findLineMatches(working);
    if (matchKeys.size === 0) break;
    extraMoveReward += longGroups;

    const state = collapseBoard(working, matchKeys, bombKeys);
    steps.push(createCascadeStep(Array.from(matchKeys), state));
    totalRemoved.push(...state.removed);
    totalPoints += state.removed.length * MATCH_SCORE_BASE;
    working = state.board;
  }

  return { board: working, removed: totalRemoved, points: totalPoints, steps, extraMoveReward };
};

export const updateMissions = (missions: Mission[], removedCandies: Candy[]): Mission[] =>
  missions.map((mission) => {
    if (mission.type !== 'collect-color') {
      return mission;
    }

    const collected = removedCandies.filter((candy) => candy.color === mission.color).length;
    if (collected === 0) {
      return mission;
    }

    const progress = Math.min(mission.target, mission.progress + collected);
    return { ...mission, progress };
  });

export const missionsCompleted = (missions: Mission[]): boolean =>
  missions.every((mission) => mission.progress >= mission.target);
