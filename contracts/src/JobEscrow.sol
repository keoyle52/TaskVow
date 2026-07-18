// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistry {
    function agents(address agentAddress) external view returns (
        string memory metadataURI,
        uint256 jobsCompleted,
        bool active
    );
    function incrementJobsCompleted(address agentAddress) external;
}

/**
 * @title JobEscrow
 * @dev Manages the escrow lifecycle of jobs funded using ERC-20 USDC on Arc Testnet.
 */
contract JobEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum JobStatus { Created, Accepted, Submitted, Settled, Disputed, Cancelled }

    struct Job {
        uint256 id;
        address client;
        address provider;
        uint256 amount;
        uint256 deadline;
        string descriptionURI;
        string proofURI;
        JobStatus status;
    }

    IERC20 public immutable usdcToken;
    IAgentRegistry public immutable agentRegistry;
    address public immutable admin;

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        uint256 amount,
        uint256 deadline,
        string descriptionURI
    );
    event JobAccepted(uint256 indexed jobId, address indexed provider);
    event DeliverableSubmitted(uint256 indexed jobId, string proofURI);
    event JobSettled(uint256 indexed jobId, address indexed provider, uint256 amount);
    event JobDisputed(uint256 indexed jobId, address indexed raisedBy);
    event JobDisputeResolved(uint256 indexed jobId, bool releaseToAgent);
    event JobCancelled(uint256 indexed jobId);

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

    constructor(address _usdcToken, address _agentRegistry, address _admin) {
        require(_usdcToken != address(0), "Invalid USDC token");
        require(_agentRegistry != address(0), "Invalid AgentRegistry");
        require(_admin != address(0), "Invalid admin");
        
        usdcToken = IERC20(_usdcToken);
        agentRegistry = IAgentRegistry(_agentRegistry);
        admin = _admin;
    }

    /**
     * @dev Creates a new job and locks the ERC-20 USDC budget into escrow.
     * @param amount The budget amount in ERC-20 USDC (6 decimals).
     * @param deadline The unix timestamp after which the job can be cancelled if not accepted.
     * @param descriptionURI Off-chain description metadata URI.
     */
    function createJob(
        uint256 amount,
        uint256 deadline,
        string calldata descriptionURI
    ) external returns (uint256 jobId) {
        require(amount > 0, "Amount must be greater than 0");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(bytes(descriptionURI).length > 0, "Description URI cannot be empty");

        // Lock ERC-20 USDC budget from client to this contract
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);

        jobCount++;
        jobId = jobCount;

        jobs[jobId] = Job({
            id: jobId,
            client: msg.sender,
            provider: address(0),
            amount: amount,
            deadline: deadline,
            descriptionURI: descriptionURI,
            proofURI: "",
            status: JobStatus.Created
        });

        emit JobCreated(jobId, msg.sender, amount, deadline, descriptionURI);
    }

    /**
     * @dev Called by a registered active agent to accept a job in 'Created' state.
     * @param jobId The unique identifier of the job.
     */
    function acceptJob(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Created, "Job is not in Created state");
        require(job.deadline > block.timestamp, "Job deadline has passed");

        // Verify provider is registered and active in AgentRegistry
        (, , bool active) = agentRegistry.agents(msg.sender);
        require(active, "Sender is not an active registered agent");

        job.provider = msg.sender;
        job.status = JobStatus.Accepted;

        emit JobAccepted(jobId, msg.sender);
    }

    /**
     * @dev Called by the accepted provider to submit the proof of delivery.
     * @param jobId The unique identifier of the job.
     * @param proofURI The off-chain proof of deliverable (e.g. IPFS hash, document URL).
     */
    function submitDeliverable(
        uint256 jobId,
        string calldata proofURI
    ) external onlyProvider(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Accepted, "Job is not in Accepted state");
        require(bytes(proofURI).length > 0, "Proof URI cannot be empty");

        job.proofURI = proofURI;
        job.status = JobStatus.Submitted;

        emit DeliverableSubmitted(jobId, proofURI);
    }

    /**
     * @dev Called by the client to approve the deliverable and release escrowed funds to the provider.
     * @param jobId The unique identifier of the job.
     */
    function approveAndRelease(uint256 jobId) external onlyClient(jobId) nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Submitted, "Job is not in Submitted state");

        uint256 amount = job.amount;
        address provider = job.provider;

        // CEI Pattern: update state before interactions
        job.status = JobStatus.Settled;

        // Try to increment the agent's completed count in the registry
        try agentRegistry.incrementJobsCompleted(provider) {} catch {}

        // Release ERC-20 USDC to provider
        usdcToken.safeTransfer(provider, amount);

        emit JobSettled(jobId, provider, amount);
    }

    /**
     * @dev Called by either client or provider to flag an active or submitted job as disputed.
     * @param jobId The unique identifier of the job.
     */
    function raiseDispute(uint256 jobId) external {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client || msg.sender == job.provider, "Only client or provider can raise dispute");
        require(job.status == JobStatus.Accepted || job.status == JobStatus.Submitted, "Job status not disputable");

        job.status = JobStatus.Disputed;

        emit JobDisputed(jobId, msg.sender);
    }

    /**
     * @dev Called only by the admin to resolve a disputed job, releasing funds to either agent or client.
     * @param jobId The unique identifier of the job.
     * @param releaseToAgent If true, transfers USDC to provider; if false, refunds client.
     */
    function resolveDispute(uint256 jobId, bool releaseToAgent) external onlyAdmin nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Disputed, "Job is not in Disputed state");

        uint256 amount = job.amount;
        address client = job.client;
        address provider = job.provider;

        // CEI Pattern: update state before interaction
        if (releaseToAgent) {
            job.status = JobStatus.Settled;
            try agentRegistry.incrementJobsCompleted(provider) {} catch {}
            usdcToken.safeTransfer(provider, amount);
        } else {
            job.status = JobStatus.Cancelled;
            usdcToken.safeTransfer(client, amount);
        }

        emit JobDisputeResolved(jobId, releaseToAgent);
    }

    /**
     * @dev Called by the client to cancel a job and retrieve funds if the deadline passed without acceptance.
     * @param jobId The unique identifier of the job.
     */
    function cancelJob(uint256 jobId) external onlyClient(jobId) {
        Job storage job = jobs[jobId];
        require(block.timestamp > job.deadline, "Deadline has not passed");
        require(job.status == JobStatus.Created || job.status == JobStatus.Accepted, "Cannot cancel this job");

        uint256 amount = job.amount;

        // CEI Pattern
        job.status = JobStatus.Cancelled;

        usdcToken.safeTransfer(job.client, amount);

        emit JobCancelled(jobId);
    }
}
