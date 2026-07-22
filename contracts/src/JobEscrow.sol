// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistry {
    function agents(address agentAddress) external view returns (
        string memory metadataURI,
        uint256 jobsCompleted,
        uint256 disputesLost,
        uint256 totalVolumeUSDC,
        bool active
    );
    function incrementJobsCompleted(address agentAddress) external;
    function recordVolume(address agentAddress, uint256 amount) external;
    function recordDisputeLost(address agentAddress) external;
}

/**
 * @title JobEscrow
 * @dev Manages the escrow lifecycle of jobs funded using ERC-20 USDC on Arc Testnet,
 * including agent collateral staking, timeout releases, and automated reputation recording.
 */
contract JobEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum JobStatus { Created, Accepted, Submitted, Settled, Disputed, Cancelled }

    struct Job {
        uint256 id;
        address client;
        address provider;
        uint256 amount;
        uint256 stakeAmount;
        uint256 deadline;
        uint256 submittedAt;
        string descriptionURI;
        string proofURI;
        JobStatus status;
    }

    IERC20 public immutable usdcToken;
    IAgentRegistry public immutable agentRegistry;
    address public immutable admin;

    uint256 public releaseTimeout; // Time in seconds after deliverable submission before timeout release can be triggered
    uint256 public stakeBps;       // Collateral percentage required from agent in basis points (1000 = 10%)

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        uint256 amount,
        uint256 deadline,
        string descriptionURI
    );
    event JobAccepted(uint256 indexed jobId, address indexed provider, uint256 stakeAmount);
    event DeliverableSubmitted(uint256 indexed jobId, string proofURI, uint256 submittedAt);
    event JobSettled(uint256 indexed jobId, address indexed provider, uint256 totalAmount);
    event TimeoutReleaseClaimed(uint256 indexed jobId, address indexed provider, uint256 totalAmount);
    event JobDisputed(uint256 indexed jobId, address indexed raisedBy);
    event JobDisputeResolved(uint256 indexed jobId, bool releaseToAgent);
    event JobCancelled(uint256 indexed jobId);
    event StakeBpsUpdated(uint256 newStakeBps);
    event ReleaseTimeoutUpdated(uint256 newReleaseTimeout);

    modifier onlyClient(uint256 jobId) {
        require(jobs[jobId].client == msg.sender, "Only client can call");
        _;
    }

    modifier onlyProvider(uint256 jobId) {
        require(jobs[jobId].provider == msg.sender, "Only provider can call");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call");
        _;
    }

    constructor(
        address _usdcToken,
        address _agentRegistry,
        address _admin,
        uint256 _releaseTimeout,
        uint256 _stakeBps
    ) {
        require(_usdcToken != address(0), "Invalid USDC token");
        require(_agentRegistry != address(0), "Invalid AgentRegistry");
        require(_admin != address(0), "Invalid admin");
        
        usdcToken = IERC20(_usdcToken);
        agentRegistry = IAgentRegistry(_agentRegistry);
        admin = _admin;
        releaseTimeout = _releaseTimeout == 0 ? 3 days : _releaseTimeout;
        stakeBps = _stakeBps == 0 ? 1000 : _stakeBps; // default 10% (1000 bps)
    }

    /**
     * @dev Admin function to update agent stake basis points.
     */
    function setStakeBps(uint256 _stakeBps) external onlyAdmin {
        require(_stakeBps <= 5000, "Stake BPS cannot exceed 50%");
        stakeBps = _stakeBps;
        emit StakeBpsUpdated(_stakeBps);
    }

    /**
     * @dev Admin function to update deliverable release timeout.
     */
    function setReleaseTimeout(uint256 _releaseTimeout) external onlyAdmin {
        require(_releaseTimeout >= 1 hours, "Release timeout must be at least 1 hour");
        releaseTimeout = _releaseTimeout;
        emit ReleaseTimeoutUpdated(_releaseTimeout);
    }

    /**
     * @dev Creates a new job and locks the ERC-20 USDC budget into escrow.
     */
    function createJob(
        uint256 amount,
        uint256 deadline,
        string calldata descriptionURI
    ) external returns (uint256 jobId) {
        require(amount > 0, "Amount must be greater than 0");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(bytes(descriptionURI).length > 0, "Description URI cannot be empty");

        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        jobCount++;
        jobId = jobCount;

        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: address(0),
            amount: amount,
            stakeAmount: 0,
            deadline: deadline,
            submittedAt: 0,
            descriptionURI: descriptionURI,
            proofURI: "",
            status: JobStatus.Created
        });

        emit JobCreated(jobId, msg.sender, amount, deadline, descriptionURI);
    }

    /**
     * @dev Called by a registered active agent to accept a job and deposit USDC collateral.
     */
    function acceptJob(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Created, "Job is not in Created state");
        require(job.deadline > block.timestamp, "Job deadline has passed");

        (, , , , bool active) = agentRegistry.agents(msg.sender);
        require(active, "Sender is not an active registered agent");

        uint256 requiredStake = (job.amount * stakeBps) / 10000;
        if (requiredStake > 0) {
            usdcToken.safeTransferFrom(msg.sender, address(this), requiredStake);
        }

        job.provider = msg.sender;
        job.stakeAmount = requiredStake;
        job.status = JobStatus.Accepted;

        emit JobAccepted(jobId, msg.sender, requiredStake);
    }

    /**
     * @dev Called by the provider to submit deliverable proof and start release timeout clock.
     */
    function submitDeliverable(
        uint256 jobId,
        string calldata proofURI
    ) external onlyProvider(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Accepted, "Job is not in Accepted state");
        require(bytes(proofURI).length > 0, "Proof URI cannot be empty");

        job.proofURI = proofURI;
        job.submittedAt = block.timestamp;
        job.status = JobStatus.Submitted;

        emit DeliverableSubmitted(jobId, proofURI, block.timestamp);
    }

    /**
     * @dev Called by the client to approve deliverable and release funds + agent stake to provider.
     */
    function approveAndRelease(uint256 jobId) external onlyClient(jobId) nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "Job is not in Submitted state");

        uint256 totalPayout = job.amount + job.stakeAmount;
        address provider = job.provider;
        uint256 jobAmount = job.amount;

        job.status = JobStatus.Settled;

        try agentRegistry.incrementJobsCompleted(provider) {} catch {}
        try agentRegistry.recordVolume(provider, jobAmount) {} catch {}

        usdcToken.safeTransfer(provider, totalPayout);

        emit JobSettled(jobId, provider, totalPayout);
    }

    /**
     * @dev Automatic timeout release: can be called by provider (or anyone) if client fails to approve/dispute
     * within releaseTimeout seconds after deliverable submission.
     */
    function claimTimeoutRelease(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "Job is not in Submitted state");
        require(block.timestamp >= job.submittedAt + releaseTimeout, "Timeout period has not passed");

        uint256 totalPayout = job.amount + job.stakeAmount;
        address provider = job.provider;
        uint256 jobAmount = job.amount;

        job.status = JobStatus.Settled;

        try agentRegistry.incrementJobsCompleted(provider) {} catch {}
        try agentRegistry.recordVolume(provider, jobAmount) {} catch {}

        usdcToken.safeTransfer(provider, totalPayout);

        emit TimeoutReleaseClaimed(jobId, provider, totalPayout);
    }

    /**
     * @dev Called by client or provider to flag job as disputed.
     */
    function raiseDispute(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client || msg.sender == job.provider, "Only client or provider can raise dispute");
        require(job.status == JobStatus.Accepted || job.status == JobStatus.Submitted, "Job status not disputable");

        job.status = JobStatus.Disputed;

        emit JobDisputed(jobId, msg.sender);
    }

    /**
     * @dev Admin resolves dispute:
     * - releaseToAgent == true: provider receives job budget + stake.
     * - releaseToAgent == false: client receives job budget + forfeited agent stake, agent's disputeLost counter increments.
     */
    function resolveDispute(uint256 jobId, bool releaseToAgent) external onlyAdmin nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Disputed, "Job is not in Disputed state");

        uint256 amount = job.amount;
        uint256 stake = job.stakeAmount;
        address client = job.client;
        address provider = job.provider;

        if (releaseToAgent) {
            job.status = JobStatus.Settled;
            try agentRegistry.incrementJobsCompleted(provider) {} catch {}
            try agentRegistry.recordVolume(provider, amount) {} catch {}
            usdcToken.safeTransfer(provider, amount + stake);
        } else {
            job.status = JobStatus.Cancelled;
            try agentRegistry.recordDisputeLost(provider) {} catch {}
            usdcToken.safeTransfer(client, amount + stake);
        }

        emit JobDisputeResolved(jobId, releaseToAgent);
    }

    /**
     * @dev Called by client to cancel job if deadline passed without acceptance. Refunds client budget and returns agent stake (if any).
     */
    function cancelJob(uint256 jobId) external onlyClient(jobId) nonReentrant {
        Job storage job = jobs[jobId];
        require(block.timestamp > job.deadline, "Deadline has not passed");
        require(job.status == JobStatus.Created || job.status == JobStatus.Accepted, "Cannot cancel this job");

        uint256 clientRefund = job.amount;
        uint256 stakeRefund = job.stakeAmount;
        address provider = job.provider;

        job.status = JobStatus.Cancelled;

        usdcToken.safeTransfer(job.client, clientRefund);
        if (stakeRefund > 0 && provider != address(0)) {
            usdcToken.safeTransfer(provider, stakeRefund);
        }

        emit JobCancelled(jobId);
    }
}
