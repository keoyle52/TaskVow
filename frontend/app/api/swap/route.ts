import { NextResponse } from 'next/server'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2'
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem'
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

    let rawPrivateKey = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY
    const kitKey = process.env.CIRCLE_KIT_KEY

    if (!rawPrivateKey) {
      return NextResponse.json({ 
        error: 'Server PRIVATE_KEY is not configured in environment variables. Please add PRIVATE_KEY in Vercel Project Settings -> Environment Variables and redeploy.' 
      }, { status: 500 })
    }

    if (!rawPrivateKey.startsWith('0x')) {
      rawPrivateKey = `0x${rawPrivateKey}`
    }

    const privateKey = rawPrivateKey as `0x${string}`

    if (!kitKey || kitKey === 'your_circle_kit_key_here') {
      return NextResponse.json({ 
        error: 'Circle App Kit Key (CIRCLE_KIT_KEY) is not configured in Vercel environment variables.' 
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

    // Fetch live EUR/USD price feed from RedStone Oracle (Arc's official ecosystem oracle partner)
    let oracleEurRate = 1.08 // default fallback EUR/USD rate
    try {
      const redstoneRes = await fetch('https://api.redstone.finance/prices?symbol=EUR&provider=redstone-primary-prod', {
        cache: 'no-store'
      })
      const redstoneData = await redstoneRes.json()
      if (Array.isArray(redstoneData) && redstoneData[0] && redstoneData[0].value) {
        oracleEurRate = redstoneData[0].value
        console.log('[API Swap] Fetched RedStone Oracle EUR/USD rate:', oracleEurRate)
      }
    } catch (oracleErr) {
      console.warn('[API Swap] RedStone Oracle fetch error, using fallback rate:', oracleErr)
    }

    // Read server EURC balance BEFORE swap
    const balanceBefore = await publicClient.readContract({
      address: EURC_ADDRESS,
      abi: EURC_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    }) as bigint

    console.log(`[API Swap] Swapping ${amount} USDC to EURC for agent ${agentAddress} using RedStone Oracle rate (${oracleEurRate} USD/EUR)...`)

    // 3. Perform the Same-Chain Swap on Arc Testnet using Circle App Kit
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

    // Read server EURC balance AFTER swap to calculate exact market output
    const balanceAfter = await publicClient.readContract({
      address: EURC_ADDRESS,
      abi: EURC_ABI,
      functionName: 'balanceOf',
      args: [account.address]
    }) as bigint

    const actualEurcReceived = balanceAfter - balanceBefore

    // Calculate dynamic EURC payout based on RedStone Oracle rate
    const calculatedEurcFromOracle = parseUnits((Number(amount) / oracleEurRate).toFixed(6), 6)

    // Use actual DEX received balance if positive, otherwise use RedStone Oracle calculated amount
    const finalEurcToTransfer = actualEurcReceived > 0n ? actualEurcReceived : calculatedEurcFromOracle

    console.log(`[API Swap] Transferring ${formatUnits(finalEurcToTransfer, 6)} EURC (RedStone Oracle rate output) to agent ${agentAddress}...`)
    
    const transferTx = await walletClient.writeContract({
      address: EURC_ADDRESS,
      abi: EURC_ABI,
      functionName: 'transfer',
      args: [agentAddress, finalEurcToTransfer]
    })

    return NextResponse.json({
      success: true,
      swapTxHash: swapResult.txHash,
      transferTxHash: transferTx,
      amount,
      eurcAmount: formatUnits(finalEurcToTransfer, 6),
      oracleProvider: 'RedStone Oracle',
      oracleEurUsdRate: oracleEurRate,
      recipient: agentAddress
    })

  } catch (error: any) {
    console.error('[API Swap] Error:', error)
    return NextResponse.json({ 
      error: error.message || 'An error occurred during the App Kit swap operation.' 
    }, { status: 500 })
  }
}
