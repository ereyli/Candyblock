'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { Board } from '../components/Board';
import { EntryGate } from '../components/EntryGate';
import { GameHud } from '../components/GameHud';
import { MissionPanel } from '../components/MissionPanel';
import { useGameEngine } from '../hooks/useGameEngine';
import { GameOverOverlay } from '../components/GameOverOverlay';
import { useRewardSchedule } from '../hooks/useRewardSchedule';
import {
  calculatePayoutFromPool,
  formatBps,
  formatEther,
  selectRewardTier
} from '../lib/contract/rewards';
import {
  ENGINE_STORAGE_KEY,
  ENTRY_STORAGE_KEY,
  CURRENT_RUN_KEY,
  PENDING_RUNS_KEY
} from '../lib/storage/constants';
import { useSweetchainWallet, type EnterRunResult } from '../hooks/useSweetchainWallet';
import styles from './page.module.css';

const DEFAULT_ENTRY_FEE_WEI = 100_000_000_000_000n; // 0.0001 ETH

type ClaimStatus = 'idle' | 'loading' | 'success' | 'error';

interface RunRecord {
  account: string | null;
  runId: string | null;
  txHash?: string | null;
  startedAt: number;
  score?: number;
  status: 'active' | 'claimable' | 'claimed';
  claimTxHash?: string | null;
}

interface ClaimStateInfo {
  runKey: string | null;
  status: ClaimStatus;
  error: string | null;
  txHash: string | null;
}

interface LegacyActiveEntry {
  account?: string | null;
  runId?: string | null;
  txHash?: string | null;
  startedAt?: number;
  lastScore?: number;
  claimed?: boolean;
  claimTxHash?: string | null;
}

const getRunKey = (run: RunRecord): string => run.runId ?? run.txHash ?? `run-${run.startedAt}`;

const sanitizeRunRecord = (data: any): RunRecord | null => {
  if (!data || typeof data !== 'object') return null;
  const account = typeof data.account === 'string' ? data.account : null;
  const runId = data.runId != null ? String(data.runId) : null;
  const txHash = typeof data.txHash === 'string' ? data.txHash : null;
  const startedAt = typeof data.startedAt === 'number' && Number.isFinite(data.startedAt)
    ? data.startedAt
    : Date.now();
  const score = typeof data.score === 'number' ? data.score : undefined;
  let status: RunRecord['status'];
  const rawStatus = data.status;
  if (rawStatus === 'claimed') status = 'claimed';
  else if (rawStatus === 'active') status = 'active';
  else status = 'claimable';
  const claimTxHash = typeof data.claimTxHash === 'string' ? data.claimTxHash : undefined;
  return {
    account,
    runId,
    txHash,
    startedAt,
    score,
    status,
    claimTxHash
  };
};

const loadCurrentRun = (): RunRecord | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CURRENT_RUN_KEY);
    if (!raw) return null;
    return sanitizeRunRecord(JSON.parse(raw));
  } catch {
    return null;
  }
};

const persistCurrentRun = (run: RunRecord | null) => {
  if (typeof window === 'undefined') return;
  if (!run) {
    window.localStorage.removeItem(CURRENT_RUN_KEY);
    return;
  }
  window.localStorage.setItem(CURRENT_RUN_KEY, JSON.stringify(run));
};

const loadPendingRuns = (): RunRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PENDING_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeRunRecord)
      .filter((run): run is RunRecord => !!run)
      .sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
};

const persistPendingRuns = (runs: RunRecord[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_RUNS_KEY, JSON.stringify(runs));
};

const migrateLegacyEntry = (): RunRecord | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ENTRY_STORAGE_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(ENTRY_STORAGE_KEY);
    const legacy = JSON.parse(raw) as LegacyActiveEntry | null;
    if (!legacy) return null;
    return {
      account: legacy.account ?? null,
      runId: legacy.runId ?? null,
      txHash: legacy.txHash ?? null,
      startedAt: legacy.startedAt ?? Date.now(),
      score: legacy.lastScore,
      status: legacy.claimed ? 'claimed' : 'claimable',
      claimTxHash: legacy.claimTxHash ?? null
    };
  } catch {
    return null;
  }
};

export default function HomePage() {
  const wallet = useSweetchainWallet();
  const engine = useGameEngine();
  const { unlockGame, lockGame } = engine;
  const rewardSchedule = useRewardSchedule(engine.score);
  const refreshRewards = rewardSchedule.refresh;

  const [currentRun, setCurrentRun] = useState<RunRecord | null>(null);
  const [pendingRuns, setPendingRuns] = useState<RunRecord[]>([]);
  const [recentSettledRun, setRecentSettledRun] = useState<RunRecord | null>(null);
  const [claimState, setClaimState] = useState<ClaimStateInfo>({ runKey: null, status: 'idle', error: null, txHash: null });

  const entryGranted = currentRun != null;

  const updateCurrentRun = useCallback(
    (
      value: RunRecord | null | ((previous: RunRecord | null) => RunRecord | null)
    ) => {
      setCurrentRun((prev) => {
        const next = typeof value === 'function'
          ? (value as (previous: RunRecord | null) => RunRecord | null)(prev)
          : value;
        persistCurrentRun(next);
        return next;
      });
    },
    []
  );

  const updatePendingRuns = useCallback(
    (value: RunRecord[] | ((previous: RunRecord[]) => RunRecord[])) => {
      setPendingRuns((prev) => {
        const next = typeof value === 'function'
          ? (value as (previous: RunRecord[]) => RunRecord[])(prev)
          : value;
        persistPendingRuns(next);
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const storedPending = loadPendingRuns();
    if (storedPending.length > 0) {
      setPendingRuns(storedPending);
    }
    const migrated = migrateLegacyEntry();
    const storedCurrent = loadCurrentRun();
    if (storedCurrent) {
      updateCurrentRun(storedCurrent);
    } else if (migrated) {
      if (migrated.status === 'active') {
        updateCurrentRun(migrated);
      } else {
        updatePendingRuns((prev) => [...prev, migrated]);
      }
    }
  }, [updateCurrentRun, updatePendingRuns]);

  useEffect(() => {
    sdk.actions.ready().catch(() => {
      // avoid surface errors when outside Base app
    });
  }, []);

  useEffect(() => {
    if (entryGranted) {
      if (engine.status === 'locked') {
        unlockGame();
      }
    } else {
      lockGame();
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(ENGINE_STORAGE_KEY);
      }
    }
  }, [entryGranted, unlockGame, lockGame, engine.status]);

  useEffect(() => {
    if (!currentRun) return;
    if (engine.status !== 'lost' && engine.status !== 'won') return;

    const resolvedRunId = currentRun.runId ?? wallet.lastRunId?.toString() ?? currentRun.txHash ?? `run-${currentRun.startedAt}`;
    const settled: RunRecord = {
      ...currentRun,
      runId: resolvedRunId,
      score: engine.score,
      status: 'claimable'
    };

    updatePendingRuns((prev) => {
      const runKey = getRunKey(settled);
      const filtered = prev.filter((run) => getRunKey(run) !== runKey);
      return [...filtered, settled].sort((a, b) => b.startedAt - a.startedAt);
    });

    setRecentSettledRun(settled);
    updateCurrentRun(null);
  }, [engine.status, engine.score, currentRun, wallet.lastRunId, updatePendingRuns, updateCurrentRun]);

  useEffect(() => {
    if (!recentSettledRun) return;
    const match = pendingRuns.find((run) => getRunKey(run) === getRunKey(recentSettledRun));
    if (match) {
      setRecentSettledRun(match);
    }
  }, [pendingRuns, recentSettledRun]);

  const entryFeeWei = rewardSchedule.snapshot?.config.entryFeeWei ?? DEFAULT_ENTRY_FEE_WEI;

  const entryFeeLabel = useMemo(() => {
    if (rewardSchedule.snapshot) {
      return formatEther(entryFeeWei, 6);
    }
    return formatEther(DEFAULT_ENTRY_FEE_WEI, 6);
  }, [rewardSchedule.snapshot, entryFeeWei]);

  const computeRewardInfo = useCallback(
    (run: RunRecord | null) => {
      if (!run || !rewardSchedule.snapshot) {
        return { label: '0 ETH', eligible: false };
      }
      const tier = selectRewardTier(run.score ?? 0, rewardSchedule.snapshot.tiers);
      if (!tier) return { label: '0 ETH', eligible: false };
      const wei = calculatePayoutFromPool(rewardSchedule.snapshot.totalPoolWei, tier);
      return { label: `${formatEther(wei, 6)} ETH`, eligible: wei > 0n };
    },
    [rewardSchedule.snapshot]
  );

  const rewardTierDisplay = useMemo(() => {
    if (!rewardSchedule.snapshot) return undefined;
    return rewardSchedule.snapshot.tiers.map((tier) => ({
      minScore: Number(tier.minScore),
      shareLabel: formatBps(tier.shareBps)
    }));
  }, [rewardSchedule.snapshot]);

  const poolShareLabel = useMemo(() => {
    const poolBps = rewardSchedule.snapshot?.config.poolBps ?? 7000;
    return formatBps(poolBps);
  }, [rewardSchedule.snapshot?.config.poolBps]);

  const projectShareLabel = useMemo(() => {
    const projectBps = rewardSchedule.snapshot?.config.projectBps ?? 3000;
    return formatBps(projectBps);
  }, [rewardSchedule.snapshot?.config.projectBps]);

  const poolBalanceLabel = useMemo(() => {
    if (!rewardSchedule.snapshot) return null;
    return `${formatEther(rewardSchedule.snapshot.totalPoolWei, 6)} ETH`;
  }, [rewardSchedule.snapshot]);

  const totalDistributedLabel = useMemo(() => {
    if (!rewardSchedule.snapshot) return null;
    return `${formatEther(rewardSchedule.snapshot.totalDistributedWei, 6)} ETH`;
  }, [rewardSchedule.snapshot]);

  const totalEntries = rewardSchedule.snapshot ? Number(rewardSchedule.snapshot.totalEntries) : null;

  const actionableRuns = useMemo(
    () =>
      pendingRuns
        .filter((run) => run.status !== 'claimed' && computeRewardInfo(run).eligible)
        .sort((a, b) => b.startedAt - a.startedAt),
    [pendingRuns, computeRewardInfo]
  );

  const handlePaymentSuccess = useCallback(
    async (result?: EnterRunResult | null) => {
      const startedAt = Date.now();
      updateCurrentRun(() => ({
        account: result?.account ?? wallet.account ?? null,
        runId:
          result?.runId != null
            ? result.runId.toString()
            : wallet.lastRunId
              ? wallet.lastRunId.toString()
              : null,
        txHash: result?.txHash ?? wallet.lastTxHash ?? null,
        startedAt,
        status: 'active'
      }));
      setRecentSettledRun(null);
      setClaimState({ runKey: null, status: 'idle', error: null, txHash: null });
      await refreshRewards();
    },
    [updateCurrentRun, wallet.account, wallet.lastRunId, wallet.lastTxHash, refreshRewards]
  );

  const handleRestartPaid = useCallback(async () => {
    try {
      if (!wallet.hasProvider) {
        throw new Error('Wallet provider not detected. Install a Base-compatible wallet.');
      }
      if (!wallet.isConnected) {
        await wallet.connectWallet();
      }
      if (!wallet.isCorrectChain) {
        await wallet.switchToBase();
      }
      const fee = rewardSchedule.snapshot?.config.entryFeeWei ?? DEFAULT_ENTRY_FEE_WEI;
      const result = await wallet.enterRun(fee);
      await handlePaymentSuccess(result);
      // ensure fresh board for the new paid run
      engine.resetState();
    } catch (err) {
      // surface error via wallet.error mechanism (already handled in UI)
    }
  }, [wallet, rewardSchedule.snapshot?.config.entryFeeWei, handlePaymentSuccess, engine]);

  const handleClaimReward = useCallback(
    async (run: RunRecord) => {
      if (!run.runId) {
        throw new Error('Run kimliği bulunamadı.');
      }
      if ((run.score ?? engine.score) == null) {
        throw new Error('Skor verisi bulunamadı.');
      }
      const runKey = getRunKey(run);
      try {
        setClaimState({ runKey, status: 'loading', error: null, txHash: null });
        if (!wallet.hasProvider) {
          throw new Error('Cüzdan sağlayıcısı bulunamadı. Base uyumlu bir cüzdan yükleyin.');
        }
        if (!wallet.isConnected) {
          await wallet.connectWallet();
        }
        if (!wallet.isCorrectChain) {
          await wallet.switchToBase();
        }

        const txHash = await wallet.claimReward({ runId: run.runId });

        setClaimState({ runKey, status: 'success', error: null, txHash });
        updatePendingRuns((prev) => prev.filter((item) => getRunKey(item) !== runKey));
        setRecentSettledRun((prev) => (prev && getRunKey(prev) === runKey ? null : prev));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ödül talebi başarısız oldu.';
        setClaimState({ runKey, status: 'error', error: message, txHash: null });
      } finally {
        void refreshRewards();
      }
    },
    [wallet, updatePendingRuns, engine.score, refreshRewards]
  );

  const handleNewRun = useCallback(() => {
    updateCurrentRun(null);
    setRecentSettledRun(null);
    setClaimState({ runKey: null, status: 'idle', error: null, txHash: null });
    lockGame();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ENGINE_STORAGE_KEY);
    }
  }, [updateCurrentRun, lockGame]);

  const overlayRun = recentSettledRun;
  const overlayRewardInfo = computeRewardInfo(overlayRun);
  const overlayRunKey = overlayRun ? getRunKey(overlayRun) : null;
  const overlayActionState = overlayRunKey && claimState.runKey === overlayRunKey
    ? claimState
    : {
        runKey: overlayRunKey,
        status: overlayRun?.status === 'claimed' ? 'success' : 'idle',
        error: null,
        txHash: overlayRun?.claimTxHash ?? overlayRun?.txHash ?? null
      };

  const overlayClaimStatus = overlayActionState.status;
  const overlayClaimError = overlayActionState.error;
  const overlayClaimTx = overlayActionState.txHash ?? overlayRun?.claimTxHash ?? null;
  const overlayIsClaimed = overlayRun?.status === 'claimed';
  const overlayCanClaim = overlayRun?.status === 'claimable' && overlayRewardInfo.eligible;
  const overlayRunId = overlayRun?.runId ?? wallet.lastRunId?.toString() ?? null;
  const overlayScore = overlayRun?.score ?? engine.score;

  const nextTierScore = rewardSchedule.nextTier ? Number(rewardSchedule.nextTier.minScore) : null;
  const nextTierDelta = rewardSchedule.nextTier
    ? Number(rewardSchedule.nextTier.minScore - BigInt(engine.score))
    : null;
  const nextTierShareLabel = rewardSchedule.nextTier ? formatBps(rewardSchedule.nextTier.shareBps) : null;

  if (!entryGranted) {
    return (
      <main className={styles.mainCentered}>
        <div className={styles.entryStack}>
          <EntryGate
            entryFeeLabel={entryFeeLabel}
            entryFeeWei={entryFeeWei}
            onPaymentSuccess={handlePaymentSuccess}
            rewardTiers={rewardTierDisplay}
            poolShareLabel={poolShareLabel}
            loading={rewardSchedule.loading}
            projectShareLabel={projectShareLabel}
            poolBalanceLabel={poolBalanceLabel}
            totalDistributedLabel={totalDistributedLabel}
            totalEntries={totalEntries}
            wallet={wallet}
          />

          {actionableRuns.length > 0 && (
            <section className={styles.pendingSection}>
              <div className={styles.pendingHeader}>Bekleyen İşlemler</div>
              <div className={styles.pendingGrid}>
                {actionableRuns.map((run) => {
                  const runKey = getRunKey(run);
                  const rewardInfo = computeRewardInfo(run);
                  const state = claimState.runKey === runKey
                    ? claimState
                    : { runKey, status: 'idle', error: null, txHash: run.claimTxHash ?? run.txHash ?? null };
                  const claimable = run.status === 'claimable' && rewardInfo.eligible;
                  const claimed = run.status === 'claimed';
                  const claimLoading = state.runKey === runKey && state.status === 'loading';
                  const claimSuccess = claimed || (state.runKey === runKey && state.status === 'success');
                  const claimDisabled = claimLoading;

                  return (
                    <div key={runKey} className={styles.pendingCard}>
                      <div className={styles.pendingMeta}>
                        <span className={styles.pendingLabel}>Run ID</span>
                        <span className={styles.pendingValue}>{run.runId ?? 'Bilgi yok'}</span>
                      </div>
                      <div className={styles.pendingMeta}>
                        <span className={styles.pendingLabel}>Puan</span>
                        <span className={styles.pendingValue}>{run.score ?? '—'}</span>
                      </div>
                      <div className={styles.pendingMeta}>
                        <span className={styles.pendingLabel}>Tahmini ödül</span>
                        <span className={styles.pendingValue}>{rewardInfo.label}</span>
                      </div>
                      {state.error && state.runKey === runKey && (
                        <div className={styles.pendingError}>{state.error}</div>
                      )}
                      {claimSuccess && (run.claimTxHash || state.txHash) && (
                        <div className={styles.pendingSuccess}>
                          Talep edildi.{' '}
                          <a
                            href={`https://basescan.org/tx/${run.claimTxHash ?? state.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.pendingLink}
                          >
                            BaseScan&#39;de görüntüle
                          </a>
                        </div>
                      )}
                      {claimSuccess && !(run.claimTxHash || state.txHash) && (
                        <div className={styles.pendingSuccess}>Talep edildi.</div>
                      )}
                      {claimable && !claimed && (
                        <button
                          type="button"
                          className={styles.pendingButton}
                          onClick={() => handleClaimReward(run)}
                          disabled={claimDisabled}
                        >
                          {claimLoading ? 'Talep ediliyor…' : 'Ödülü Talep Et'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      {engine.status === 'lost' && overlayRun && (
        <GameOverOverlay
          score={overlayScore}
          onRequestNewRun={handleNewRun}
          canClaim={overlayCanClaim}
          rewardLabel={overlayRewardInfo.label}
          rewardEligible={overlayRewardInfo.eligible}
          runId={overlayRunId}
          claimStatus={overlayClaimStatus}
          claimError={overlayClaimError}
          claimTxHash={overlayClaimTx}
          isClaimed={overlayIsClaimed}
          onClaim={overlayCanClaim ? () => handleClaimReward(overlayRun) : undefined}
        />
      )}
      <div className={styles.sidebar}>
        <MissionPanel
          missions={engine.missions}
          stage={engine.missionIndex}
          totalStages={engine.totalMissionCount}
        />
        <GameHud
          score={engine.score}
          movesLeft={engine.movesLeft}
          status={engine.status}
          // Restart triggers payment flow and restarts the game on success
          onReset={handleRestartPaid}
          onShare={async () => {
            try {
              const url = typeof window !== 'undefined' ? window.location.href : 'https://example.com';
              const stageText = `Stage ${engine.missionIndex + 1}/${engine.totalMissionCount}`;
              const objective = engine.missions?.[0]
                ? `Objective: collect ${engine.missions[0].target} ${engine.missions[0].color} candies.`
                : 'Join the run!';
              const text = `I scored ${engine.score} in SweetChain Missions (${stageText}). ${objective}`;
              const anySdk: any = sdk as any;
              if (anySdk?.actions?.openComposer) {
                await anySdk.actions.openComposer({ text, embeds: [url] });
                return;
              }
              const compose = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
              window.open(compose, '_blank', 'noopener,noreferrer');
            } catch {
              // ignore
            }
          }}
          movesToast={engine.movesToast}
          reshuffles={engine.reshuffles}
          onReshuffle={engine.useReshuffle}
          movesBase={engine.gameSummary.currentBaseMoves}
          rewardLoading={rewardSchedule.loading}
          rewardShareLabel={rewardSchedule.currentTierShareLabel}
          projectedPayoutLabel={rewardSchedule.projectedPayoutLabel}
          poolBalanceLabel={poolBalanceLabel}
          nextTierScore={nextTierScore}
          nextTierDelta={nextTierDelta}
          nextTierShareLabel={nextTierShareLabel}
          rewardError={rewardSchedule.error}
        />
      </div>
      <div className={styles.boardArea}>
        <Board
          board={engine.board}
          selected={engine.selected}
          status={engine.status}
          lastInvalidSwap={engine.lastInvalidSwap}
          poppingCells={engine.poppingCells}
          fallingInfo={engine.fallingInfo}
          spawnedInfo={engine.spawnedInfo}
          onCandyClick={engine.handleCandyClick}
        />
      </div>
    </main>
  );
}
