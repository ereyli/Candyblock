// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title SweetChainEconomy
/// @notice Dynamic entry-fee pool where an authorised score keeper finalises runs and players claim rewards trustlessly.
contract SweetChainEconomy is Ownable, Pausable, ReentrancyGuard {
    enum RunStatus {
        Active,
        Finalized,
        Claimed
    }

    struct RunInfo {
        address player;
        RunStatus status;
        uint256 score;
        uint256 reward;
    }

    // ---------------------------------------------------------------------
    // Config
    // ---------------------------------------------------------------------

    /// @notice Minimum entry fee regardless of pool size.
    uint256 public minEntryFee = 0.0001 ether;

    /// @notice Dynamic fee is calculated as (totalPool * feeBps / 10_000).
    uint256 public feeBps = 50; // 0.5% of pool

    /// @notice Percentage of entry fee that stays in the pool (in basis points).
    uint256 public poolBps = 7000; // 70%

    /// @notice Percentage of entry fee forwarded to the project wallet (in basis points).
    uint256 public projectBps = 3000; // 30%

    /// @notice Address authorised to finalise runs and record scores.
    address public scoreKeeper;

    /// @notice Wallet receiving project share on every entry.
    address public projectWallet;

    /// @notice Reward tier score thresholds.
    uint256[] public tierScores = [10_000, 20_000, 40_000, 80_000];

    /// @notice Reward tier shares in basis points (aligned with `tierScores`).
    uint256[] public tierBps = [40, 80, 150, 400]; // 0.4%, 0.8%, 1.5%, 4%

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    uint256 public totalPool;          // ETH currently held for rewards (including reserved)
    uint256 public reservedPool;       // Portion of the pool reserved for finalized runs
    uint256 public totalDistributed;   // Total ETH claimed by players
    uint256 public totalEntries;       // Number of runs created
    uint256 public lastRunId;          // Latest run identifier

    mapping(uint256 => RunInfo) public runs;
    mapping(address => uint256[]) public playerRuns;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event RunEntered(address indexed player, uint256 indexed runId, uint256 fee);
    event RunFinalized(address indexed player, uint256 indexed runId, uint256 score, uint256 reward);
    event RewardClaimed(address indexed player, uint256 indexed runId, uint256 score, uint256 reward);
    event EntryFeeParamsUpdated(uint256 minEntryFee, uint256 feeBps);
    event FeeSplitUpdated(uint256 poolBps, uint256 projectBps);
    event ScoreKeeperUpdated(address indexed scoreKeeper);
    event ProjectWalletUpdated(address indexed wallet);
    event RewardTiersUpdated(uint256[] scores, uint256[] bps);
    event PoolDrained(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address _scoreKeeper, address _projectWallet) Ownable(msg.sender) {
        require(_scoreKeeper != address(0), "Score keeper zero");
        require(_projectWallet != address(0), "Wallet zero");
        scoreKeeper = _scoreKeeper;
        projectWallet = _projectWallet;
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyScoreKeeper() {
        require(msg.sender == scoreKeeper || msg.sender == owner(), "Not authorised");
        _;
    }

    // ---------------------------------------------------------------------
    // Entry / Reward logic
    // ---------------------------------------------------------------------

    /// @notice Computes the current entry fee taking the pool size into account.
    function currentEntryFee() public view returns (uint256) {
        uint256 dynamicFee = (totalPool * feeBps) / 10_000;
        return dynamicFee > minEntryFee ? dynamicFee : minEntryFee;
    }

    /// @notice Player enters a new run paying the dynamic entry fee.
    function enterRun() external payable whenNotPaused nonReentrant returns (uint256 runId) {
        uint256 requiredFee = currentEntryFee();
        require(msg.value >= requiredFee, "Fee too low");

        uint256 poolCut = (msg.value * poolBps) / 10_000;
        uint256 projectCut = (msg.value * projectBps) / 10_000;
        uint256 surplus = msg.value - poolCut - projectCut;

        // Pool accumulates its share plus any overpayment surplus
        totalPool += poolCut + surplus;

        if (projectCut > 0) {
            (bool ok, ) = projectWallet.call{value: projectCut}("");
            require(ok, "Project transfer failed");
        }

        runId = ++lastRunId;
        runs[runId] = RunInfo({
            player: msg.sender,
            status: RunStatus.Active,
            score: 0,
            reward: 0
        });
        playerRuns[msg.sender].push(runId);
        totalEntries += 1;

        emit RunEntered(msg.sender, runId, msg.value);
    }

    /// @notice Score keeper finalises a run and reserves the reward inside the pool.
    function finalizeRun(uint256 runId, uint256 score)
        external
        onlyScoreKeeper
        whenNotPaused
    {
        RunInfo storage info = runs[runId];
        require(info.player != address(0), "Run missing");
        require(info.status == RunStatus.Active, "Run not active");

        uint256 reward = _calculateReward(score);
        require(reward <= availablePool(), "Pool insufficient");

        info.status = RunStatus.Finalized;
        info.score = score;
        info.reward = reward;
        reservedPool += reward;

        emit RunFinalized(info.player, runId, score, reward);
    }

    /// @notice Player claims the reward for a finalized run.
    function claimReward(uint256 runId) external whenNotPaused nonReentrant {
        RunInfo storage info = runs[runId];
        require(info.player != address(0), "Run missing");
        require(info.player == msg.sender, "Not run owner");
        require(info.status == RunStatus.Finalized, "Not ready");
        require(info.reward > 0, "No reward");

        uint256 payout = info.reward;
        info.status = RunStatus.Claimed;
        info.reward = 0;
        reservedPool -= payout;
        totalPool -= payout;
        totalDistributed += payout;

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "Transfer failed");

        emit RewardClaimed(msg.sender, runId, info.score, payout);
    }

    /// @notice Returns the portion of the pool that is not reserved yet.
    function availablePool() public view returns (uint256) {
        return totalPool - reservedPool;
    }

    // ---------------------------------------------------------------------
    // Owner / keeper controls
    // ---------------------------------------------------------------------

    function setEntryFeeParams(uint256 newMinFee, uint256 newFeeBps) external onlyOwner {
        require(newMinFee > 0, "Min fee zero");
        require(newFeeBps <= 500, "Fee too high"); // cap at 5%
        minEntryFee = newMinFee;
        feeBps = newFeeBps;
        emit EntryFeeParamsUpdated(newMinFee, newFeeBps);
    }

    function setFeeSplit(uint256 newPoolBps, uint256 newProjectBps) external onlyOwner {
        require(newPoolBps + newProjectBps == 10_000, "Invalid split");
        poolBps = newPoolBps;
        projectBps = newProjectBps;
        emit FeeSplitUpdated(newPoolBps, newProjectBps);
    }

    function setScoreKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "Keeper zero");
        scoreKeeper = newKeeper;
        emit ScoreKeeperUpdated(newKeeper);
    }

    function setProjectWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Wallet zero");
        projectWallet = newWallet;
        emit ProjectWalletUpdated(newWallet);
    }

    function updateRewardTiers(uint256[] calldata scores, uint256[] calldata bps) external onlyOwner {
        require(scores.length == bps.length && scores.length > 0, "Length mismatch");
        uint256 previous = 0;
        for (uint256 i = 0; i < scores.length; i++) {
            require(scores[i] > previous, "Scores ascending");
            require(bps[i] <= 2_000, "Tier too large"); // at most 20%
            previous = scores[i];
        }
        tierScores = scores;
        tierBps = bps;
        emit RewardTiersUpdated(scores, bps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Emergency function for the owner to withdraw the remaining pool.
    function drainPool(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Zero address");
        uint256 amount = totalPool;
        totalPool = 0;
        reservedPool = 0;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Drain failed");
        emit PoolDrained(to, amount);
    }

    // ---------------------------------------------------------------------
    // View helpers
    // ---------------------------------------------------------------------

    function getRun(uint256 runId)
        external
        view
        returns (address player, RunStatus status, uint256 score, uint256 reward)
    {
        RunInfo memory info = runs[runId];
        return (info.player, info.status, info.score, info.reward);
    }

    function getStats()
        external
        view
        returns (uint256 pool, uint256 distributed, uint256 entries, uint256 latestRunId)
    {
        return (totalPool, totalDistributed, totalEntries, lastRunId);
    }

    function getCurrentConfig()
        external
        view
        returns (uint256 entryFee, uint256 poolPct, uint256 projectPct, address verifierAddr, address walletAddr)
    {
        return (currentEntryFee(), poolBps, projectBps, scoreKeeper, projectWallet);
    }

    function getRewardTiers() external view returns (uint256[] memory scores, uint256[] memory bps) {
        return (tierScores, tierBps);
    }

    function getReservedPool() external view returns (uint256) {
        return reservedPool;
    }

    // ---------------------------------------------------------------------
    // Internal utilities
    // ---------------------------------------------------------------------

    function _calculateReward(uint256 score) internal view returns (uint256) {
        uint256 shareBps = 0;
        for (uint256 i = 0; i < tierScores.length; i++) {
            if (score >= tierScores[i]) {
                shareBps = tierBps[i];
            }
        }
        if (shareBps == 0) {
            return 0;
        }
        return (totalPool * shareBps) / 10_000;
    }

    // ---------------------------------------------------------------------
    // Receive hook to allow manual top-ups of the prize pool.
    // ---------------------------------------------------------------------

    receive() external payable {
        totalPool += msg.value;
    }
}
