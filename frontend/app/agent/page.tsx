'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract, useWriteContract } from 'wagmi'
import { createPublicClient, http, formatUnits, parseUnits } from 'viem'
import { arcTestnet } from '@/lib/wagmi'
import {
  AGENT_REGISTRY_ADDRESS,
  AGENT_REGISTRY_ABI,
  JOB_ESCROW_ADDRESS,
  JOB_ESCROW_ABI,
  USDC_TOKEN_ADDRESS,
  USDC_ABI,
} from '@/lib/contracts/contracts'

interface JobData {
  id: number
  client: string
  provider: string
  amount: bigint
  deadline: bigint
  descriptionURI: string
  proofURI: string
  status: number
}

export default function AgentPortal() {
  const { address, isConnected, chainId } = useAccount()
  const [metadataURI, setMetadataURI] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Agent's job lists
  const [openJobs, setOpenJobs] = useState<JobData[]>([])
  const [myJobs, setMyJobs] = useState<JobData[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  // Payout preference & Swapped jobs state
  const [prefCurrency, setPrefCurrency] = useState<'USDC' | 'EURC'>('USDC')
  const [swappedJobs, setSwappedJobs] = useState<number[]>([])
  const [swapLoading, setSwapLoading] = useState<number | null>(null)

  // Load preferences from localStorage on mount/address change
  useEffect(() => {
    if (address) {
      const stored = localStorage.getItem(`taskvow_pref_currency_${address.toLowerCase()}`)
      if (stored === 'EURC' || stored === 'USDC') {
        setPrefCurrency(stored)
      } else {
        setPrefCurrency('USDC')
      }

      const storedSwapped = localStorage.getItem(`taskvow_swapped_jobs_${address.toLowerCase()}`)
      if (storedSwapped) {
        try {
          setSwappedJobs(JSON.parse(storedSwapped))
        } catch {
          setSwappedJobs([])
        }
      } else {
        setSwappedJobs([])
      }
    }
  }, [address])

  const handleSetPrefCurrency = (curr: 'USDC' | 'EURC') => {
    if (address) {
      localStorage.setItem(`taskvow_pref_currency_${address.toLowerCase()}`, curr)
      setPrefCurrency(curr)
    }
  }

  const { writeContractAsync } = useWriteContract()

  // Read agent registration info & expanded reputation from AgentRegistry
  const { data: agentInfo, refetch: refetchAgentInfo } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'agents',
    args: address ? [address] : undefined,
    query: {
      staleTime: 30000,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  })

  const isRegistered = agentInfo ? Boolean((agentInfo as any)[4]) : false
  const jobsCompletedCount = agentInfo ? Number((agentInfo as any)[1]) : 0
  const disputesLostCount = agentInfo ? Number((agentInfo as any)[2]) : 0
  const totalVolumeUSDC = agentInfo ? BigInt((agentInfo as any)[3] || 0) : 0n
  const agentMetadata = agentInfo ? (agentInfo as any)[0] : ''

  const isCorrectNetwork = chainId === arcTestnet.id

  // Fetch marketplace jobs for Agent interaction
  const fetchAgentJobs = async () => {
    try {
      setJobsLoading(true)
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http('/api/rpc', {
          retryCount: 5,
          retryDelay: 4000,
          timeout: 15000,
        }),
      })

      const count = await client.readContract({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'jobCount',
      })

      const totalJobs = Number(count)
      if (totalJobs === 0) {
        setOpenJobs([])
        setMyJobs([])
        return
      }

      const calls = []
      for (let i = 1; i <= totalJobs; i++) {
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

      const formattedJobs: JobData[] = results
        .filter((res: any) => res.status === 'success' && res.result)
        .map((res: any) => {
          const job = res.result
          return {
            id: Number(job[0]),
            client: job[1],
            provider: job[2],
            amount: job[3],
            deadline: job[4],
            descriptionURI: job[5],
            proofURI: job[6],
            status: job[7],
          }
        })

      const available = formattedJobs.filter((job) => job.status === 0)
      const assigned = formattedJobs.filter(
        (job) =>
          address &&
          job.provider.toLowerCase() === address.toLowerCase() &&
          [1, 2, 3, 4].includes(job.status)
      )

      setOpenJobs(available)
      setMyJobs(assigned)
    } catch (err) {
      console.error('Error loading agent jobs:', err)
    } finally {
      setJobsLoading(false)
    }
  }

  useEffect(() => {
    if (address) {
      fetchAgentJobs()
      refetchAgentInfo()
    }
  }, [address])

  // Register Agent Handler
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!metadataURI.trim()) {
      setErrorMsg('Agent description metadata URI cannot be empty.')
      return
    }

    try {
      setLoading(true)
      setErrorMsg(null)
      setTxHash(null)

      const hash = await writeContractAsync({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'registerAgent',
        args: [metadataURI],
      })

      setTxHash(hash)
      setTimeout(() => {
        refetchAgentInfo()
        setLoading(false)
        setMetadataURI('')
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Registration transaction failed.')
      setLoading(false)
    }
  }

  // Deactivate Agent Handler
  const handleDeactivate = async () => {
    try {
      setLoading(true)
      setErrorMsg(null)
      setTxHash(null)

      const hash = await writeContractAsync({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: 'deactivateAgent',
      })

      setTxHash(hash)
      setTimeout(() => {
        refetchAgentInfo()
        setLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Deactivation transaction failed.')
      setLoading(false)
    }
  }

  // Accept Job Handler (with collateral staking approval)
  const handleAcceptJob = async (jobId: number, amount: bigint) => {
    try {
      setErrorMsg(null)
      const stakeAmount = (amount * 1000n) / 10000n // 10% collateral staking

      if (stakeAmount > 0n) {
        alert(`Accepting Job #${jobId} requires 10% USDC collateral staking (${formatUnits(stakeAmount, 6)} USDC).\n\nStep 1: Approving USDC collateral...`)
        const approveHash = await writeContractAsync({
          address: USDC_TOKEN_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [JOB_ESCROW_ADDRESS, stakeAmount],
        })

        const client = createPublicClient({ chain: arcTestnet, transport: http('/api/rpc') })
        await client.waitForTransactionReceipt({ hash: approveHash })
      }

      alert(`Step 2: Confirming acceptJob transaction...`)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'acceptJob',
        args: [BigInt(jobId)],
      })
      alert(`Job accepted! Tx Hash: ${hash}`)
      setTimeout(() => {
        fetchAgentJobs()
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Could not accept job: ${err.message || err}`)
    }
  }

  // Submit Deliverable Handler
  const handleSubmitDeliverable = async (jobId: number) => {
    const proof = prompt('Enter the delivery proof URL or description details (IPFS hash or link):')
    if (!proof) return

    try {
      setErrorMsg(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'submitDeliverable',
        args: [BigInt(jobId), proof],
      })
      alert(`Deliverable submitted. Tx Hash: ${hash}`)
      setTimeout(() => {
        fetchAgentJobs()
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Submission failed: ${err.message || err}`)
    }
  }

  // App Kit Swap Handler
  const handleAppKitSwap = async (jobId: number, amount: string) => {
    try {
      setSwapLoading(jobId)
      setErrorMsg(null)

      const parsedAmount = parseUnits(amount, 6)
      const serverAddress = '0x0c93FB2D1BD2F15c12fD5fCCe14918D2dE6Fd9e6'

      alert(`Initiating 1:1 Swap for Job #${jobId}.\n\nStep 1: Confirming transfer of ${amount} USDC from your wallet to the App Kit Swap pool...`)

      const depositTxHash = await writeContractAsync({
        address: USDC_TOKEN_ADDRESS,
        abi: USDC_ABI,
        functionName: 'transfer',
        args: [serverAddress, parsedAmount],
      })

      alert(`Step 1 Complete! USDC deposit confirmed.\n\nStep 2: Circle App Kit is now executing the USDC -> EURC swap...`)

      const response = await fetch('/api/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, agentAddress: address, userDepositTxHash: depositTxHash }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to execute swap on the server.')
      }

      alert(`Success! App Kit Swap completed successfully.\n\nYour ${amount} USDC earnings have been swapped to EURC and delivered to your wallet!\n\nApp Kit Swap Tx: ${data.swapTxHash.slice(0, 15)}...\nEURC Delivery Tx: ${data.transferTxHash.slice(0, 15)}...`)
      
      const newSwapped = [...swappedJobs, jobId]
      setSwappedJobs(newSwapped)
      if (address) {
        localStorage.setItem(`taskvow_swapped_jobs_${address.toLowerCase()}`, JSON.stringify(newSwapped))
      }
    } catch (err: any) {
      console.error(err)
      alert(`Swap failed: ${err.message || err}`)
    } finally {
      setSwapLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="border-b border-gray-800 pb-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Agent Portal</h1>
        <p className="mt-2 text-sm text-gray-400">
          Register your agent profile, accept contract work, stake collateral, and view on-chain reputation stats.
        </p>
      </div>

      {!isConnected ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-20 text-center">
          <h3 className="text-sm font-semibold text-gray-200">Connect wallet to access portal</h3>
          <p className="mt-1 text-sm text-gray-500">
            Agents must connect their wallets to view active assignments or manage their profile.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: Registry Profile & Reputation */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-4">Agent Portfolio & Reputation</h2>

              {isRegistered ? (
                /* Registered State */
                <div className="space-y-6">
                  <div className="rounded-xl bg-emerald-500/5 p-4 ring-1 ring-emerald-500/20">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Active Registered Agent
                    </span>
                    <p className="mt-2 text-xs text-gray-400 font-mono break-all">{address}</p>
                  </div>

                  {/* Expanded Reputation Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 py-2">
                    <div className="rounded-xl bg-gray-950 p-3 text-center border border-gray-800">
                      <span className="block text-[10px] text-gray-500 font-semibold uppercase">Completed</span>
                      <span className="text-lg font-bold text-emerald-400">{jobsCompletedCount}</span>
                    </div>
                    <div className="rounded-xl bg-gray-950 p-3 text-center border border-gray-800">
                      <span className="block text-[10px] text-gray-500 font-semibold uppercase">Disputes Lost</span>
                      <span className={`text-lg font-bold ${disputesLostCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                        {disputesLostCount}
                      </span>
                    </div>
                    <div className="rounded-xl bg-gray-950 p-3 text-center border border-gray-800">
                      <span className="block text-[10px] text-gray-500 font-semibold uppercase">Volume</span>
                      <span className="text-sm font-bold text-blue-400 font-mono truncate block">
                        {Number(formatUnits(totalVolumeUSDC, 6)).toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col border-b border-gray-800 pb-2">
                      <span className="text-xs text-gray-500">Metadata / Capabilities:</span>
                      <span className="text-xs text-gray-300 mt-1 italic break-words">{agentMetadata}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDeactivate}
                    disabled={loading}
                    className="w-full rounded-lg bg-red-600/10 px-4 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-600/20 transition-all"
                  >
                    {loading ? 'Processing...' : 'Deactivate Agent Profile'}
                  </button>
                </div>
              ) : (
                /* Unregistered state */
                <form onSubmit={handleRegister} className="space-y-4">
                  <p className="text-xs text-gray-500">
                    You are not registered in the AgentRegistry. Register your details to accept on-chain jobs.
                  </p>
                  <div>
                    <label htmlFor="agent-meta" className="block text-xs font-semibold text-gray-300">
                      Agent Profile URI / Capabilities
                    </label>
                    <textarea
                      id="agent-meta"
                      rows={3}
                      value={metadataURI}
                      onChange={(e) => setMetadataURI(e.target.value)}
                      placeholder="e.g. Specialized NLP analysis agent with 99.8% precision"
                      className="mt-2 block w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-blue-500 focus:ring-0 focus:outline-hidden"
                    />
                  </div>

                  {errorMsg && <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>}
                  {txHash && (
                    <p className="text-xs text-blue-400 font-semibold">
                      Tx: <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline">{txHash.slice(0, 10)}...</a>
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                  >
                    {loading ? 'Registering...' : 'Register as Active Agent'}
                  </button>
                </form>
              )}
            </div>

            {isRegistered && (
              <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl space-y-4">
                <h2 className="text-lg font-bold text-white">Payout Preference</h2>
                <p className="text-xs text-gray-400">
                  Select your preferred settlement currency. When jobs are released, you can swap your USDC payout.
                </p>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer">
                    <input
                      type="radio"
                      name="prefCurrency"
                      value="USDC"
                      checked={prefCurrency === 'USDC'}
                      onChange={() => handleSetPrefCurrency('USDC')}
                      className="accent-blue-500"
                    />
                    <span>USDC (Default)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-200 cursor-pointer">
                    <input
                      type="radio"
                      name="prefCurrency"
                      value="EURC"
                      checked={prefCurrency === 'EURC'}
                      onChange={() => handleSetPrefCurrency('EURC')}
                      className="accent-blue-500"
                    />
                    <span>EURC (App Kit Swap)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Worklists */}
          <div className="lg:col-span-2 space-y-8">
            {/* Active Assignments */}
            <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-4">My Assignments</h2>

              {jobsLoading ? (
                <p className="text-xs text-gray-500">Loading assignments...</p>
              ) : myJobs.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 italic">No active or pending assignments.</p>
              ) : (
                <div className="space-y-4">
                  {myJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl bg-gray-950 p-4 border border-gray-800 gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-500">JOB #{job.id}</span>
                          <span className="text-[10px] uppercase font-bold text-blue-400">
                            {job.status === 1 && 'Accepted (In Progress)'}
                            {job.status === 2 && 'Submitted (Pending Approval)'}
                            {job.status === 3 && 'Settled (Funds Released)'}
                            {job.status === 4 && 'Disputed'}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-gray-200 mt-1">{job.descriptionURI}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Budget: {formatUnits(job.amount, 6)} USDC</p>
                      </div>

                      <div className="flex gap-2">
                        {job.status === 1 && (
                          <button
                            onClick={() => handleSubmitDeliverable(job.id)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                          >
                            Submit Deliverable
                          </button>
                        )}
                        {job.status === 3 && prefCurrency === 'EURC' && (
                          <>
                            {swappedJobs.includes(job.id) ? (
                              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                                Swapped to EURC
                              </span>
                            ) : (
                              <button
                                onClick={() => handleAppKitSwap(job.id, formatUnits(job.amount, 6))}
                                disabled={swapLoading === job.id}
                                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition-all flex items-center gap-1.5"
                              >
                                {swapLoading === job.id && (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                )}
                                Swap to EURC
                              </button>
                            )}
                          </>
                        )}
                        {job.status === 3 && prefCurrency === 'USDC' && (
                          <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-800">
                            Paid in USDC
                          </span>
                        )}
                        <Link
                          href={`/job/${job.id}`}
                          className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-all"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Browse & Accept Jobs */}
            <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-4">Browse Open Requests</h2>

              {jobsLoading ? (
                <p className="text-xs text-gray-500">Loading requests...</p>
              ) : openJobs.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 italic">No open jobs currently available.</p>
              ) : (
                <div className="space-y-4">
                  {openJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl bg-gray-950 p-4 border border-gray-800 gap-4"
                    >
                      <div>
                        <span className="font-mono text-xs text-gray-500">JOB #{job.id}</span>
                        <h4 className="text-sm font-semibold text-gray-200 mt-1">{job.descriptionURI}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Budget: <span className="font-semibold text-blue-400">{formatUnits(job.amount, 6)} USDC</span>
                          <span className="text-gray-500 ml-2">(Stake required: {formatUnits((job.amount * 1000n) / 10000n, 6)} USDC)</span>
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {isRegistered ? (
                          <button
                            onClick={() => handleAcceptJob(job.id, job.amount)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                          >
                            Accept Job (10% Stake)
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-500 max-w-28 text-center italic">
                            Register profile to accept
                          </span>
                        )}
                        <Link
                          href={`/job/${job.id}`}
                          className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-all"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
