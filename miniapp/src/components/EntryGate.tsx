'use client';

import { useEffect, useState } from 'react';
import styles from './EntryGate.module.css';
import type { EnterRunResult, SweetchainWalletState } from '../hooks/useSweetchainWallet';

interface RewardTierDisplay {
  minScore: number;
  shareLabel: string;
}

interface EntryGateProps {
  entryFeeLabel: string;
  entryFeeWei: bigint;
  onPaymentSuccess: (result?: EnterRunResult | null) => Promise<void> | void;
  rewardTiers?: RewardTierDisplay[];
  poolShareLabel?: string;
  loading?: boolean;
  projectShareLabel?: string;
  poolBalanceLabel?: string | null;
  totalDistributedLabel?: string | null;
  totalEntries?: number | null;
  wallet: SweetchainWalletState;
}

export function EntryGate({
  entryFeeLabel,
  entryFeeWei,
  onPaymentSuccess,
  rewardTiers,
  poolShareLabel,
  loading,
  projectShareLabel,
  poolBalanceLabel,
  totalDistributedLabel,
  totalEntries,
  wallet
}: EntryGateProps) {
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setError(wallet.error ?? null);
  }, [wallet.error]);

  const handlePayment = async () => {
    try {
      setError(null);
      wallet.clearError();
      if (!wallet.hasProvider) {
        throw new Error('Wallet provider not detected. Install a Base-compatible wallet.');
      }
      if (!wallet.isConnected) {
        await wallet.connectWallet();
        return;
      }
      if (!wallet.isCorrectChain) {
        await wallet.switchToBase();
        return;
      }
      const result = await wallet.enterRun(entryFeeWei);
      await onPaymentSuccess(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      setError(message);
    }
  };

  const shortAccount = wallet.account
    ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(wallet.account.length - 4)}`
    : null;

  const actionLabel = wallet.status === 'connecting'
    ? 'Connecting…'
    : wallet.status === 'txPending'
      ? 'Confirming…'
      : !wallet.hasProvider
        ? 'Install Wallet'
        : !wallet.isConnected
          ? 'Connect Wallet'
          : !wallet.isCorrectChain
            ? 'Switch to Base'
            : 'Start Run';

  const actionDisabled =
    !wallet.hasProvider ||
    wallet.status === 'connecting' ||
    wallet.status === 'txPending';

  return (
    <div className={styles.stage}>
      <div className={styles.orbit} aria-hidden>
        <div className={styles.spark} />
        <div className={styles.gem} data-color="pink" />
        <div className={styles.gem} data-color="blue" />
        <div className={styles.gem} data-color="green" />
      </div>
      <div className={styles.container} data-mounted={mounted}>
        <div className={styles.hero}>SweetChain</div>
        <h1 className={styles.title}>Ready to start your run?</h1>
        <p className={styles.subtitle}>
          Clear missions, trigger cascades, earn reshuffles. Dive into a fast, social puzzle on Base.
        </p>
        {shortAccount && (
          <div className={styles.walletStatus}>
            Connected: <span>{shortAccount}</span>
            {!wallet.isCorrectChain && <span className={styles.walletWarning}>Switch to Base</span>}
          </div>
        )}
        <button type="button" className={styles.payBtn} onClick={handlePayment} disabled={actionDisabled}>
          <span className={styles.btnGlow} aria-hidden />
          <span className={styles.btnText}>{actionLabel}</span>
          <span className={styles.feeBadge}>{entryFeeLabel} ETH</span>
        </button>
        <div className={styles.tipsRow}>
          <div className={styles.tip}>• L/T/Snake matches count</div>
          <div className={styles.tip}>• Limited reshuffles each run</div>
          <div className={styles.tip}>• Bombs blast 3×3</div>
        </div>
        {loading && <div className={styles.loading}>Syncing Base mainnet reward config…</div>}
        {!loading && rewardTiers && rewardTiers.length > 0 && (
          <div className={styles.tiersCard}>
            <div className={styles.tiersTitle}>Reward tiers (pool share)</div>
            <ul className={styles.tiersList}>
              {rewardTiers.map((tier) => (
                <li key={tier.minScore} className={styles.tierItem}>
                  <span className={styles.tierShare}>{tier.shareLabel}</span>
                  <span className={styles.tierScore}>≥ {tier.minScore.toLocaleString()} pts</span>
                </li>
              ))}
            </ul>
            {poolShareLabel && (
              <div className={styles.tiersFooter}>
                {`Prize pool captures ${poolShareLabel} of every entry${projectShareLabel ? ` · Project wallet receives ${projectShareLabel}` : ''}.`}
              </div>
            )}
          </div>
        )}
        {!loading && (poolBalanceLabel || totalDistributedLabel || totalEntries != null) && (
          <div className={styles.statsCard}>
            <div className={styles.statsTitle}>On-chain stats</div>
            {poolBalanceLabel && (
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>Active pool</span>
                <span className={styles.statsValue}>{poolBalanceLabel}</span>
              </div>
            )}
            {totalDistributedLabel && (
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>Distributed</span>
                <span className={styles.statsValue}>{totalDistributedLabel}</span>
              </div>
            )}
            {totalEntries != null && (
              <div className={styles.statsRow}>
                <span className={styles.statsLabel}>Runs entered</span>
                <span className={styles.statsValue}>{totalEntries.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
        <p className={styles.disclaimer}>
          * Transactions execute directly on Base mainnet. Gas and entry fee required to start a run.
        </p>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
