# Candyblock

Candyblock is a fast, arcade‑style match puzzle built for Base. Players pay a dynamic entry fee, play a timed/turn‑based puzzle run, and (if eligible) claim a percentage of the on‑chain pool. The repo contains:

- `contracts/` — SweetChainEconomy Solidity contract (dynamic entry fee, pool split, keeper‑finalized rewards, pause/drain controls)
- `miniapp/` — Next.js miniapp with a reactive game engine, on‑chain stats preview, wallet integration, and polished UI/animations

## Features

- Dynamic entry fee that scales with pool size
- Fee split: pool + project wallet
- Runs are created on‑chain; score is finalized by an authorised `scoreKeeper`
- Players claim rewards on‑chain if their score reaches configured tiers
- Pausable, non‑reentrant, emergency drain
- Auto‑reshuffle and strict line‑match (3+) detection for clear gameplay
- New tiles always fall from the top; no mid‑column spawns
- Local persistence so refresh resumes your run state

## Tech

- Contracts: Solidity ^0.8.24, OpenZeppelin (Ownable, Pausable, ReentrancyGuard)
- Frontend: Next.js 15, React 18, ethers v6

## Addresses / Networks

- Base Mainnet
- Current contract (update as you redeploy):
  - `SWEETCHAIN_CONTRACT_ADDRESS` is configured in `miniapp/src/lib/contract/constants.ts`

## Contract

Path: `contracts/SweetChainEconomy.sol`

Key parameters:
- `minEntryFee`: minimum entry fee
- `feeBps`: dynamic fee = `totalPool * feeBps / 10_000`
- `poolBps` / `projectBps`: split of each entry
- `scoreKeeper`: address allowed to finalize runs
- Reward tiers: `tierScores[]` + `tierBps[]` (shares of pool in bps)

Flow:
1. Player `enterRun()` (pays entry fee)
2. Backend/keeper validates the run and calls `finalizeRun(runId, score)`
3. Player calls `claimReward(runId)` (reverts if reward == 0)

Owner controls:
- `setEntryFeeParams`, `setFeeSplit`, `setScoreKeeper`, `setProjectWallet`, `updateRewardTiers`, `pause`, `unpause`, `drainPool`

## Miniapp (frontend)

Path: `miniapp/`

### Prereqs
- Node 18+

### Install & Run
```
cd miniapp
npm install
npm run dev
```

### Env
Create `.env.local` if you want to override defaults:
```
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
```

Contract address is read from `src/lib/contract/constants.ts`.

### Gameplay Notes
- Strict 3+ line matches (horizontal/vertical). L/T shapes only count if they include a line of 3+.
- After explosions, tiles above fall down to fill gaps; new tiles are created only at the top and fall in.
- If the board has no playable moves, it auto‑reshuffles.
- Restarting a run triggers the entry payment again.

## Development Scripts
- `miniapp`: `npm run dev` (Next dev), `npm run build`, `npm run start`

## Contributing
PRs welcome. Please keep UI changes consistent with the existing visual style and avoid re‑adding mid‑column spawns in the engine.

## License
MIT
