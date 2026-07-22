'use client'

import React, { useEffect, useState } from 'react'
import { createPublicClient, http, formatUnits } from 'viem'
import { arcTestnet } from '@/lib/wagmi'
import { JOB_ESCROW_ADDRESS, JOB_ESCROW_ABI, USDC_TOKEN_ADDRESS, USDC_ABI } from '@/lib/contracts/contracts'

export default function AnalyticsSummary() {
  const [tvlUSDC, setTvlUSDC] = useState<string>('0.00')
  const [totalJobs, setTotalJobs] = useState<number>(0)
  const [activeJobsCount, setActiveJobsCount] = useState<number>(0)
  const [completionRate, setCompletionRate] = useState<string>('0%')
  const [loading, setLoading] = useState<boolean>(true)

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const client = createPublicClient({
        chain: arcTestnet,
        transport: http('/api/rpc', {
          retryCount: 3,
          retryDelay: 2000,
        }),
      })

      // 1. Fetch TVL (USDC balance of escrow contract)
      const balance = await client.readContract({
        address: USDC_TOKEN_ADDRESS,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [JOB_ESCROW_ADDRESS],
      }).catch(() => 0n)

      setTvlUSDC(formatUnits(balance, 6))

      // 2. Fetch Total Job Count
      const count = await client.readContract({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'jobCount',
      }).catch(() => 0n)

      const numTotal = Number(count)
      setTotalJobs(numTotal)

      if (numTotal === 0) {
        setActiveJobsCount(0)
        setCompletionRate('100%')
        return
      }

      // 3. Batch query job statuses to calculate Active Jobs and Completion Rate
      const calls = []
      for (let i = 1; i <= numTotal; i++) {
        calls.push({
          address: JOB_ESCROW_ADDRESS,
          abi: JOB_ESCROW_ABI,
          functionName: 'jobs',
          args: [BigInt(i)],
        })
      }

      const results = await client.multicall({ contracts: calls }).catch(() => [])
      let activeCount = 0
      let settledCount = 0

      results.forEach((res: any) => {
        if (res.status === 'success' && res.result) {
          const status = Number(res.result[9] !== undefined ? res.result[9] : res.result[7])
          if ([0, 1, 2].includes(status)) {
            activeCount++
          } else if (status === 3) {
            settledCount++
          }
        }
      })

      setActiveJobsCount(activeCount)
      const rate = numTotal > 0 ? ((settledCount / numTotal) * 100).toFixed(0) : '100'
      setCompletionRate(`${rate}%`)

    } catch (err) {
      console.error('Error fetching analytics summary:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-8">
      {/* TVL */}
      <div className="rounded-2xl bg-gray-900/40 p-5 ring-1 ring-gray-800 shadow-xl flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Total Value Locked (TVL)</span>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-bold font-mono text-white">
            {loading ? '...' : Number(tvlUSDC).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs font-bold text-blue-400">USDC</span>
        </div>
        <span className="text-[10px] text-gray-600 mt-1">Escrowed Smart Contract Balance</span>
      </div>

      {/* Active Jobs */}
      <div className="rounded-2xl bg-gray-900/40 p-5 ring-1 ring-gray-800 shadow-xl flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Active Jobs</span>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-bold text-emerald-400">
            {loading ? '...' : activeJobsCount}
          </span>
          <span className="text-xs text-gray-400">/ {totalJobs} total</span>
        </div>
        <span className="text-[10px] text-gray-600 mt-1">Currently open or in progress</span>
      </div>

      {/* Completion Rate */}
      <div className="rounded-2xl bg-gray-900/40 p-5 ring-1 ring-gray-800 shadow-xl flex flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Completion Rate</span>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-bold text-indigo-400">
            {loading ? '...' : completionRate}
          </span>
        </div>
        <span className="text-[10px] text-gray-600 mt-1">Settled vs total created jobs</span>
      </div>

      {/* Chain Status */}
      <div className="rounded-2xl bg-gray-900/40 p-5 ring-1 ring-gray-800 shadow-xl flex flex-col justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Settlement Layer</span>
        <div className="flex items-center gap-2 mt-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm font-bold text-white">Arc Testnet</span>
        </div>
        <span className="text-[10px] text-gray-400">Sub-second deterministic finality</span>
      </div>
    </div>
  )
}
