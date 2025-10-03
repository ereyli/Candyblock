'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import clsx from 'clsx';
import styles from './Board.module.css';
import type { Board as BoardType, GameStatus, Position, SpawnAnimationInfo } from '../lib/game/types';

interface BoardProps {
  board: BoardType;
  selected: Position | null;
  status: GameStatus;
  lastInvalidSwap: { a: Position; b: Position } | null;
  poppingCells: string[];
  fallingInfo: Record<string, number>;
  spawnedInfo: Record<string, number>;
  onCandyClick: (position: Position) => void | Promise<void>;
}

const tileClassForColor = (color: string) => {
  switch (color) {
    case 'red':
      return styles.red;
    case 'orange':
      return styles.orange;
    case 'yellow':
      return styles.yellow;
    case 'green':
      return styles.green;
    case 'blue':
      return styles.blue;
    case 'purple':
      return styles.purple;
    default:
      return styles.red;
  }
};

const isSamePosition = (a: Position | null, b: Position | null) =>
  !!a && !!b && a.row === b.row && a.col === b.col;

const positionKey = (row: number, col: number) => `${row},${col}`;
// Approximate tile + gap distance for one cell travel. Kept in sync with CSS sizes.
const CELL_TRAVEL_PX = 56; 

export function Board({
  board,
  selected,
  status,
  lastInvalidSwap,
  poppingCells,
  fallingInfo,
  spawnedInfo,
  onCandyClick
}: BoardProps) {
  const disabled = status === 'resolving' || status === 'locked' || status === 'won' || status === 'lost';
  const popSet = useMemo(() => new Set(poppingCells), [poppingCells]);
  const fallingMap = useMemo(() => new Map(Object.entries(fallingInfo)), [fallingInfo]);
  const spawnMap = useMemo(() => new Map(Object.entries(spawnedInfo) as [string, SpawnAnimationInfo][]), [spawnedInfo]);

  return (
    <div className={styles.wrapper}>
      {board.map((row, rowIndex) => (
        <div key={`row-${rowIndex}`} className={styles.row}>
          {row.map((candy, colIndex) => {
            const position: Position = { row: rowIndex, col: colIndex };
            const key = positionKey(rowIndex, colIndex);
            const isSelected = isSamePosition(selected, position);
            const isInvalid =
              lastInvalidSwap !== null &&
              (isSamePosition(lastInvalidSwap.a, position) || isSamePosition(lastInvalidSwap.b, position));
            const isPopping = popSet.has(key);
            const spawnInfo = spawnMap.get(key);
            const fallDistanceRaw = fallingMap.has(key)
              ? Number(fallingMap.get(key))
              : spawnInfo?.distance;
            let isFalling = typeof fallDistanceRaw === 'number' && fallDistanceRaw > 0;
            const isSpawned = !!spawnInfo;
            const dynamicStyle: (CSSProperties & Record<string, string>) = {};

            // If this cell is popping in the current frame, suppress any fall/spawn visuals
            // to avoid the impression of reappearing tiles.
            if (isPopping) {
              isFalling = false;
            }

            // Treat spawns as proper falls from above so they always descend visibly.
            if (isSpawned && !isPopping) {
              isFalling = true;
            }

            if (isFalling) {
              const effectiveDistance = fallDistanceRaw && fallDistanceRaw > 0
                ? fallDistanceRaw
                : rowIndex + 1;
              const fallPixels = effectiveDistance * CELL_TRAVEL_PX;
              dynamicStyle['--fall-distance'] = `${fallPixels}px`;
              // Balanced timings (not too slow, not too fast)
              const baseDuration = 0.62 + effectiveDistance * 0.16;
              const baseDelay = Math.min(effectiveDistance * 0.085, 0.65);
              dynamicStyle['--fall-duration'] = `${baseDuration}s`;
              dynamicStyle['--fall-delay'] = `${spawnInfo ? spawnInfo.delay : baseDelay}s`;
            }

            return (
              <button
                key={candy.id}
                type="button"
                className={clsx(styles.tile, tileClassForColor(candy.color), {
                  [styles.selected]: isSelected,
                  [styles.disabled]: disabled,
                  [styles.invalid]: isInvalid,
                  [styles.pop]: isPopping,
                  [styles.falling]: isFalling,
                  // spawn is visualized via falling; no separate spawn class
                  [styles.bomb]: candy.special === 'bomb'
                })}
                style={dynamicStyle}
                onClick={() => onCandyClick(position)}
                disabled={disabled}
                aria-label={`Row ${rowIndex + 1} Column ${colIndex + 1}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
