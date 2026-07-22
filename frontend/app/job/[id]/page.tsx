'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAccount, useWriteContract } from 'wagmi'
import { createPublicClient, http, formatUnits } from 'viem'
import { arcTestnet } from '@/lib/wagmi'
import { JOB_ESCROW_ADDRESS, JOB_ESCROW_ABI } from '@/lib/contracts/contracts'

interface JobDetails {
  id: number
  client: string
  provider: string
  amount: bigint
  deadline: bigint
  descriptionURI: string
  proofURI: string
  status: number
}

const STATUS_LABELS = ['Created', 'Accepted', 'Submitted', 'Settled', 'Disputed', 'Cancelled']
const STATUS_COLORS = [
  'bg-blue-500/10 text-blue-400 ring-blue-500/20',
  'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
  'bg-amber-500/10 text-amber-400 ring-amber-500/20',
  'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  'bg-red-500/10 text-red-400 ring-red-500/20',
  'bg-gray-500/10 text-gray-400 ring-gray-500/20',
]

function formatUserError(err: any): string {
  const msg = err?.shortMessage || err?.message || String(err)
  if (msg.includes('user rejected') || msg.includes('User rejected')) {
    return 'Transaction was cancelled in your wallet.'
  }
  return err?.shortMessage || msg.split('\n')[0] || 'Contract action failed.'
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.id as string

  const { address, isConnected, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [job, setJob] = useState<JobDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const [proofInput, setProofInput] = useState('')
  const [adminAddress, setAdminAddress] = useState<string | null>(null)

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

      const admin = await client.readContract({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'admin',
      }).catch(() => null)
      
      if (admin) setAdminAddress(admin as string)

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
          client: String((data as any)[1]),
          provider: String((data as any)[2]),
          amount: BigInt((data as any)[3]),
          deadline: BigInt((data as any)[4]),
          descriptionURI: String((data as any)[5]),
          proofURI: String((data as any)[6]),
          status: Number((data as any)[7]),
        })
      }
    } catch (err: any) {
      console.error('Error fetching job detail:', err)
      setError('Failed to fetch job details from Arc Testnet.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (jobId) {
      fetchJobDetails()
    }
  }, [jobId])

  // Action Handlers
  const handleAcceptJob = async () => {
    if (!isConnected) return alert('Please connect wallet.')
    if (!isCorrectNetwork) return alert('Please switch to Arc Testnet.')

    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'acceptJob',
        args: [BigInt(jobId)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proofInput.trim()) return alert('Proof URI cannot be empty.')
    if (!isConnected) return alert('Please connect wallet.')

    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'submitDeliverable',
        args: [BigInt(jobId), proofInput],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  const handleApproveAndRelease = async () => {
    if (!isConnected) return alert('Please connect wallet.')
    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'approveAndRelease',
        args: [BigInt(jobId)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  const handleRaiseDispute = async () => {
    if (!isConnected) return alert('Please connect wallet.')
    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(jobId)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  const handleResolveDispute = async (releaseToAgent: boolean) => {
    if (!isConnected) return alert('Please connect wallet.')
    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(jobId), releaseToAgent],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  const handleCancelJob = async () => {
    if (!isConnected) return alert('Please connect wallet.')
    try {
      setActionLoading(true)
      setError(null)
      const hash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'cancelJob',
        args: [BigInt(jobId)],
      })
      setTxHash(hash)
      setTimeout(() => {
        fetchJobDetails()
        setActionLoading(false)
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setError(formatUserError(err))
      setActionLoading(false)
    }
  }

  // Role checks
  const isClient = address && job && address.toLowerCase() === job.client.toLowerCase()
  const isProvider = address && job && address.toLowerCase() === job.provider.toLowerCase()
  const isAdmin = address && adminAddress && address.toLowerCase() === adminAddress.toLowerCase()

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back button */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-white transition-all"
        >
          &larr; Back to Marketplace
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-400">Fetching Escrow Details...</p>
        </div>
      ) : error || !job ? (
        <div className="rounded-xl bg-red-500/10 p-6 ring-1 ring-red-500/20 text-center">
          <p className="text-sm font-medium text-red-400">{error || 'Job not found.'}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header Card */}
          <div className="rounded-2xl bg-gray-900/40 p-8 ring-1 ring-gray-800 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-6 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500">JOB ESCROW #{job.id}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUS_COLORS[job.status] || STATUS_COLORS[0]
                    }`}
                  >
                    {STATUS_LABELS[job.status] || 'Unknown'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-white mt-2">{job.descriptionURI}</h1>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-gray-500 block">Escrow Amount</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-3xl font-bold text-white font-mono">
                    {formatUnits(job.amount, 6)}
                  </span>
                  <span className="text-sm font-semibold text-blue-400">USDC</span>
                </div>
              </div>
            </div>

            {/* Address Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-950 p-4 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase block mb-1">
                  Client (Job Poster)
                </span>
                <span className="font-mono text-xs text-gray-200 break-all">{job.client}</span>
                {isClient && (
                  <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                    YOU
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-gray-950 p-4 border border-gray-800">
                <span className="text-xs text-gray-500 font-semibold uppercase block mb-1">
                  Assigned Agent (Provider)
                </span>
                {job.provider === '0x0000000000000000000000000000000000000000' ? (
                  <span className="text-xs text-amber-400 italic">Unassigned (Open for Agents)</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-200 break-all">{job.provider}</span>
                    {isProvider && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        YOU
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Deadline */}
            <div className="mt-6 flex flex-col sm:flex-row justify-between text-xs text-gray-400 border-t border-gray-800/80 pt-4">
              <div>
                <span className="text-gray-500">Job Expiration Deadline: </span>
                <span className="text-gray-200 font-semibold">
                  {new Date(Number(job.deadline) * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Submission / Deliverable Proof Card */}
          {job.proofURI && (
            <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl">
              <h3 className="text-sm font-bold text-white mb-2">Submitted Deliverable Proof</h3>
              <div className="rounded-xl bg-gray-950 p-4 border border-gray-800">
                <p className="text-xs text-gray-300 font-mono break-all">{job.proofURI}</p>
              </div>
            </div>
          )}

          {/* Action Control Panel */}
          <div className="rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 shadow-2xl space-y-6">
            <h3 className="text-base font-bold text-white">Escrow Management Panel</h3>

            {txHash && (
              <div className="rounded-lg bg-blue-500/10 p-4 ring-1 ring-blue-500/20">
                <p className="text-xs text-blue-400 font-medium">
                  Transaction Sent: <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer" className="underline font-mono">{txHash}</a>
                </p>
              </div>
            )}

            {/* Action 1: Accept Job (Unassigned & Open) */}
            {job.status === 0 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  This job is currently open. Registered AI Agents can accept this job to start execution.
                </p>
                <button
                  onClick={handleAcceptJob}
                  disabled={actionLoading}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                >
                  {actionLoading ? 'Processing...' : 'Accept Job'}
                </button>
              </div>
            )}

            {/* Action 2: Submit Deliverable (Assigned Agent) */}
            {job.status === 1 && isProvider && (
              <form onSubmit={handleSubmitDeliverable} className="space-y-4">
                <div>
                  <label htmlFor="proof" className="block text-xs font-semibold text-gray-300">
                    Deliverable Proof URI / Link / Output
                  </label>
                  <input
                    type="text"
                    id="proof"
                    value={proofInput}
                    onChange={(e) => setProofInput(e.target.value)}
                    placeholder="https://ipfs.io/ipfs/... or Github commit hash"
                    className="mt-2 block w-full rounded-lg bg-gray-950 border border-gray-800 px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-blue-500 focus:ring-0 focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 transition-all"
                >
                  {actionLoading ? 'Submitting...' : 'Submit Deliverable'}
                </button>
              </form>
            )}

            {/* Action 3: Client Approve & Release Funds */}
            {job.status === 2 && isClient && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  The agent has submitted the deliverable. Review the proof above and release the USDC escrow payment.
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={handleApproveAndRelease}
                    disabled={actionLoading}
                    className="rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all"
                  >
                    {actionLoading ? 'Releasing...' : 'Approve & Release Payment'}
                  </button>
                  <button
                    onClick={handleRaiseDispute}
                    disabled={actionLoading}
                    className="rounded-lg bg-red-600/10 px-6 py-2.5 text-xs font-semibold text-red-400 ring-1 ring-inset ring-red-500/20 hover:bg-red-600/20 transition-all"
                  >
                    Raise Dispute
                  </button>
                </div>
              </div>
            )}

            {/* Action 4: Dispute Resolution (Admin/Arbiter) */}
            {job.status === 4 && (
              <div className="space-y-4">
                <p className="text-xs text-amber-400 font-semibold">
                  A dispute has been raised for this escrow.
                </p>
                {isAdmin ? (
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleResolveDispute(true)}
                      disabled={actionLoading}
                      className="rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-all"
                    >
                      Resolve: Release Funds to Agent
                    </button>
                    <button
                      onClick={() => handleResolveDispute(false)}
                      disabled={actionLoading}
                      className="rounded-lg bg-red-600 px-6 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition-all"
                    >
                      Resolve: Refund Client
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    Waiting for the contract admin to resolve the dispute.
                  </p>
                )}
              </div>
            )}

            {/* Action 5: Cancel Job (Client before deadline/acceptance) */}
            {job.status === 0 && isClient && (
              <div className="pt-4 border-t border-gray-800">
                <button
                  onClick={handleCancelJob}
                  disabled={actionLoading}
                  className="rounded-lg bg-gray-900 border border-gray-800 px-4 py-2 text-xs font-semibold text-gray-400 hover:bg-gray-800 hover:text-white transition-all"
                >
                  Cancel Escrow & Refund USDC
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
