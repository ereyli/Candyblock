'use client';

import styles from './GameOverOverlay.module.css';

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  score: number;
  onRequestNewRun: () => void;
  canClaim?: boolean;
  rewardLabel?: string | null;
  rewardEligible?: boolean;
  runId?: string | null;
  claimStatus?: ActionStatus;
  claimError?: string | null;
  claimTxHash?: string | null;
  isClaimed?: boolean;
  onClaim?: () => Promise<void>;
}

export function GameOverOverlay({
  score,
  onRequestNewRun,
  canClaim,
  rewardLabel,
  rewardEligible,
  runId,
  claimStatus = 'idle',
  claimError,
  claimTxHash,
  isClaimed,
  onClaim
}: Props) {
  const handleClaim = async () => {
    if (!onClaim) return;
    await onClaim();
  };

  const disableClaimButton =
    !onClaim || claimStatus === 'loading' || !!isClaimed;
  const claimLink = claimTxHash ? `https://basescan.org/tx/${claimTxHash}` : null;
  const showClaimCard = canClaim || isClaimed;
  const rewardIsZero = !isClaimed && rewardEligible === false;
  const showClaimSuccess = (isClaimed || claimStatus === 'success') && !!claimLink;
  const showClaimedWithoutLink = isClaimed && !claimLink;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="gover-title">
      <div className={styles.card}>
        <h2 id="gover-title" className={styles.title}>Game Over</h2>
        <p className={styles.desc}>Hamlelerin bitti. Yeni run için tekrar giriş yapabilirsin.</p>
        <div className={styles.scoreBox}>
          <span className={styles.scoreLabel}>Score</span>
          <span className={styles.scoreValue}>{score}</span>
        </div>

        {showClaimCard && (
          <div className={styles.claimCard}>
            <div className={styles.claimTitle}>{isClaimed ? 'Ödül talep edildi' : 'Ödülünü topla'}</div>
            <div className={styles.claimRow}>
              <span className={styles.claimLabel}>Tahmini ödül</span>
              <span className={styles.claimValue}>{rewardLabel ?? '0 ETH'}</span>
            </div>
            {runId && (
              <div className={styles.claimRow}>
                <span className={styles.claimLabel}>Run ID</span>
                <span className={styles.claimValue}>{runId}</span>
              </div>
            )}
            {rewardIsZero && (
              <div className={styles.claimHint}>Puan ödül eşiğinin altında olabilir; talep denemesi başarısız olabilir.</div>
            )}
            {claimError && <div className={styles.claimError}>{claimError}</div>}
            {showClaimSuccess && claimLink && (
              <div className={styles.claimSuccess}>
                Ödül talebin onaylandı.{' '}
                <a href={claimLink} target="_blank" rel="noreferrer" className={styles.claimLink}>
                  BaseScan&#39;de görüntüle
                </a>
              </div>
            )}
            {showClaimedWithoutLink && (
              <div className={styles.claimSuccess}>Ödül talebin onaylandı.</div>
            )}

            {!isClaimed && canClaim && (
              <button
                type="button"
                className={styles.claimBtn}
                onClick={handleClaim}
                disabled={disableClaimButton}
              >
                {claimStatus === 'loading' ? 'Onay bekleniyor…' : 'Ödülü Talep Et'}
              </button>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={onRequestNewRun}>
            Yeni Run İçin Giriş Yap
          </button>
        </div>
        <div className={styles.tips}>İpucu: zincir misyonlarını tamamladıkça ödül yüzdesi artar.</div>
      </div>
    </div>
  );
}
