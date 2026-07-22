import { NextResponse } from 'next/server'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from '@/lib/wagmi'

const EURC_ADDRESS = '0x3600000000000000000000000000000000000001'
const EURC_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "value", "type": "uint256" }
    ],
    "name": "transfer",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
]

export async function POST(request: Request) {
  try {
    const { amount, agentAddress } = await request.json()

    if (!amount || !agentAddress) {
      return NextResponse.json({ error: 'Missing amount or agentAddress' }, { status: 400 })
    }

    const privateKey = process.env.PRIVATE_KEY as `0x${string}`
    const kitKey = process.env.CIRCLE_KIT_KEY

    if (!privateKey) {
      return NextResponse.json({ error: 'Server PRIVATE_KEY is not configured' }, { status: 500 })
    }

    if (!kitKey || kitKey === 'your_circle_kit_key_here') {
      return NextResponse.json({ 
        error: 'Circle App Kit Key (CIRCLE_KIT_KEY) is not configured in .env.local' 
      }, { status: 400 })
    }

    // 1. Initialize Viem Clients for the Deployer/Server account
    const account = privateKeyToAccount(privateKey)
    
    const publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(process.env.RPC_URL || 'https://rpc.testnet.arc.network')
    })

    const walletClient = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(process.env.RPC_URL || 'https://rpc.testnet.arc.network')
    })

    // 2. Initialize the Circle App Kit Viem Adapter
    const viemAdapter = createViemAdapterFromPrivateKey({
      privateKey,
      getPublicClient: () => publicClient,
      getWalletClient: async () => walletClient
    })

    const kit = new AppKit()

    console.log(`[API Swap] Swapping ${amount} USDC to EURC for agent ${agentAddress}...`)

    // 3. Perform the Same-Chain Swap on Arc Testnet using Circle App Kit
    // Note: We perform the swap using the server's wallet.
    const swapResult = await kit.swap({
      from: {
        adapter: viemAdapter,
        chain: 'Arc_Testnet'
      },
      tokenIn: 'USDC',
      tokenOut: 'EURC',
      amountIn: amount,
      config: {
        slippageBps: 300, // 3% slippage tolerance
        kitKey: kitKey
      }
    })

    console.log('[API Swap] Swap complete. Tx Hash:', swapResult.txHash)

    // 4. Transfer the resulting EURC from the server wallet to the agent's address
    // EURC has 6 decimals on Arc Testnet, same as USDC.
    const eurcAmount = parseUnits(amount, 6)
    
    console.log(`[API Swap] Transferring ${amount} EURC to agent ${agentAddress}...`)
    
    const transferTx = await walletClient.writeContract({
      address: EURC_ADDRESS,
      abi: EURC_ABI,
      functionName: 'transfer',
      args: [agentAddress, eurcAmount]
    })

    console.log('[API Swap] Transfer complete. Tx Hash:', transferTx)

    return NextResponse.json({
      success: true,
      swapTxHash: swapResult.txHash,
      transferTxHash: transferTx,
      amount,
      recipient: agentAddress
    })

  } catch (error: any) {
    console.error('[API Swap] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'An error occurred during the App Kit swap operation.' 
    }, { status: 500 })
  }
}
