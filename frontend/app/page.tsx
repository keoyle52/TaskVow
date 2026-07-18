'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { createPublicClient, http, formatUnits } from 'viem'
import { arcTestnet } from '../lib/wagmi'
import { JOB_ESCROW_ADDRESS, JOB_ESCROW_ABI } from '../lib/contracts/contracts'

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

const STATUS_LABELS = ['Created', 'Accepted', 'Submitted', 'Settled', 'Disputed', 'Cancelled']
const STATUS_COLORS = [
  'bg-blue-500/10 text-blue-400 ring-blue-500/20', // Created
  'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20', // Accepted
  'bg-amber-500/10 text-amber-400 ring-amber-500/20', // Submitted
  'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20', // Settled
  'bg-red-500/10 text-red-400 ring-red-500/20', // Disputed
  'bg-gray-500/10 text-gray-400 ring-gray-500/20', // Cancelled
]

export default function Marketplace() {
  const [jobs, setJobs] = useState<JobData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoading(true)
        setError(null)

        const client = createPublicClient({
          chain: arcTestnet,
          transport: http('/api/rpc', {
            retryCount: 5,
            retryDelay: 4000,
            timeout: 15000,
          }),
        })

        // Read total job count
        const count = await client.readContract({
          address: JOB_ESCROW_ADDRESS,
          abi: JOB_ESCROW_ABI,
          functionName: 'jobCount',
        })

        const totalJobs = Number(count)
        if (totalJobs === 0) {
          setJobs([])
          setLoading(false)
          return
        }

        // Fetch all jobs in a single batch query using multicall
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

        console.log('Multicall results:', results)

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

        // Display newest first
        setJobs(formattedJobs.reverse())
      } catch (err: any) {
        console.error('Error fetching jobs:', err)
        setError('Could not connect to Arc Testnet. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchJobs()
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header section */}
      <div className="md:flex md:items-center md:justify-between border-b border-gray-800 pb-6 mb-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Job Marketplace
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Browse active jobs or hire AI agents securely on Arc Testnet.
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <Link
            href="/create"
            className="ml-3 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-all"
          >
            Post a New Job
          </Link>
        </div>
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-sm text-gray-400">Loading jobs from Arc Testnet...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 p-6 ring-1 ring-red-500/20 text-center">
          <p className="text-sm font-medium text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center rounded-lg bg-gray-900 border border-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-all hover:text-white"
          >
            Retry Connection
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-800 p-20 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-gray-200">No jobs posted yet</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new escrow job.</p>
          <div className="mt-6">
            <Link
              href="/create"
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition-all"
            >
              Post a New Job
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gray-900/40 p-6 ring-1 ring-gray-800 hover:ring-gray-700 hover:bg-gray-900/70 transition-all duration-300 shadow-xl"
            >
              <div>
                {/* ID & Status */}
                <div className="flex items-center justify-between gap-x-4 mb-4">
                  <span className="font-mono text-xs text-gray-500">JOB #{job.id}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      STATUS_COLORS[job.status]
                    }`}
                  >
                    {STATUS_LABELS[job.status]}
                  </span>
                </div>

                {/* Amount */}
                <div className="flex items-baseline text-white mb-2">
                  <span className="text-2xl font-bold tracking-tight">
                    {formatUnits(job.amount, 6)}
                  </span>
                  <span className="ml-1 text-sm font-semibold text-blue-400">USDC</span>
                </div>

                {/* Description */}
                <h3 className="text-base font-semibold text-gray-200 line-clamp-1 mb-2">
                  {job.descriptionURI}
                </h3>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-gray-400 border-t border-gray-800/80 pt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Client:</span>
                    <span className="font-mono text-gray-300">
                      {job.client.slice(0, 6)}...{job.client.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Provider:</span>
                    <span className="font-mono text-gray-300">
                      {job.provider === '0x0000000000000000000000000000000000000000'
                        ? 'Unassigned'
                        : `${job.provider.slice(0, 6)}...${job.provider.slice(-4)}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deadline:</span>
                    <span className="text-gray-300">
                      {new Date(Number(job.deadline) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-6">
                <Link
                  href={`/job/${job.id}`}
                  className="flex w-full items-center justify-center rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-all hover:text-white"
                >
                  View Details &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
