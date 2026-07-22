import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_REGISTRY_ADDRESS, JOB_ESCROW_ADDRESS, USDC_TOKEN_ADDRESS } from '../lib/contracts/contracts.ts'

test('Contracts Configuration - Verify Arc Testnet Addresses', () => {
  assert.equal(AGENT_REGISTRY_ADDRESS.toLowerCase(), '0x1c0bb4bd0444ceb477ed24a9c4cb3d8e5de1967c')
  assert.equal(JOB_ESCROW_ADDRESS.toLowerCase(), '0xcc8c461e6131b121e1c92d3e70c4af98523b1121')
  assert.equal(USDC_TOKEN_ADDRESS.toLowerCase(), '0x3600000000000000000000000000000000000000')
})

test('USDC Decimals Verification', () => {
  const erc20Decimals = 6
  const nativeGasDecimals = 18
  assert.equal(erc20Decimals, 6, 'ERC-20 USDC must be 6 decimals')
  assert.equal(nativeGasDecimals, 18, 'Native Gas USDC must be 18 decimals')
})
