'use client';

import styles from './MissionPanel.module.css';
import type { Mission } from '../lib/game/types';
import { MAX_RESHUFFLES_PER_RUN, MISSION_SCORE_MULTIPLIER } from '../lib/game/constants';

interface MissionPanelProps {
  missions: Mission[];
  stage: number;
  totalStages: number;
}

const colorLabels: Record<Mission['color'], string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple'
};

export function MissionPanel({ missions, stage, totalStages }: MissionPanelProps) {
  const hasMission = missions.length > 0;
  const displayStage = hasMission ? Math.min(stage + 1, totalStages) : totalStages;

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Missions</h2>
        <span className={styles.stageBadge}>
          Stage {displayStage} / {totalStages}
        </span>
      </div>

      {!hasMission ? (
        <div className={styles.completeBox}>
          <span className={styles.completeEmoji}>🏁</span>
          <p className={styles.completeText}>All mission tiers cleared! Cash in your victory.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {missions.map((mission) => {
            const percentage = Math.min(100, Math.round((mission.progress / mission.target) * 100));
            const completed = mission.progress >= mission.target;
            const rewardLabel = mission.reward ? `+${mission.reward.amount} moves` : '—';
            const scorePct = mission.scoreTarget
              ? Math.min(100, Math.round(((mission.scoreProgress ?? 0) / mission.scoreTarget) * 100))
              : undefined;
            const milestoneInfo = mission.scoreMilestone && mission.movesPerMilestone
              ? `+${mission.movesPerMilestone} moves per ${mission.scoreMilestone} pts`
              : undefined;
            const completionBonus = (mission.target ?? 0) * MISSION_SCORE_MULTIPLIER;

            return (
              <div key={mission.id} className={styles.missionRow}>
                <div className={styles.missionHeader}>
                  <div className={styles.missionTitleBlock}>
                    <span className={styles.missionPill}>{mission.title ?? 'Objective'}</span>
                    <span className={styles.missionName}>
                      Collect {mission.target} {colorLabels[mission.color]} Candies
                      <span className={styles.chip} data-color={mission.color} aria-hidden="true" />
                    </span>
                  </div>
                  <span className={styles.missionProgress}>
                    {mission.progress}/{mission.target}
                  </span>
                </div>
                {mission.summary && <p className={styles.summary}>{mission.summary}</p>}
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    data-color={mission.color}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                {mission.scoreTarget && (
                  <div className={styles.scoreBlock}>
                    <div className={styles.scoreHeader}>
                      <span className={styles.scoreTitle}>Score</span>
                      <span className={styles.scoreProgress}>
                        {(mission.scoreProgress ?? 0)}/{mission.scoreTarget}
                      </span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${scorePct}%` }} />
                    </div>
                    {mission.scoreMilestone && mission.movesPerMilestone && (
                      <div className={styles.milestoneNote}>
                        +{mission.movesPerMilestone} reshuffle per {mission.scoreMilestone} pts
                      </div>
                    )}
                  </div>
                )}
                <div className={styles.rewardRow}>
                  <span className={styles.rewardLabel}>Reward</span>
                  <span className={styles.rewardValue}>
                    🎁 {rewardLabel} {mission.rewardClaimed ? '(claimed)' : ''}
                  </span>
                </div>
                <div className={styles.details}>
                  <div className={styles.detailRow}>On completion: carry over remaining moves + next mission baseMoves; gain <b>{completionBonus}</b> bonus score.</div>
                  <div className={styles.detailRow}>Cascade matches also count toward objectives.</div>
                  {mission.scoreMilestone && mission.movesPerMilestone && (
                    <div className={styles.detailRow}>Every <b>{mission.scoreMilestone}</b> pts → +<b>{mission.movesPerMilestone}</b> reshuffle (max {MAX_RESHUFFLES_PER_RUN}).</div>
                  )}
                </div>
                {completed && <div className={styles.completed}>Mission complete! New tier unlocked.</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
