export const AGENT_REGISTRY_ADDRESS = "0x1c0bB4bD0444CeB477Ed24A9c4cb3d8E5DE1967c" as const;
export const JOB_ESCROW_ADDRESS = "0xCC8C461E6131b121e1c92D3e70C4aF98523B1121" as const;
export const USDC_TOKEN_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export const AGENT_REGISTRY_ABI = [
  {
    "type": "function",
    "name": "registerAgent",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "metadataURI", "type": "string" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "deactivateAgent",
    "stateMutability": "nonpayable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "agents",
    "stateMutability": "view",
    "inputs": [{ "name": "agentAddress", "type": "address" }],
    "outputs": [
      { "name": "metadataURI", "type": "string" },
      { "name": "jobsCompleted", "type": "uint256" },
      { "name": "active", "type": "bool" }
    ]
  },
  {
    "type": "event",
    "name": "AgentRegistered",
    "inputs": [
      { "indexed": true, "name": "agent", "type": "address" },
      { "indexed": false, "name": "metadataURI", "type": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AgentDeactivated",
    "inputs": [{ "indexed": true, "name": "agent", "type": "address" }],
    "anonymous": false
  }
] as const;

export const JOB_ESCROW_ABI = [
  {
    "type": "function",
    "name": "createJob",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "amount", "type": "uint256" },
      { "name": "deadline", "type": "uint256" },
      { "name": "descriptionURI", "type": "string" }
    ],
    "outputs": [{ "name": "jobId", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "acceptJob",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "submitDeliverable",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "jobId", "type": "uint256" },
      { "name": "proofURI", "type": "string" }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "approveAndRelease",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "raiseDispute",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "resolveDispute",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "jobId", "type": "uint256" },
      { "name": "releaseToAgent", "type": "bool" }
    ],
    "outputs": []
  },
  {
    "type": "function",
    "name": "cancelJob",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": []
  },
  {
    "type": "function",
    "name": "jobs",
    "stateMutability": "view",
    "inputs": [{ "name": "jobId", "type": "uint256" }],
    "outputs": [
      { "name": "id", "type": "uint256" },
      { "name": "client", "type": "address" },
      { "name": "provider", "type": "address" },
      { "name": "amount", "type": "uint256" },
      { "name": "deadline", "type": "uint256" },
      { "name": "descriptionURI", "type": "string" },
      { "name": "proofURI", "type": "string" },
      { "name": "status", "type": "uint8" }
    ]
  },
  {
    "type": "function",
    "name": "jobCount",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "admin",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address" }]
  },
  {
    "type": "event",
    "name": "JobCreated",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": true, "name": "client", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" },
      { "indexed": false, "name": "deadline", "type": "uint256" },
      { "indexed": false, "name": "descriptionURI", "type": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobAccepted",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": true, "name": "provider", "type": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DeliverableSubmitted",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": false, "name": "proofURI", "type": "string" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobSettled",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": true, "name": "provider", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobDisputed",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": true, "name": "raisedBy", "type": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobDisputeResolved",
    "inputs": [
      { "indexed": true, "name": "jobId", "type": "uint256" },
      { "indexed": false, "name": "releaseToAgent", "type": "bool" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JobCancelled",
    "inputs": [{ "indexed": true, "name": "jobId", "type": "uint256" }],
    "anonymous": false
  }
] as const;

export const USDC_ABI = [
  {
    "type": "function",
    "name": "approve",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function",
    "name": "allowance",
    "stateMutability": "view",
    "inputs": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "balanceOf",
    "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "transfer",
    "stateMutability": "nonpayable",
    "inputs": [
      { "name": "recipient", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool" }]
  }
] as const;
