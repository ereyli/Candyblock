'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BASE_MOVE_LIMIT,
  MAX_RESHUFFLES_PER_RUN,
  MISSION_SEQUENCE,
  MISSION_SCORE_MULTIPLIER,
  createMissionFromTemplate
} from '../lib/game/constants';
import { useSfx } from './useSfx';
import {
  areAdjacent,
  generateInitialBoard,
  hasPlayableMove,
  missionsCompleted,
  resolveMatches,
  resolveWithInitialRemoval,
  swapCandies,
  updateMissions,
  positionKey,
  getDetonationKeys
} from '../lib/game/utils';
import type { Board, GameStatus, Mission, Position, CandyColor, SpawnAnimationInfo } from '../lib/game/types';
import { ENGINE_STORAGE_KEY } from '../lib/storage/constants';

export interface BoosterInventory {
  extraMoves: number;
}

const MATCH_ANIMATION_MS = 340;
const FALL_ANIMATION_MS = 260; // fallback minimum

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const missionFromIndex = (index: number): Mission | null => {
  const template = MISSION_SEQUENCE[index];
  return template ? createMissionFromTemplate(template, index) : null;
};

const initialMissionState = () => {
  const mission = missionFromIndex(0);
  return mission ? [mission] : [];
};

interface PersistedEngineState {
  version: number;
  board: Board;
  missions: Mission[];
  missionIndex: number;
  movesLeft: number;
  score: number;
  status: GameStatus;
  reshuffles: number;
  boosters: BoosterInventory;
}

const ENGINE_STATE_VERSION = 1;

const loadPersistedEngineState = (): PersistedEngineState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENGINE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedEngineState | null;
    if (!parsed || parsed.version !== ENGINE_STATE_VERSION) return null;
    if (!Array.isArray(parsed.board) || !Array.isArray(parsed.missions)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const persistEngineState = (state: PersistedEngineState | null) => {
  if (typeof window === 'undefined') return;
  if (!state) {
    window.localStorage.removeItem(ENGINE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ENGINE_STORAGE_KEY, JSON.stringify(state));
};

export const useGameEngine = () => {
  const sfx = useSfx();
  const persisted = loadPersistedEngineState();
  const STARTING_RESHUFFLES = 1;
  const [status, setStatus] = useState<GameStatus>(persisted?.status ?? 'locked');
  const [board, setBoard] = useState<Board>(() => persisted?.board ?? generateInitialBoard());
  const [missions, setMissions] = useState<Mission[]>(
    () => persisted?.missions ?? initialMissionState()
  );
  const [missionIndex, setMissionIndex] = useState<number>(
    () => persisted?.missionIndex ?? (missionFromIndex(0) ? 0 : MISSION_SEQUENCE.length)
  );
  const [movesLeft, setMovesLeft] = useState<number>(
    () => persisted?.movesLeft ?? (missionFromIndex(0)?.baseMoves ?? BASE_MOVE_LIMIT)
  );
  const [score, setScore] = useState<number>(persisted?.score ?? 0);
  const [selected, setSelected] = useState<Position | null>(null);
  const [boosters, setBoosters] = useState<BoosterInventory>(persisted?.boosters ?? { extraMoves: 0 });
  const [reshuffles, setReshuffles] = useState<number>(
    Math.min(MAX_RESHUFFLES_PER_RUN, persisted?.reshuffles ?? STARTING_RESHUFFLES)
  );
  const [lastInvalidSwap, setLastInvalidSwap] = useState<{ a: Position; b: Position } | null>(null);
  const [poppingCells, setPoppingCells] = useState<string[]>([]);
  const [fallingInfo, setFallingInfo] = useState<Record<string, number>>({});
  const [spawnedInfo, setSpawnedInfo] = useState<Record<string, SpawnAnimationInfo>>({});
  const [movesToast, setMovesToast] = useState<number>(0);

  useEffect(() => {
    if (status === 'locked') {
      persistEngineState(null);
      return;
    }
    const state: PersistedEngineState = {
      version: ENGINE_STATE_VERSION,
      board,
      missions,
      missionIndex,
      movesLeft,
      score,
      status,
      reshuffles,
      boosters
    };
    persistEngineState(state);
  }, [board, missions, missionIndex, movesLeft, score, status, reshuffles, boosters]);

  useEffect(() => {
    if (status !== 'idle') return;
    if (!board.length || !board[0]?.length) return;
    if (hasPlayableMove(board)) return;

    const reshuffled = generateInitialBoard();
    setBoard(reshuffled);
    setSelected(null);
    setPoppingCells([]);
    setFallingInfo({});
    setSpawnedInfo({});
  }, [board, status]);

  const resetState = useCallback(() => {
    const mission = missionFromIndex(0);
    setBoard(generateInitialBoard());
    setMissions(mission ? [mission] : []);
    setMissionIndex(mission ? 0 : MISSION_SEQUENCE.length);
    // start with first mission's baseMoves if available
    setMovesLeft(mission?.baseMoves ?? BASE_MOVE_LIMIT);
    setScore(0);
    setSelected(null);
    setBoosters({ extraMoves: 0 });
    setLastInvalidSwap(null);
    setPoppingCells([]);
    setFallingInfo({});
    setSpawnedInfo({});
    setReshuffles(Math.min(MAX_RESHUFFLES_PER_RUN, STARTING_RESHUFFLES));
    setStatus('idle');
  }, []);

  const lockGame = useCallback(() => {
    setStatus('locked');
    setSelected(null);
    setLastInvalidSwap(null);
    setPoppingCells([]);
    setFallingInfo({});
    setSpawnedInfo({});
  }, []);

  const startSession = useCallback(() => {
    resetState();
    setStatus('idle');
  }, [resetState]);

  const handleCandyClick = useCallback(
    async (position: Position) => {
      if (status === 'locked' || status === 'resolving' || status === 'won' || status === 'lost') {
        return;
      }

      if (!selected) {
        setSelected(position);
        return;
      }

      if (selected.row === position.row && selected.col === position.col) {
        setSelected(null);
        return;
      }

      if (!areAdjacent(selected, position)) {
        setSelected(position);
        return;
      }

      setStatus('resolving');
      sfx.resume();
      const previousBoard = board;
      const swapped = swapCandies(board, selected, position);
      setBoard(swapped);
      setSelected(null);

      // Bomb swap: if either side has a bomb, detonate 3x3 at bomb's new position
      const a = board[selected.row][selected.col];
      const b = board[position.row][position.col];
      let result;
      if (a?.special === 'bomb' || b?.special === 'bomb') {
        const bombAt = a?.special === 'bomb' ? position : selected;
        const keys = getDetonationKeys(swapped, bombAt);
        sfx.bomb();
        result = resolveWithInitialRemoval(swapped, keys);
      } else {
        result = resolveMatches(swapped);
      }

      if (result.steps.length === 0) {
        setLastInvalidSwap({ a: selected, b: position });
        await sleep(MATCH_ANIMATION_MS);
        setBoard(previousBoard);
        await sleep(FALL_ANIMATION_MS);
        setLastInvalidSwap(null);
        setStatus('idle');
        sfx.invalid();
        return;
      }

      let workingBoard = swapped;
      for (const step of result.steps) {
        const popKeys = step.positions.map((cell) => positionKey(cell));
        const fallingMap: Record<string, number> = {};
        step.fallingTargets.forEach(({ to, distance }) => {
          fallingMap[positionKey(to)] = distance;
        });
        const spawnMap: Record<string, SpawnAnimationInfo> = {};

        setPoppingCells(popKeys);
        setFallingInfo(fallingMap);

        const fallingValues = Object.values(fallingMap);
        const fallDurations = fallingValues.map((d) => 0.62 + d * 0.16 + Math.min(d * 0.085, 0.65));
        const maxFallDuration = fallDurations.length > 0 ? Math.max(...fallDurations) : 0;

        const spawnEntries = step.spawnedTargets.map(({ to, distance }) => {
          const key = positionKey(to);
          spawnMap[key] = {
            distance,
            delay: maxFallDuration
          };
          return { distance };
        });

        setSpawnedInfo(spawnMap);

        await sleep(MATCH_ANIMATION_MS);
        sfx.pop(popKeys.length);
        workingBoard = step.board;
        setBoard(workingBoard);
        // Dynamically wait based on the longest falling/spawn animation in this step
        const hasFalling = fallingValues.length > 0;
        const hasSpawn = spawnEntries.length > 0;
        const maxDist = hasFalling ? Math.max(...fallingValues) : 0;
        const calcFallDuration = 0.75 + maxDist * 0.22;
        const calcFallDelay = Math.min(maxDist * 0.10, 0.8);
        const fallWaitSec = calcFallDuration + calcFallDelay + 0.12;

        const spawnDurations = spawnEntries.map(({ distance }) => {
          const travel = 0.62 + distance * 0.16;
          return maxFallDuration + travel + 0.12;
        });
        const spawnWaitSec = spawnDurations.length > 0 ? Math.max(...spawnDurations) : 0;
        const waitMs = Math.max(Math.round(fallWaitSec * 1000), Math.round(spawnWaitSec * 1000), FALL_ANIMATION_MS);
        await sleep(waitMs);
        const avgDist = fallingValues.reduce((a, b) => a + b, 0) / Math.max(1, fallingValues.length);
        if (hasFalling) sfx.drop(avgDist);
        if (hasSpawn) sfx.spawn(Object.keys(spawnMap).length);

        setPoppingCells([]);
        setFallingInfo({});
        setSpawnedInfo({});
      }

      if (!hasPlayableMove(workingBoard)) {
        workingBoard = generateInitialBoard();
        setBoard(workingBoard);
        setSelected(null);
        setPoppingCells([]);
        setFallingInfo({});
        setSpawnedInfo({});
      }

      // Build color removal counts from cascade steps so that all accidental
      // matches during falling are included deterministically
      const totalCounts: Record<CandyColor, number> = {
        red: 0,
        orange: 0,
        yellow: 0,
        green: 0,
        blue: 0,
        purple: 0
      };
      for (const step of result.steps) {
        const c = step.removedCountByColor;
        if (!c) continue;
        for (const k in c) {
          const key = k as CandyColor;
          totalCounts[key] = (totalCounts[key] ?? 0) + (c[key] ?? 0);
        }
      }
      // apply counts to missions
      const updatedMissions = missions.map((m) => {
        if (m.type !== 'collect-color') return m;
        const inc = totalCounts[m.color] ?? 0;
        if (inc <= 0) return m;
        const progress = Math.min(m.target, m.progress + inc);
        return { ...m, progress };
      });
      const missionCompletedThisStep =
        updatedMissions.length > 0 && updatedMissions[0].progress >= updatedMissions[0].target;
      // difficulty-scaled score bonus for mission completion
      let missionScoreBonus = 0;
      const currentTpl = MISSION_SEQUENCE[missionIndex];
      if (missionCompletedThisStep && currentTpl) {
        missionScoreBonus = currentTpl.target * MISSION_SCORE_MULTIPLIER;
      }

      let bonusMoves = 0;
      let scoreMilestoneShuffles = 0;
      let finalMissions = updatedMissions.map((mission, index) => {
        const previous = missions[index];
        // score milestone grants: count how many milestones crossed in this step
        if (mission && mission.scoreMilestone && mission.movesPerMilestone) {
          const before = previous?.scoreProgress ?? 0;
          const after = before + result.points;
          const m = mission.scoreMilestone;
          const crossed = Math.floor(after / m) - Math.floor(before / m);
          if (crossed > 0) {
            scoreMilestoneShuffles += crossed * mission.movesPerMilestone; // award reshuffle tokens
          }
          mission = { ...mission, scoreProgress: after };
        }
        if (
          mission.reward &&
          !mission.rewardClaimed &&
          mission.progress >= mission.target &&
          (!previous?.rewardClaimed || previous.progress < mission.target)
        ) {
          bonusMoves += mission.reward.amount;
          return { ...mission, rewardClaimed: true };
        }
        if (previous?.rewardClaimed && !mission.rewardClaimed) {
          return { ...mission, rewardClaimed: true };
        }
        return mission;
      });

      let nextMissionIndex = missionIndex;
      if (missionCompletedThisStep) {
        const upcomingIndex = missionIndex + 1;
        const nextMission = missionFromIndex(upcomingIndex);
        nextMissionIndex = upcomingIndex;
        finalMissions = nextMission ? [nextMission] : [];
        sfx.missionComplete();
      }

      // milestone rewards no longer add moves; they add reshuffle tokens
      const nextMoves = movesLeft - 1 + bonusMoves + result.extraMoveReward;
      const didWin = missionsCompleted(finalMissions);
      // Game over if no moves remain (milestones and rewards are already auto-applied)
      const didLose = !didWin && nextMoves <= 0;

      setMissions(finalMissions);
      setMissionIndex(nextMissionIndex);
      // apply milestone reshuffles
      if (scoreMilestoneShuffles > 0)
        setReshuffles((prev) => Math.min(MAX_RESHUFFLES_PER_RUN, prev + scoreMilestoneShuffles));
      // carry-over moves + add next mission baseMoves if switching
      let finalMoves = nextMoves;
      let baseTopUp = 0;
      if (missionCompletedThisStep) {
        const nextM = missionFromIndex(nextMissionIndex);
        if (nextM?.baseMoves) {
          const toppedUp = Math.max(nextMoves, nextM.baseMoves);
          baseTopUp = Math.max(0, toppedUp - nextMoves);
          finalMoves = toppedUp;
        }
      }
      setMovesLeft(finalMoves);
      // moves toast for granted moves this step (bonus + extras + next baseMoves)
      {
        const granted = bonusMoves + result.extraMoveReward + baseTopUp;
        if (granted > 0) {
          setMovesToast(granted);
          setTimeout(() => setMovesToast(0), 1200);
        }
      }
      // boosters no longer required; moves are auto-applied on milestones/completion
      setScore((prev) => prev + result.points + missionScoreBonus);
      setLastInvalidSwap(null);
      setStatus(didWin ? 'won' : didLose ? 'lost' : 'idle');
      if (scoreMilestoneShuffles > 0 || bonusMoves > 0) sfx.extraMoves();
      if (didWin) sfx.win();
      if (didLose) sfx.lose();
    },
    [board, missions, missionIndex, movesLeft, selected, status, sfx]
  );

  const useExtraMoves = useCallback(() => false, []);

  const useReshuffle = useCallback(() => {
    if (status === 'locked' || status === 'lost' || status === 'won') return false;
    if (reshuffles <= 0) return false;
    setReshuffles((p) => p - 1);
    setBoard(generateInitialBoard());
    setSelected(null);
    setStatus('idle');
    return true;
  }, [reshuffles, status]);

  const unlockGame = useCallback(() => {
    if (status === 'locked') {
      startSession();
    }
  }, [startSession, status]);

  const totalMissionCount = MISSION_SEQUENCE.length;

  const gameSummary = useMemo(
    () => ({
      status,
      score,
      movesLeft,
      missions,
      missionIndex,
      totalMissionCount,
      currentBaseMoves: missions[0]?.baseMoves ?? BASE_MOVE_LIMIT,
      boosters,
      selected,
      lastInvalidSwap,
      poppingCells,
      fallingInfo,
      spawnedInfo,
      movesToast,
      reshuffles
    }),
    [
      status,
      score,
      movesLeft,
      missions,
      missionIndex,
      totalMissionCount,
      boosters,
      selected,
      lastInvalidSwap,
      poppingCells,
      fallingInfo,
      spawnedInfo,
      movesToast,
      reshuffles
    ]
  );

  const forceShuffle = useCallback(() => {
    const shuffled = generateInitialBoard();
    const mission = missionFromIndex(0);
    setBoard(shuffled);
    setStatus('idle');
    setSelected(null);
    setPoppingCells([]);
    setFallingInfo({});
    setSpawnedInfo({});
    if (missions.length === 0 && mission) {
      setMissions([mission]);
      setMissionIndex(0);
    }
  }, [missions.length]);

  return {
    board,
    selected,
    status,
    score,
    movesLeft,
    missions,
    missionIndex,
    totalMissionCount,
    boosters,
    lastInvalidSwap,
    poppingCells,
    fallingInfo,
    spawnedInfo,
    startSession,
    unlockGame,
    handleCandyClick,
    useExtraMoves,
    useReshuffle,
    forceShuffle,
    resetState,
    lockGame,
    gameSummary,
    movesToast,
    reshuffles
  };
};

export type GameEngine = ReturnType<typeof useGameEngine>;
