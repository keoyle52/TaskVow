const { createPublicClient, http } = require('viem')

const JOB_ESCROW_ADDRESS = '0xCC8C461E6131b121e1c92D3e70C4aF98523B1121'
const JOB_ESCROW_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "jobs",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "client",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "provider",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "descriptionURI",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "proofURI",
        "type": "string"
      },
      {
        "internalType": "enum JobEscrow.JobStatus",
        "name": "status",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "jobCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

const arcTestnet = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
  },
}

async function run() {
  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  })

  const count = await client.readContract({
    address: JOB_ESCROW_ADDRESS,
    abi: JOB_ESCROW_ABI,
    functionName: 'jobCount',
  })

  console.log('On-chain jobCount:', count)

  const calls = []
  for (let i = 1; i <= Number(count); i++) {
    calls.push({
      address: JOB_ESCROW_ADDRESS,
      abi: JOB_ESCROW_ABI,
      functionName: 'jobs',
      args: [BigInt(i)],
    })
  }

  const results = await client.multicall({
    contracts: calls,
  })

  console.log('Multicall raw results:', JSON.stringify(results, null, 2))
}

run().catch(console.error)
