'use client';

import styles from './GameHud.module.css';
import type { GameStatus } from '../lib/game/types';

interface GameHudProps {
  score: number;
  movesLeft: number;
  status: GameStatus;
  onReset: () => void;
  onShare?: () => void;
  movesToast?: number;
  reshuffles?: number;
  onReshuffle?: () => void;
  movesBase?: number;
  rewardLoading?: boolean;
  rewardShareLabel?: string;
  projectedPayoutLabel?: string;
  poolBalanceLabel?: string | null;
  nextTierScore?: number | null;
  nextTierDelta?: number | null;
  nextTierShareLabel?: string | null;
  rewardError?: string | null;
}

const statusLabel = (status: GameStatus) => {
  switch (status) {
    case 'won':
      return '🎉 Missions complete!';
    case 'lost':
      return '😢 Out of moves';
    case 'locked':
      return '🔒 Waiting for entry fee';
    case 'resolving':
      return '✨ Resolving combos';
    default:
      return '🎯 Complete the missions';
  }
};

export function GameHud({
  score,
  movesLeft,
  status,
  onReset,
  onShare,
  movesToast,
  reshuffles,
  onReshuffle,
  movesBase,
  rewardLoading,
  rewardShareLabel,
  projectedPayoutLabel,
  poolBalanceLabel,
  nextTierScore,
  nextTierDelta,
  nextTierShareLabel,
  rewardError
}: GameHudProps) {

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Score</span>
          <span className={styles.metricValue}>{score}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Moves</span>
          <span className={styles.movesWrap}>
            <span className={styles.metricValue}>{movesLeft}</span>
            {movesToast && movesToast > 0 && (
              <span className={styles.movesToastFloat}>+{movesToast}</span>
            )}
          </span>
          <div className={styles.movesBar} aria-hidden>
            <div className={styles.movesBarFill} style={{ width: `${Math.max(0, Math.min(100, Math.round(((movesLeft || 0) / Math.max(1, movesBase || 25)) * 100)))}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.status}>{statusLabel(status)}</div>

      <div className={styles.rewardCard}>
        <div className={styles.rewardTitle}>Reward tier</div>
        {rewardLoading ? (
          <div className={styles.rewardLoading}>Syncing on-chain pool data…</div>
        ) : (
          <>
            <div className={styles.rewardRow}>
              <span className={styles.rewardLabel}>Pool Share</span>
              <span className={styles.rewardValue}>{rewardShareLabel ?? '0%'}</span>
            </div>
            <div className={styles.rewardRow}>
              <span className={styles.rewardLabel}>Est. Claim</span>
              <span className={styles.rewardValue}>{projectedPayoutLabel ?? '0 ETH'}</span>
            </div>
            {poolBalanceLabel && (
              <div className={styles.rewardHint}>Pool size: {poolBalanceLabel}</div>
            )}
            {nextTierShareLabel &&
              nextTierScore != null &&
              nextTierDelta != null &&
              nextTierDelta > 0 && (
                <div className={styles.rewardHint}>
                  +{nextTierDelta.toLocaleString()} pts → {nextTierShareLabel} at {nextTierScore.toLocaleString()} pts
                </div>
              )}
            {rewardError && <div className={styles.rewardError}>{rewardError}</div>}
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={onReset}>
          Restart Run
        </button>
        {onShare && (
          <button type="button" className={styles.secondaryBtn} onClick={onShare} aria-label="Share on Farcaster">
            Share
          </button>
        )}
        {onReshuffle && (
          <button type="button" className={styles.secondaryBtn} onClick={onReshuffle} disabled={!reshuffles || reshuffles <= 0}>
            Reshuffle {reshuffles ? `(${reshuffles})` : ''}
          </button>
        )}
      </div>
    </div>
  );
}
