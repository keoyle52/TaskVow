'use client'

import React, { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useAccount, useWriteContract } from 'wagmi'
import { createPublicClient, http, formatUnits } from 'viem'
import { arcTestnet } from '@/lib/wagmi'
import { JOB_ESCROW_ADDRESS, JOB_ESCROW_ABI } from '@/lib/contracts/contracts'

interface JobData {
  id: number
  client: string
  provider: string
  amount: bigint
  stakeAmount: bigint
  deadline: bigint
  submittedAt: bigint
  descriptionURI: string
  proofURI: string
  status: number
}

const STATUS_LABELS = ['Created', 'Accepted', 'Submitted', 'Settled', 'Disputed', 'Cancelled']
const STATUS_COLORS = [
  'bg-blue-500/10 text-blue-400 ring-blue-500/20', // Created
  'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20', // Accepted
  'bg-amber-500/10 text-amber-400 ring-amber-500/20', // Submitted
  'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20', // Settled
  'bg-red-500/10 text-red-400 ring-red-500/20', // Disputed
  'bg-gray-500/10 text-gray-400 ring-gray-500/20', // Cancelled
]

export default function JobDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobIdString } = use(params)
  const jobId = Number(jobIdString)

  const { address, isConnected, chainId } = useAccount()
  const [job, setJob] = useState<JobData | null>(null)
  const [adminAddress, setAdminAddress] = useState<string | null>(null)
  const [releaseTimeoutSec, setReleaseTimeoutSec] = useState<number>(3 * 24 * 3600)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Transaction feedback
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txPending, setTxPending] = useState(false)

  const { writeContractAsync } = useWriteContract()
  const isCorrectNetwork = chainId === arcTestnet.id

  const fetchJobDetails = async () => {
    try {
      setLoading(true)
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http('/api/rpc', {
          retryCount: 5,
          retryDelay: 4000,
          timeout: 15000,
        }),
      })

      // Read admin address & release timeout
      const [admin, timeout] = await Promise.all([
        client.readContract({
          address: JOB_ESCROW_ADDRESS,
          abi: JOB_ESCROW_ABI,
          functionName: 'admin',
        }).catch(() => null),
        client.readContract({
          address: JOB_ESCROW_ADDRESS,
          abi: JOB_ESCROW_ABI,
          functionName: 'releaseTimeout',
        }).catch(() => 259200n)
      ])
      
      if (admin) setAdminAddress(admin as string)
      if (timeout) setReleaseTimeoutSec(Number(timeout))

      // Read job data
      const data = await client.readContract({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'jobs',
        args: [BigInt(jobId)],
      })

      if (!data || (data as any)[1] === '0x0000000000000000000000000000000000000000') {
        setError('Job does not exist.')
        setJob(null)
      } else {
        setJob({
          id: Number((data as any)[0]),
          client: (data as any)[1],
          provider: (data as any)[2],
          amount: (data as any)[3],
          stakeAmount: (data as any)[4] || 0n,
          deadline: (data as any)[5],
          submittedAt: (data as any)[6] || 0n,
          descriptionURI: (data as any)[7],
          proofURI: (data as any)[8],
          status: (data as any)[9],
        })
      }
    } catch (err: any) {
      console.error(err)
      setError('Could not load job details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobDetails()
  }, [jobId])

  // Approve & Release Handler
  const handleApproveAndRelease = async () => {
    if (!job) return
    try {
      setTxPending(true)
      setTxHash(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'approveAndRelease',
        args: [BigInt(job.id)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setTxPending(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Transaction failed: ${err.message || err}`)
      setTxPending(false)
    }
  }

  // Claim Timeout Release Handler
  const handleClaimTimeoutRelease = async () => {
    if (!job) return
    try {
      setTxPending(true)
      setTxHash(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'claimTimeoutRelease',
        args: [BigInt(job.id)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setTxPending(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Timeout release failed: ${err.message || err}`)
      setTxPending(false)
    }
  }

  // Raise Dispute Handler
  const handleRaiseDispute = async () => {
    if (!job) return
    try {
      setTxPending(true)
      setTxHash(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(job.id)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setTxPending(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Transaction failed: ${err.message || err}`)
      setTxPending(false)
    }
  }

  // Resolve Dispute Handler (Admin)
  const handleResolveDispute = async (releaseToAgent: boolean) => {
    if (!job) return
    try {
      setTxPending(true)
      setTxHash(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(job.id), releaseToAgent],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setTxPending(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Transaction failed: ${err.message || err}`)
      setTxPending(false)
    }
  }

  // Cancel Job Handler
  const handleCancelJob = async () => {
    if (!job) return
    try {
      setTxPending(true)
      setTxHash(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'cancelJob',
        args: [BigInt(job.id)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setTxPending(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      alert(`Transaction failed: ${err.message || err}`)
      setTxPending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-400">Loading job details...</p>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-white mb-2">Error</h2>
        <p className="text-sm text-gray-400 mb-6">{error || 'Job not found.'}</p>
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-all"
        >
          Back to Marketplace
        </Link>
      </div>
    )
  }

  const isClient = address && job.client.toLowerCase() === address.toLowerCase()
  const isProvider = address && job.provider.toLowerCase() === address.toLowerCase()
  const isAdmin = address && adminAddress && adminAddress.toLowerCase() === address.toLowerCase()

  const isDeadlinePassed = Number(job.deadline) < Date.now() / 1000
  const isTimeoutElapsed = job.submittedAt > 0n && (Date.now() / 1000 >= Number(job.submittedAt) + releaseTimeoutSec)

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Back Button */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-400 hover:text-white transition-all">
          &larr; Back to Marketplace
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {/* Main Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl bg-gray-900/40 p-8 ring-1 ring-gray-800 shadow-2xl space-y-6">
            <div>
              <span className="font-mono text-xs text-gray-500">JOB CONTRACT #{job.id}</span>
              <h1 className="text-2xl font-bold text-white mt-1">{job.descriptionURI}</h1>
            </div>

            {/* Budget Box */}
            <div className="rounded-xl bg-gray-950 p-4 border border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Locked Escrow Budget</p>
                <div className="flex items-baseline mt-1">
                  <span className="text-3xl font-bold text-white">{formatUnits(job.amount, 6)}</span>
                  <span className="ml-1 text-sm font-semibold text-blue-400">USDC</span>
                </div>
                {job.stakeAmount > 0n && (
                  <p className="text-[11px] text-emerald-400 mt-1">
                    Agent Collateral Staked: +{formatUnits(job.stakeAmount, 6)} USDC
                  </p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                  STATUS_COLORS[job.status]
                }`}
              >
                {STATUS_LABELS[job.status]}
              </span>
            </div>

            {/* Deliverable Proof Section */}
            {job.proofURI && (
              <div className="rounded-xl bg-blue-500/5 p-5 ring-1 ring-blue-500/10 border border-blue-500/10 space-y-2">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Submitted Deliverable Proof</h3>
                <p className="text-sm text-gray-200">{job.proofURI}</p>
                {job.submittedAt > 0n && (
                  <p className="text-[11px] text-gray-400 pt-1">
                    Submitted: {new Date(Number(job.submittedAt) * 1000).toLocaleString()} (Auto-release after {Math.round(releaseTimeoutSec / 86400)} days)
                  </p>
                )}
              </div>
            )}

            {/* Swap Notice for Provider */}
            {job.status === 3 && isProvider && (
              <div className="rounded-xl bg-amber-500/5 p-5 ring-1 ring-amber-500/10 border border-amber-500/10 space-y-2">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Escrow Released</h3>
                <p className="text-xs text-gray-300">
                  Your payout of {formatUnits(job.amount, 6)} USDC (+ collateral stake) has been released to your wallet.
                </p>
              </div>
            )}

            {/* Addresses */}
            <div className="space-y-3 pt-4 border-t border-gray-800/80 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Employer Address (Client)</span>
                <span className="font-mono text-gray-300 break-all">{job.client}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">AI Agent Address (Provider)</span>
                <span className="font-mono text-gray-300 break-all">
                  {job.provider === '0x0000000000000000000000000000000000000000'
                    ? 'Unassigned / Open to Applicants'
                    : job.provider}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Job Expiration Date</span>
                <span className="text-gray-300">
                  {new Date(Number(job.deadline) * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions & Lifecycle Sidebar */}
        <div className="md:col-span-1 space-y-6">
          {/* Timeline */}
          <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">Job Progress Timeline</h3>
            <div className="space-y-6">
              {[
                { label: 'Job Created & Funded', reached: job.status >= 0 },
                { label: 'Agent Assigned & Staked', reached: job.status >= 1 && job.status !== 5 },
                { label: 'Deliverable Submitted', reached: job.status >= 2 && job.status !== 5 },
                { label: 'Funds Settled', reached: job.status === 3 },
              ].map((step, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                      step.reached
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-gray-800 bg-gray-950 text-gray-600'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span className={`text-xs ${step.reached ? 'text-gray-200' : 'text-gray-600'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Context Actions */}
          {isConnected && isCorrectNetwork && (
            <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl space-y-4">
              <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Portal Actions</h3>

              {txPending && (
                <div className="flex items-center gap-2 text-xs text-blue-400">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span>Processing transaction...</span>
                </div>
              )}

              {/* Client Releases Funds */}
              {isClient && job.status === 2 && !txPending && (
                <button
                  onClick={handleApproveAndRelease}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all"
                >
                  Approve Work & Release USDC
                </button>
              )}

              {/* Timeout Release Claim (Provider or anyone if submitted + timeout passed) */}
              {job.status === 2 && isTimeoutElapsed && !txPending && (
                <button
                  onClick={handleClaimTimeoutRelease}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-all"
                >
                  Claim Timeout Release
                </button>
              )}

              {/* Client Cancels after deadline */}
              {isClient && isDeadlinePassed && [0, 1].includes(job.status) && !txPending && (
                <button
                  onClick={handleCancelJob}
                  className="w-full rounded-lg bg-red-600/10 px-4 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-600/20 transition-all"
                >
                  Cancel Job & Refund USDC
                </button>
              )}

              {/* Dispute Option for Client/Provider */}
              {(isClient || isProvider) && [1, 2].includes(job.status) && !txPending && (
                <button
                  onClick={handleRaiseDispute}
                  className="w-full rounded-lg bg-red-600/10 px-4 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-600/20 transition-all"
                >
                  Raise Dispute (Arbitrate)
                </button>
              )}

              {/* Admin Disputes Resolutions */}
              {isAdmin && job.status === 4 && !txPending && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Admin Dispute Tools</span>
                  <button
                    onClick={() => handleResolveDispute(true)}
                    className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-all"
                  >
                    Resolve: Pay Provider (Agent)
                  </button>
                  <button
                    onClick={() => handleResolveDispute(false)}
                    className="w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-all"
                  >
                    Resolve: Refund Client (Employer)
                  </button>
                </div>
              )}

              {/* Explorer link */}
              {txHash && (
                <div className="text-[10px] text-gray-500 mt-2">
                  <span>Last Tx: </span>
                  <a
                    href={`https://testnet.arcscan.app/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-blue-400 hover:underline"
                  >
                    {txHash.slice(0, 12)}...
                  </a>
                </div>
              )}

              {!isClient && !isProvider && !isAdmin && (
                <p className="text-xs text-gray-500 italic">No actions available for your connected wallet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
