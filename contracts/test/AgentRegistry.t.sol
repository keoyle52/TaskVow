// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner = address(0xABCD);
    address public agent1 = address(0x1111);
    address public escrow = address(0x2222);

    function setUp() public {
        vm.prank(owner);
        registry = new AgentRegistry();
    }

    function testOwnerIsDeployer() public view {
        assertEq(registry.owner(), owner);
    }

    function testRegisterAgent() public {
        string memory uri = "ipfs://QmAgent1Metadata";

        vm.prank(agent1);
        registry.registerAgent(uri);

        (string memory metadata, uint256 completed, uint256 disputesLost, uint256 volume, bool active) = registry.agents(agent1);
        assertEq(metadata, uri);
        assertEq(completed, 0);
        assertEq(disputesLost, 0);
        assertEq(volume, 0);
        assertTrue(active);
    }

    function testDeactivateAgent() public {
        string memory uri = "ipfs://QmAgent1Metadata";

        vm.prank(agent1);
        registry.registerAgent(uri);

        vm.prank(agent1);
        registry.deactivateAgent();

        (, , , , bool active) = registry.agents(agent1);
        assertFalse(active);
    }

    function testDeactivateInactiveAgentReverts() public {
        vm.prank(agent1);
        vm.expectRevert("Agent is not active");
        registry.deactivateAgent();
    }

    function testRegisterEmptyMetadataReverts() public {
        vm.prank(agent1);
        vm.expectRevert("Metadata URI cannot be empty");
        registry.registerAgent("");
    }

    function testSetEscrowOnlyOwner() public {
        vm.prank(owner);
        registry.setEscrowContract(escrow);
        assertEq(registry.escrowContract(), escrow);

        vm.prank(agent1);
        vm.expectRevert("Only owner can call");
        registry.setEscrowContract(address(0x3333));
    }

    function testIncrementJobsCompletedOnlyEscrow() public {
        vm.prank(owner);
        registry.setEscrowContract(escrow);

        vm.prank(agent1);
        registry.registerAgent("ipfs://QmAgent1Metadata");

        // Calling from address that is not escrow should revert
        vm.prank(agent1);
        vm.expectRevert("Only escrow contract can call");
        registry.incrementJobsCompleted(agent1);

        // Calling from escrow should succeed
        vm.prank(escrow);
        registry.incrementJobsCompleted(agent1);

        (, uint256 completed, , , ) = registry.agents(agent1);
        assertEq(completed, 1);
    }

    function testRecordVolumeAndDisputesLostOnlyEscrow() public {
        vm.prank(owner);
        registry.setEscrowContract(escrow);

        vm.prank(agent1);
        registry.registerAgent("ipfs://QmAgent1Metadata");

        vm.prank(escrow);
        registry.recordVolume(agent1, 500 * 10**6);

        vm.prank(escrow);
        registry.recordDisputeLost(agent1);

        (, , uint256 disputesLost, uint256 volume, ) = registry.agents(agent1);
        assertEq(volume, 500 * 10**6);
        assertEq(disputesLost, 1);
    }

    function testIncrementJobsCompletedForInactiveDoesNotIncrement() public {
        vm.prank(owner);
        registry.setEscrowContract(escrow);

        // Agent is not registered/active
        vm.prank(escrow);
        registry.incrementJobsCompleted(agent1);

        (, uint256 completed, , , ) = registry.agents(agent1);
        assertEq(completed, 0);
    }
}
