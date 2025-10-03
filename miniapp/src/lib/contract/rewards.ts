import { Interface } from 'ethers';
import { BASE_MAINNET_RPC_URL, SWEETCHAIN_CONTRACT_ADDRESS } from './constants';

export interface RewardTier {
  minScore: bigint;
  shareBps: bigint;
}

export interface ContractConfig {
  entryFeeWei: bigint;
  poolBps: number;
  projectBps: number;
  projectWallet: string;
  verifier: string;
}

export interface RewardSnapshot {
  config: ContractConfig;
  tiers: RewardTier[];
  totalPoolWei: bigint;
  totalDistributedWei: bigint;
  totalEntries: bigint;
  lastRunId: bigint;
}

const FALLBACK_TIERS: RewardTier[] = [
  { minScore: 10_000n, shareBps: 40n },
  { minScore: 20_000n, shareBps: 80n },
  { minScore: 40_000n, shareBps: 150n },
  { minScore: 80_000n, shareBps: 400n }
];

const contractInterface = new Interface([
  'function getCurrentConfig() view returns (uint256 entryFee, uint256 poolPct, uint256 projectPct, address verifier, address projectWallet)',
  'function getRewardTiers() view returns (uint256[] scores, uint256[] bps)',
  'function getStats() view returns (uint256 pool, uint256 distributed, uint256 entries, uint256 lastRunId)'
]);

let rpcCounter = 1;

async function jsonRpcRequest(method: string, params: unknown[]): Promise<any> {
  const body = {
    jsonrpc: '2.0',
    id: rpcCounter += 1,
    method,
    params
  };

  const response = await fetch(BASE_MAINNET_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(payload.error.message || `RPC ${method} returned an error`);
  }
  return payload?.result;
}

async function callContract(fragment: string, args: unknown[] = []): Promise<any | null> {
  try {
    const data = contractInterface.encodeFunctionData(fragment, args);
    const raw = await jsonRpcRequest('eth_call', [
      {
        to: SWEETCHAIN_CONTRACT_ADDRESS,
        data
      },
      'latest'
    ]);
    if (!raw || raw === '0x') return null;
    const decoded = contractInterface.decodeFunctionResult(fragment, raw);
    return decoded;
  } catch {
    return null;
  }
}

const toBigInt = (value: unknown, fallback = 0n): bigint => {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return fallback;
    }
  }
  if (value && typeof value === 'object' && 'toBigInt' in value && typeof (value as any).toBigInt === 'function') {
    try {
      return (value as any).toBigInt();
    } catch {
      return fallback;
    }
  }
  if (Array.isArray(value) && value.length > 0) {
    return toBigInt(value[0], fallback);
  }
  return fallback;
};

export const fetchRewardSnapshot = async (): Promise<RewardSnapshot> => {
  const [configResult, tiersResult, statsResult] = await Promise.allSettled([
    callContract('getCurrentConfig'),
    callContract('getRewardTiers'),
    callContract('getStats')
  ]);

  const configValues = configResult.status === 'fulfilled' && configResult.value
    ? configResult.value
    : null;
  const tiersValues = tiersResult.status === 'fulfilled' && tiersResult.value
    ? tiersResult.value
    : null;
  const statsValues = statsResult.status === 'fulfilled' && statsResult.value
    ? statsResult.value
    : null;

  const entryFeeWei = toBigInt(configValues?.[0], 100_000_000_000_000n);
  const poolPct = Number(toBigInt(configValues?.[1], 7000n));
  const projectPct = Number(toBigInt(configValues?.[2], 3000n));
  const verifier = typeof configValues?.[3] === 'string' ? configValues[3] : '0x0000000000000000000000000000000000000000';
  const projectWallet = typeof configValues?.[4] === 'string' ? configValues[4] : '0x0000000000000000000000000000000000000000';

  const config: ContractConfig = {
    entryFeeWei,
    poolBps: poolPct,
    projectBps: projectPct,
    projectWallet,
    verifier
  };

  let tiers: RewardTier[] = FALLBACK_TIERS;
  if (tiersValues && Array.isArray(tiersValues) && tiersValues.length >= 2) {
    const scores = Array.isArray(tiersValues[0]) ? tiersValues[0] : [];
    const bps = Array.isArray(tiersValues[1]) ? tiersValues[1] : [];
    const count = Math.min(scores.length, bps.length);
    if (count > 0) {
      tiers = [];
      for (let i = 0; i < count; i += 1) {
        tiers.push({
          minScore: toBigInt(scores[i]),
          shareBps: toBigInt(bps[i])
        });
      }
    }
  }

  const totalPoolWei = toBigInt(statsValues?.[0]);
  const totalDistributedWei = toBigInt(statsValues?.[1]);
  const totalEntries = toBigInt(statsValues?.[2]);
  const lastRunId = toBigInt(statsValues?.[3]);

  return {
    config,
    tiers,
    totalPoolWei,
    totalDistributedWei,
    totalEntries,
    lastRunId
  };
};

export const selectRewardTier = (score: number | bigint, tiers: RewardTier[]): RewardTier | null => {
  if (!tiers.length) return null;
  const target = typeof score === 'bigint' ? score : BigInt(score);
  let matched: RewardTier | null = null;
  for (const tier of tiers) {
    if (target >= tier.minScore) {
      if (!matched || tier.minScore >= matched.minScore) {
        matched = tier;
      }
    }
  }
  return matched;
};

export const findNextTier = (score: number | bigint, tiers: RewardTier[]): RewardTier | null => {
  if (!tiers.length) return null;
  const target = typeof score === 'bigint' ? score : BigInt(score);
  let candidate: RewardTier | null = null;
  for (const tier of tiers) {
    if (target < tier.minScore) {
      if (!candidate || tier.minScore < candidate.minScore) {
        candidate = tier;
      }
    }
  }
  return candidate;
};

export const calculatePayoutFromPool = (poolWei: bigint, tier: RewardTier | null): bigint => {
  if (!tier) return 0n;
  return (poolWei * tier.shareBps) / 10_000n;
};

export const formatEther = (value: bigint, precision = 4): string => {
  const negative = value < 0n;
  const absValue = negative ? -value : value;
  const whole = absValue / 10n ** 18n;
  const remainder = absValue % 10n ** 18n;
  const remainderStr = remainder.toString().padStart(18, '0').slice(0, precision);
  const trimmed = remainderStr.replace(/0+$/, '');
  const fraction = trimmed.length ? `.${trimmed}` : '';
  return `${negative ? '-' : ''}${whole.toString()}${fraction}`;
};

export const formatBps = (bps: bigint | number, precision = 2): string => {
  const value = typeof bps === 'bigint' ? bps : BigInt(bps);
  const integer = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');
  const fracSlice = fraction.slice(0, precision);
  const trimmed = fracSlice.replace(/0+$/, '');
  return `${integer.toString()}${trimmed ? `.${trimmed}` : ''}%`;
};
