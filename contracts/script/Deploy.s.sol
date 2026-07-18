// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/JobEscrow.sol";

contract DeployScript is Script {
    function run() external {
        // Read deployment configuration from environment variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address adminAddress = vm.envAddress("ADMIN_ADDRESS");
        
        // Arc Testnet ERC-20 USDC contract address
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0x3600000000000000000000000000000000000000));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));

        // 2. Deploy JobEscrow
        JobEscrow escrow = new JobEscrow(usdcAddress, address(registry), adminAddress);
        console.log("JobEscrow deployed at:", address(escrow));

        // 3. Connect AgentRegistry to JobEscrow
        registry.setEscrowContract(address(escrow));
        console.log("AgentRegistry connected to JobEscrow");

        vm.stopBroadcast();
    }
}
