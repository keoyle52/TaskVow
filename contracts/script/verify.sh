#!/usr/bin/env bash

# Contract Verification Script for TaskVow on Arc Testnet Blockscout Explorer

RPC_URL=${RPC_URL:-"https://rpc.testnet.arc.network"}
EXPLORER_URL=${EXPLORER_URL:-"https://testnet.arcscan.app/api"}
COMPILER_VERSION="v0.8.20+commit.a1b79de6"
EVM_VERSION="shanghai"

# Contract Addresses (Defaults or from environment)
REGISTRY_ADDRESS=${REGISTRY_ADDRESS:-"0x1c0bB4bD0444CeB477Ed24A9c4cb3d8E5DE1967c"}
ESCROW_ADDRESS=${ESCROW_ADDRESS:-"0xCC8C461E6131b121e1c92D3e70C4aF98523B1121"}
USDC_ADDRESS=${USDC_ADDRESS:-"0x3600000000000000000000000000000000000000"}
ADMIN_ADDRESS=${ADMIN_ADDRESS:-"0x1c0bB4bD0444CeB477Ed24A9c4cb3d8E5DE1967c"}

echo "=== Verifying AgentRegistry ==="
forge verify-contract \
  --rpc-url $RPC_URL \
  --verifier blockscout \
  --verifier-url $EXPLORER_URL \
  --compiler-version $COMPILER_VERSION \
  --evm-version $EVM_VERSION \
  $REGISTRY_ADDRESS \
  src/AgentRegistry.sol:AgentRegistry

echo "=== Verifying JobEscrow ==="
CONSTRUCTOR_ARGS=$(cast abi-encode "constructor(address,address,address)" $USDC_ADDRESS $REGISTRY_ADDRESS $ADMIN_ADDRESS)

forge verify-contract \
  --rpc-url $RPC_URL \
  --verifier blockscout \
  --verifier-url $EXPLORER_URL \
  --compiler-version $COMPILER_VERSION \
  --evm-version $EVM_VERSION \
  --constructor-args $CONSTRUCTOR_ARGS \
  $ESCROW_ADDRESS \
  src/JobEscrow.sol:JobEscrow

echo "Verification script complete."
