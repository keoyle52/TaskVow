// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/AgentRegistry.sol";
import "../src/JobEscrow.sol";

// Mock USDC ERC-20 token
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // Override decimals to be 6 like real USDC
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

// Malicious USDC that simulates a transfer callback to trigger reentrancy
contract MaliciousUSDC is ERC20 {
    bool public enableCallback;
    address public attackerContract;

    constructor() ERC20("Malicious USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setAttacker(address _attacker, bool _enable) external {
        attackerContract = _attacker;
        enableCallback = _enable;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool success = super.transfer(to, amount);
        if (enableCallback && to == attackerContract) {
            // Trigger callback on the attacker contract to perform reentrancy
            ReentrancyAttacker(payable(attackerContract)).maliciousCallback();
        }
        return success;
    }
}

// Attacker contract to simulate reentrancy
contract ReentrancyAttacker {
    JobEscrow public escrow;
    MaliciousUSDC public maliciousUsdc;
    uint256 public targetJobId;
    bool public attackApprovedAndRelease;
    bool public attackResolveDispute;

    constructor(address _escrow, address _maliciousUsdc) {
        escrow = JobEscrow(_escrow);
        maliciousUsdc = MaliciousUSDC(_maliciousUsdc);
    }

    function setTarget(uint256 jobId, bool testApprove, bool testResolve) external {
        targetJobId = jobId;
        attackApprovedAndRelease = testApprove;
        attackResolveDispute = testResolve;
    }

    // Callback triggered by MaliciousUSDC during token transfer
    function maliciousCallback() external {
        if (attackApprovedAndRelease) {
            attackApprovedAndRelease = false; // Prevent infinite loop in test if it doesn't revert
            // Attempt to call approveAndRelease again
            escrow.approveAndRelease(targetJobId);
        } else if (attackResolveDispute) {
            attackResolveDispute = false; // Prevent infinite loop
            // Attempt to call resolveDispute again
            escrow.resolveDispute(targetJobId, true);
        }
    }
}

contract JobEscrowTest is Test {
    AgentRegistry public registry;
    JobEscrow public escrow;
    MockUSDC public usdc;

    address public admin = address(0xAAAA);
    address public client = address(0xBBBB);
    address public provider = address(0xCCCC);

    uint256 public constant INITIAL_BALANCE = 1000 * 10**6; // 1000 USDC
    uint256 public constant JOB_BUDGET = 100 * 10**6;      // 100 USDC
    uint256 public constant DEADLINE = 3600;

    function setUp() public {
        // Deploy Mock USDC
        usdc = new MockUSDC();

        // Deploy AgentRegistry
        registry = new AgentRegistry();

        // Deploy JobEscrow
        escrow = new JobEscrow(address(usdc), address(registry), admin);

        // Connect registry to escrow
        registry.setEscrowContract(address(escrow));

        // Mint USDC to client and provider
        usdc.mint(client, INITIAL_BALANCE);
        usdc.mint(provider, INITIAL_BALANCE);

        // Register provider as agent
        vm.prank(provider);
        registry.registerAgent("ipfs://QmProviderMetadata");
    }

    function testCreateJob() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        assertEq(jobId, 1);
        assertEq(usdc.balanceOf(address(escrow)), JOB_BUDGET);
        assertEq(usdc.balanceOf(client), INITIAL_BALANCE - JOB_BUDGET);

        (
            uint256 id,
            address jobClient,
            address jobProvider,
            uint256 amount,
            uint256 deadline,
            string memory descriptionURI,
            string memory proofURI,
            JobEscrow.JobStatus status
        ) = escrow.jobs(jobId);

        assertEq(id, 1);
        assertEq(jobClient, client);
        assertEq(jobProvider, address(0));
        assertEq(amount, JOB_BUDGET);
        assertEq(deadline, block.timestamp + DEADLINE);
        assertEq(descriptionURI, "ipfs://QmJobDetails");
        assertEq(proofURI, "");
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Created));
    }

    function testAcceptJob() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        (, , address jobProvider, , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(jobProvider, provider);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Accepted));
    }

    function testAcceptJobUnregisteredAgentReverts() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        address unregistered = address(0x9999);
        vm.prank(unregistered);
        vm.expectRevert("Sender is not an active registered agent");
        escrow.acceptJob(jobId);
    }

    function testSubmitDeliverable() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(provider);
        escrow.submitDeliverable(jobId, "ipfs://QmProofOfWork");

        (, , , , , , string memory proofURI, JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(proofURI, "ipfs://QmProofOfWork");
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Submitted));
    }

    function testSubmitDeliverableEmptyProofReverts() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(provider);
        vm.expectRevert("Proof URI cannot be empty");
        escrow.submitDeliverable(jobId, "");
    }

    function testApproveAndRelease() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(provider);
        escrow.submitDeliverable(jobId, "ipfs://QmProofOfWork");

        vm.prank(client);
        escrow.approveAndRelease(jobId);

        (, , , , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Settled));

        // Check USDC balances
        assertEq(usdc.balanceOf(provider), INITIAL_BALANCE + JOB_BUDGET);
        assertEq(usdc.balanceOf(address(escrow)), 0);

        // Check agent completed jobs count
        (, uint256 completed, ) = registry.agents(provider);
        assertEq(completed, 1);
    }

    function testApproveAndReleaseOnlyClientReverts() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(provider);
        escrow.submitDeliverable(jobId, "ipfs://QmProofOfWork");

        vm.prank(provider);
        vm.expectRevert("Only client can call");
        escrow.approveAndRelease(jobId);
    }

    function testCancelJobAfterDeadline() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        // Warp time beyond deadline
        vm.warp(block.timestamp + DEADLINE + 1);

        vm.prank(client);
        escrow.cancelJob(jobId);

        (, , , , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Cancelled));

        // Refund check
        assertEq(usdc.balanceOf(client), INITIAL_BALANCE);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testCancelJobBeforeDeadlineReverts() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(client);
        vm.expectRevert("Deadline has not passed");
        escrow.cancelJob(jobId);
    }

    function testRaiseDispute() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        // Provider raises dispute
        vm.prank(provider);
        escrow.raiseDispute(jobId);

        (, , , , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Disputed));
    }

    function testResolveDisputeToAgent() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(client);
        escrow.raiseDispute(jobId);

        // Admin resolves in favor of agent (provider)
        vm.prank(admin);
        escrow.resolveDispute(jobId, true);

        (, , , , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Settled));
        assertEq(usdc.balanceOf(provider), INITIAL_BALANCE + JOB_BUDGET);

        // Agent completed counter increments
        (, uint256 completed, ) = registry.agents(provider);
        assertEq(completed, 1);
    }

    function testResolveDisputeToClient() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), JOB_BUDGET);
        uint256 jobId = escrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmJobDetails");
        vm.stopPrank();

        vm.prank(provider);
        escrow.acceptJob(jobId);

        vm.prank(client);
        escrow.raiseDispute(jobId);

        // Admin resolves in favor of client (refund)
        vm.prank(admin);
        escrow.resolveDispute(jobId, false);

        (, , , , , , , JobEscrow.JobStatus status) = escrow.jobs(jobId);
        assertEq(uint256(status), uint256(JobEscrow.JobStatus.Cancelled));
        assertEq(usdc.balanceOf(client), INITIAL_BALANCE);
    }

    // Reentrancy robustness test
    function testReentrancyAttackApproveAndReleaseFails() public {
        // Deploy malicious USDC and set up separate escrow and registry for it
        MaliciousUSDC malUsdc = new MaliciousUSDC();
        AgentRegistry malRegistry = new AgentRegistry();
        JobEscrow malEscrow = new JobEscrow(address(malUsdc), address(malRegistry), admin);
        malRegistry.setEscrowContract(address(malEscrow));

        // Deploy attacker contract (will act as provider)
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(malEscrow), address(malUsdc));

        // Mint malicious tokens
        malUsdc.mint(client, INITIAL_BALANCE);
        malUsdc.mint(address(attacker), INITIAL_BALANCE);

        // Register attacker as agent
        vm.prank(address(attacker));
        malRegistry.registerAgent("ipfs://QmAttackerMetadata");

        // Client creates job
        vm.startPrank(client);
        malUsdc.approve(address(malEscrow), JOB_BUDGET);
        uint256 jobId = malEscrow.createJob(JOB_BUDGET, block.timestamp + DEADLINE, "ipfs://QmAttackJob");
        vm.stopPrank();

        // Attacker accepts job and submits deliverable
        vm.prank(address(attacker));
        malEscrow.acceptJob(jobId);

        vm.prank(address(attacker));
        malEscrow.submitDeliverable(jobId, "ipfs://QmMaliciousProof");

        // Set up malicious token callback to attacker
        malUsdc.setAttacker(address(attacker), true);
        attacker.setTarget(jobId, true, false);

        // Client approves and releases. During the token transfer to the attacker,
        // the malicious USDC contract callbacks the attacker, who attempts to call approveAndRelease again.
        // It must revert with reentrancy guard error.
        vm.prank(client);
        vm.expectRevert(); // Reentrancy Guard should revert the nested call
        malEscrow.approveAndRelease(jobId);
    }
}
