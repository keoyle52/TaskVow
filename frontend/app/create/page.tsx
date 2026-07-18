'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { parseUnits, createPublicClient, http } from 'viem'
import { JOB_ESCROW_ADDRESS, JOB_ESCROW_ABI, USDC_TOKEN_ADDRESS, USDC_ABI } from '@/lib/contracts/contracts'
import { arcTestnet } from '@/lib/wagmi'

export default function CreateJob() {
  const router = useRouter()
  const { address, isConnected, chainId } = useAccount()

  // Form State
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('7')
  const [description, setDescription] = useState('')

  // Transaction Tracking
  const [currentStep, setCurrentStep] = useState(0) // 0: Form, 1: Approving, 2: Creating, 3: Success
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  // Check current allowance of the user
  const { data: currentAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_TOKEN_ADDRESS,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, JOB_ESCROW_ADDRESS] : undefined,
    query: {
      staleTime: 30000,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  })

  const isCorrectNetwork = chainId === arcTestnet.id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConnected || !address) {
      setErrorMsg('Please connect your wallet first.')
      return
    }
    if (!isCorrectNetwork) {
      setErrorMsg('Please switch to Arc Testnet.')
      return
    }
    if (Number(amount) <= 0) {
      setErrorMsg('Amount must be greater than 0.')
      return
    }
    if (!description.trim()) {
      setErrorMsg('Description cannot be empty.')
      return
    }

    try {
      setErrorMsg(null)
      const parsedAmount = parseUnits(amount, 6) // ERC-20 USDC has 6 decimals
      const deadlineTimestamp = BigInt(Math.floor(Date.now() / 1000) + Number(days) * 24 * 60 * 60)

      const client = createPublicClient({
        chain: arcTestnet,
        transport: http('/api/rpc', {
          retryCount: 5,
          retryDelay: 4000,
          timeout: 15000,
        }),
      })

      // Step 1: Check if we need to Approve USDC
      const allowance = currentAllowance ? BigInt(currentAllowance.toString()) : 0n
      if (allowance < parsedAmount) {
        setCurrentStep(1) // Approving phase
        
        const approveHash = await writeContractAsync({
          address: USDC_TOKEN_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [JOB_ESCROW_ADDRESS, parsedAmount],
        })
        
        setTxHash(approveHash)
        
        // Wait for approval tx to be mined before proceeding
        await client.waitForTransactionReceipt({ hash: approveHash })
      }

      // Step 2: Create Job
      setCurrentStep(2) // Creating phase
      const createHash = await writeContractAsync({
        address: JOB_ESCROW_ADDRESS,
        abi: JOB_ESCROW_ABI,
        functionName: 'createJob',
        args: [parsedAmount, deadlineTimestamp, description],
      })

      setTxHash(createHash)
      
      // Wait for create job tx to be mined
      await client.waitForTransactionReceipt({ hash: createHash })
      
      setCurrentStep(3) // Succeeded!
      
      // Auto redirect to marketplace after 3 seconds
      setTimeout(() => {
        router.push('/')
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || 'Transaction failed or was rejected.')
      setCurrentStep(0)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl bg-gray-900/40 p-8 ring-1 ring-gray-800 shadow-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Post a New Job</h2>
        <p className="text-sm text-gray-400 mb-8">
          Lock ERC-20 USDC in escrow to secure your project and find an AI agent to build it.
        </p>

        {currentStep === 0 ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-semibold text-gray-300">
                Job Description / Title
              </label>
              <input
                type="text"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Create a Python script to analyze social sentiment"
                className="mt-2 block w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:ring-0 focus:outline-hidden"
              />
            </div>

            {/* Budget & Duration Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Budget */}
              <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-gray-300">
                  Escrow Budget (Token USDC)
                </label>
                <div className="relative mt-2 rounded-md shadow-sm">
                  <input
                    type="number"
                    step="0.01"
                    id="amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="10.00"
                    className="block w-full rounded-lg bg-gray-950 border border-gray-800 pl-4 pr-16 py-2.5 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:ring-0 focus:outline-hidden"
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-sm font-semibold text-blue-400">USDC</span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">ERC-20 USDC (6 decimals) will be locked.</p>
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="days" className="block text-sm font-semibold text-gray-300">
                  Duration / Deadline
                </label>
                <select
                  id="days"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="mt-2 block w-full rounded-lg bg-gray-950 border border-gray-800 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-0 focus:outline-hidden"
                >
                  <option value="1">1 Day</option>
                  <option value="3">3 Days</option>
                  <option value="7">7 Days</option>
                  <option value="14">14 Days</option>
                  <option value="30">30 Days</option>
                </select>
                <p className="mt-1 text-[11px] text-gray-500">Time allowed for agents to accept & deliver.</p>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="rounded-lg bg-red-500/10 p-4 ring-1 ring-red-500/20">
                <p className="text-xs text-red-400 font-medium">{errorMsg}</p>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={!isConnected}
                className={`flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all ${
                  isConnected
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }`}
              >
                {!isConnected ? 'Connect Wallet First' : 'Approve & Create Job'}
              </button>
            </div>
          </form>
        ) : (
          /* Processing Phases */
          <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center">
            {currentStep < 3 ? (
              <div className="relative flex items-center justify-center">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            ) : (
              <div className="relative flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-white">
                {currentStep === 1 && 'Step 1 of 2: Approving USDC Escrow'}
                {currentStep === 2 && 'Step 2 of 2: Creating Escrow Job'}
                {currentStep === 3 && 'Job Successfully Created!'}
              </h3>
              <p className="text-sm text-gray-400">
                {currentStep === 1 && 'Confirm the USDC approval transaction in your wallet.'}
                {currentStep === 2 && 'USDC Approved! Now confirm the createJob transaction.'}
                {currentStep === 3 && 'Redirecting to job board...'}
              </p>
            </div>

            {txHash && (
              <div className="text-xs">
                <span className="text-gray-500">Tx Hash: </span>
                <a
                  href={`https://testnet.arcscan.app/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-blue-400 hover:underline"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </div>
            )}
            
            {currentStep === 3 && (
              <button
                onClick={() => router.push('/')}
                className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-all"
              >
                Go to Marketplace
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
