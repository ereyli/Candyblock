'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserProvider, Contract, ethers } from 'ethers';
import { SWEETCHAIN_CONTRACT_ADDRESS } from '../lib/contract/constants';
import { SWEETCHAIN_ABI } from '../lib/contract/abi';

const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_HEX = '0x2105';

const BASE_NETWORK_PARAMS = {
  chainId: BASE_CHAIN_HEX,
  chainName: 'Base Mainnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org']
};

interface EIP1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
}

type WalletStatus = 'idle' | 'connecting' | 'ready' | 'txPending' | 'error';

export interface EnterRunResult {
  txHash: string;
  runId: bigint | null;
  account: string | null;
}

export interface ClaimRewardParams {
  runId: bigint | number | string;
}

const getEthereumProvider = (): EIP1193Provider | null => {
  if (typeof window === 'undefined') return null;
  return (window as any).ethereum ?? null;
};

const toChecksumAddress = (value: string) => {
  try {
    return ethers.getAddress(value);
  } catch {
    return value;
  }
};

export interface SweetchainWalletState {
  account: string | null;
  chainId: number | null;
  isConnected: boolean;
  isCorrectChain: boolean;
  hasProvider: boolean;
  status: WalletStatus;
  error: string | null;
  lastTxHash: string | null;
  lastRunId: bigint | null;
  connectWallet: () => Promise<void>;
  switchToBase: () => Promise<void>;
  enterRun: (entryFeeWei: bigint) => Promise<EnterRunResult>;
  claimReward: (params: ClaimRewardParams) => Promise<string>;
  clearError: () => void;
}

export const useSweetchainWallet = (): SweetchainWalletState => {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [status, setStatus] = useState<WalletStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastRunId, setLastRunId] = useState<bigint | null>(null);
  const [hasProvider, setHasProvider] = useState<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    setHasProvider(!!getEthereumProvider());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateChainId = useCallback((value: number | null) => {
    setChainId(value);
  }, []);

  const refreshAccounts = useCallback(async () => {
    const eth = getEthereumProvider();
    if (!eth) return;
    try {
      const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
      if (!mountedRef.current) return;
      setAccount(accounts?.[0] ? toChecksumAddress(accounts[0]) : null);
    } catch {
      if (!mountedRef.current) return;
      setAccount(null);
    }
  }, []);

  const refreshChain = useCallback(async () => {
    const eth = getEthereumProvider();
    if (!eth) return;
    try {
      const chainHex = (await eth.request({ method: 'eth_chainId' })) as string;
      if (!mountedRef.current) return;
      updateChainId(parseInt(chainHex, 16));
    } catch {
      if (!mountedRef.current) return;
      updateChainId(null);
    }
  }, [updateChainId]);

  useEffect(() => {
    refreshAccounts();
    refreshChain();
  }, [refreshAccounts, refreshChain]);

  useEffect(() => {
    const eth = getEthereumProvider();
    if (!eth?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (!mountedRef.current) return;
      setAccount(accounts?.[0] ? toChecksumAddress(accounts[0]) : null);
    };

    const handleChainChanged = (chainHex: string) => {
      if (!mountedRef.current) return;
      updateChainId(parseInt(chainHex, 16));
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener?.('accountsChanged', handleAccountsChanged);
      eth.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [updateChainId]);

  const clearError = useCallback(() => setError(null), []);

  const ensureBrowserProvider = useCallback(async (): Promise<BrowserProvider> => {
    const eth = getEthereumProvider();
    if (!eth) {
      throw new Error('Wallet provider not detected. Install a Base-compatible wallet.');
    }
    return new BrowserProvider(eth as any);
  }, []);

  const switchToBase = useCallback(async () => {
    const eth = getEthereumProvider();
    if (!eth) {
      throw new Error('Wallet provider not detected.');
    }
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_HEX }]
      });
    } catch (err: any) {
      if (err?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [BASE_NETWORK_PARAMS]
        });
        await eth.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: BASE_CHAIN_HEX }]
        });
      } else {
        throw new Error('Switch to Base Mainnet to continue.');
      }
    }
    await refreshChain();
  }, [refreshChain]);

  const connectWallet = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const provider = await ensureBrowserProvider();
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) {
        throw new Error('Wallet connection rejected.');
      }
      await switchToBase();
      const normalized = toChecksumAddress(accounts[0]);
      setAccount(normalized);
      const network = await provider.getNetwork();
      updateChainId(Number(network.chainId));
      setStatus('ready');
    } catch (err: any) {
      setError(err?.message ?? 'Wallet connection failed.');
      setStatus('error');
      throw err;
    }
  }, [ensureBrowserProvider, switchToBase, updateChainId]);

  const enterRun = useCallback(
    async (entryFeeWei: bigint): Promise<EnterRunResult> => {
      if (!account) {
        throw new Error('Connect your wallet before starting a run.');
      }
      setError(null);
      setStatus('txPending');
      try {
        const provider = await ensureBrowserProvider();
        await switchToBase();
        const signer = await provider.getSigner();
        const contract = new Contract(SWEETCHAIN_CONTRACT_ADDRESS, SWEETCHAIN_ABI, signer);
        const tx = await contract.enterRun({ value: entryFeeWei });
        setLastTxHash(tx.hash);
        const receipt = await tx.wait();
        let runId: bigint | null = null;
        if (receipt?.logs) {
          for (const log of receipt.logs) {
            try {
              const parsed = contract.interface.parseLog(log);
              if (parsed?.name === 'RunEntered') {
                const parsedRunId = parsed.args?.runId as bigint;
                runId = parsedRunId;
                break;
              }
            } catch {
              // ignore non-matching logs
            }
          }
        }
        setLastRunId(runId);
        setStatus('ready');
        await refreshChain();
        await refreshAccounts();
        return { txHash: tx.hash, runId, account };
      } catch (err: any) {
        setStatus('error');
        const message = err?.shortMessage || err?.error?.message || err?.message || 'Transaction failed.';
        setError(message);
        throw err;
      }
    },
    [account, ensureBrowserProvider, switchToBase, refreshChain, refreshAccounts]
  );

  const claimReward = useCallback(
    async ({ runId }: ClaimRewardParams): Promise<string> => {
      if (!account) {
        throw new Error('Ödül talebi için cüzdanını bağla.');
      }
      setError(null);
      setStatus('txPending');
      try {
        const provider = await ensureBrowserProvider();
        await switchToBase();
        const signer = await provider.getSigner();
        const contract = new Contract(SWEETCHAIN_CONTRACT_ADDRESS, SWEETCHAIN_ABI, signer);
        const runIdBig = typeof runId === 'bigint' ? runId : BigInt(runId);
        const tx = await contract.claimReward(runIdBig);
        setLastTxHash(tx.hash);
        await tx.wait();
        setStatus('ready');
        await refreshChain();
        await refreshAccounts();
        return tx.hash;
      } catch (err: any) {
        setStatus('error');
        const message = err?.shortMessage || err?.error?.message || err?.message || 'Ödül talebi başarısız oldu.';
        setError(message);
        throw err;
      }
    },
    [account, ensureBrowserProvider, switchToBase, refreshChain, refreshAccounts]
  );

  const isConnected = useMemo(() => !!account, [account]);
  const isCorrectChain = useMemo(() => chainId === BASE_CHAIN_ID, [chainId]);

  return {
    account,
    chainId,
    isConnected,
    isCorrectChain,
    hasProvider,
    status,
    error,
    lastTxHash,
    lastRunId,
    connectWallet,
    switchToBase,
    enterRun,
    claimReward,
    clearError
  };
};
