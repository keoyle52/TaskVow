import { NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, parseUnits, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from '@/lib/wagmi'
import { failedDeposits } from '../route'

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'

const USDC_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "value", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const

export async function POST(request: Request) {
  try {
    const { userDepositTxHash, agentAddress } = await request.json()

    if (!userDepositTxHash || !agentAddress) {
      return NextResponse.json({ 
        error: 'Missing required parameters: userDepositTxHash, agentAddress' 
      }, { status: 400 })
    }

    if (!isAddress(agentAddress)) {
      return NextResponse.json({ error: 'Invalid agentAddress format' }, { status: 400 })
    }

    const normalizedTxHash = userDepositTxHash.toLowerCase()
    const failedRecord = failedDeposits.get(normalizedTxHash)

    let rawPrivateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY
    if (!rawPrivateKey) {
      return NextResponse.json({ error: 'Server PRIVATE_KEY is not configured.' }, { status: 500 })
    }
    if (!rawPrivateKey.startsWith('0x')) {
      rawPrivateKey = `0x${rawPrivateKey}`
    }

    const account = privateKeyToAccount(rawPrivateKey as `0x${string}`)

    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.RPC_URL || 'https://rpc.testnet.arc.network')
    })

    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.RPC_URL || 'https://rpc.testnet.arc.network')
    })

    let refundAmountStr = failedRecord?.amount

    if (!refundAmountStr) {
      // Direct on-chain verification if not found in volatile memory
      const [receipt, tx] = await Promise.all([
        publicClient.getTransactionReceipt({ hash: normalizedTxHash as `0x${string}` }).catch(() => null),
        publicClient.getTransaction({ hash: normalizedTxHash as `0x${string}` }).catch(() => null)
      ])

      if (!receipt || receipt.status !== 'success' || !tx || tx.from.toLowerCase() !== agentAddress.toLowerCase()) {
        return NextResponse.json({ 
          error: 'No refundable deposit found for this transaction hash and agent address.' 
        }, { status: 404 })
      }

      refundAmountStr = '1.0' // Default fallback unit check
    }

    const refundAmountUnits = parseUnits(refundAmountStr, 6)

    console.log(`[API Refund] Refunding ${refundAmountStr} USDC to ${agentAddress} for tx ${normalizedTxHash}...`)

    const refundTx = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: 'transfer',
      args: [agentAddress as `0x${string}`, refundAmountUnits]
    })

    failedDeposits.delete(normalizedTxHash)

    return NextResponse.json({
      success: true,
      message: 'Deposit refunded successfully.',
      refundTxHash: refundTx,
      refundAmount: refundAmountStr,
      recipient: agentAddress
    })

  } catch (error: any) {
    console.error('[API Refund] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'An error occurred during the refund operation.' 
    }, { status: 500 })
  }
}
