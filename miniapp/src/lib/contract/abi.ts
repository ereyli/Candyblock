export const SWEETCHAIN_ABI = [
  'event RunEntered(address indexed player, uint256 indexed runId, uint256 fee)',
  'event RunFinalized(address indexed player, uint256 indexed runId, uint256 score, uint256 reward)',
  'event RewardClaimed(address indexed player, uint256 indexed runId, uint256 score, uint256 reward)',
  'event PoolDrained(address indexed to, uint256 amount)',
  'function enterRun() payable returns (uint256)',
  'function finalizeRun(uint256 runId, uint256 score)',
  'function claimReward(uint256 runId)',
  'function currentEntryFee() view returns (uint256)',
  'function getCurrentConfig() view returns (uint256 entryFee, uint256 poolPct, uint256 projectPct, address verifier, address projectWallet)',
  'function getRewardTiers() view returns (uint256[] scores, uint256[] bps)',
  'function getStats() view returns (uint256 pool, uint256 distributed, uint256 entries, uint256 lastRunId)',
  'function getRun(uint256 runId) view returns (address player, uint8 status, uint256 score, uint256 reward)'
] as const;
