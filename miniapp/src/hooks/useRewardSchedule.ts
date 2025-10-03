'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RewardSnapshot,
  RewardTier,
  calculatePayoutFromPool,
  fetchRewardSnapshot,
  findNextTier,
  formatBps,
  formatEther,
  selectRewardTier
} from '../lib/contract/rewards';

interface RewardScheduleState {
  snapshot: RewardSnapshot | null;
  loading: boolean;
  error: string | null;
  currentTier: RewardTier | null;
  nextTier: RewardTier | null;
  projectedPayoutWei: bigint;
  projectedPayoutLabel: string;
  currentTierShareLabel: string;
  refresh: () => Promise<void>;
}

export const useRewardSchedule = (score?: number | bigint): RewardScheduleState => {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRewardSnapshot();
      if (!mountedRef.current) return;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Unable to load reward schedule';
      setError(message);
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const { currentTier, nextTier, projectedPayoutWei } = useMemo(() => {
    if (!snapshot || score == null) {
      return { currentTier: null, nextTier: null, projectedPayoutWei: 0n };
    }
    const matchedTier = selectRewardTier(score, snapshot.tiers);
    const upcomingTier = findNextTier(score, snapshot.tiers);
    const rewardWei = calculatePayoutFromPool(snapshot.totalPoolWei, matchedTier);
    return { currentTier: matchedTier, nextTier: upcomingTier, projectedPayoutWei: rewardWei };
  }, [snapshot, score]);

  const currentTierShareLabel = useMemo(() => {
    if (!currentTier) return '0%';
    return formatBps(currentTier.shareBps);
  }, [currentTier]);

  const projectedPayoutLabel = useMemo(() => {
    if (!snapshot || !currentTier) return '0';
    const label = formatEther(projectedPayoutWei, 6);
    return `${label} ETH`;
  }, [snapshot, currentTier, projectedPayoutWei]);

  return {
    snapshot,
    loading,
    error,
    currentTier,
    nextTier,
    projectedPayoutWei,
    projectedPayoutLabel,
    currentTierShareLabel,
    refresh: loadSnapshot
  };
};
