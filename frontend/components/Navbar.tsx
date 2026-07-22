'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount, useDisconnect, useConnect, useBalance, useSwitchChain, useReadContract } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { formatUnits, zeroAddress } from 'viem'
import { arcTestnet } from '../lib/wagmi'
import { USDC_TOKEN_ADDRESS, USDC_ABI, AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, JOB_ESCROW_ADDRESS } from '../lib/contracts/contracts'

export default function Navbar() {
  const pathname = usePathname()
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { connect } = useConnect()
  const { switchChain } = useSwitchChain()

  // Read AgentRegistry -> escrowContract to verify connection status
  const { data: linkedEscrowAddress, isError: isEscrowCheckError } = useReadContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: 'escrowContract',
    query: {
      staleTime: 60000,
    }
  })

  const isRegistryLinked = linkedEscrowAddress && 
    linkedEscrowAddress.toLowerCase() === JOB_ESCROW_ADDRESS.toLowerCase()

  // Native balance (Gas USDC on Arc Testnet has 18 decimals)
  const { data: nativeBalance } = useBalance({
    address: address,
    query: {
      staleTime: 30000,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  })

  // ERC-20 USDC balance (Token USDC has 6 decimals)
  const { data: erc20Balance } = useReadContract({
    address: USDC_TOKEN_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      staleTime: 30000,
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  })

  const isCorrectNetwork = chainId === arcTestnet.id

  const formatAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
      {/* Registry Connection Warning Bar */}
      {(!isRegistryLinked || isEscrowCheckError) && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 py-1 px-4 text-center text-xs text-amber-300 font-medium flex items-center justify-center gap-2">
          <span>⚠️ Warning: AgentRegistry is not linked to JobEscrow (`setEscrowContract` uninitialized).</span>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo / Brand */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                TaskVow
              </span>
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-inset ring-blue-500/20">
                Arc Testnet
              </span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex space-x-4">
              <Link
                href="/"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                Marketplace
              </Link>
              <Link
                href="/create"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/create' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                Post a Job
              </Link>
              <Link
                href="/agent"
                className={`text-sm font-medium transition-colors ${
                  pathname === '/agent' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                Agent Portal
              </Link>
            </div>
          </div>

          {/* Right Section: Connection & Balances */}
          <div className="flex items-center gap-4">
            {isConnected && address ? (
              <>
                {/* Balances Display */}
                <div className="hidden lg:flex items-center gap-3 rounded-xl bg-gray-900/50 p-1.5 px-3 text-xs ring-1 ring-gray-800">
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Gas USDC (Native)</span>
                    <span className="font-mono text-gray-200">
                      {nativeBalance ? Number(formatUnits(nativeBalance.value, 18)).toFixed(4) : '0.0000'} USDC
                    </span>
                  </div>
                  <div className="h-6 w-px bg-gray-800" />
                  <div className="flex flex-col text-right">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase">Token USDC (ERC-20)</span>
                    <span className="font-mono text-blue-400 font-bold">
                      {erc20Balance !== undefined ? Number(formatUnits(erc20Balance, 6)).toFixed(2) : '0.00'} USDC
                    </span>
                  </div>
                </div>

                {/* Network Checker */}
                {!isCorrectNetwork ? (
                  <button
                    onClick={() => switchChain({ chainId: arcTestnet.id })}
                    className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 ring-1 ring-inset ring-amber-500/20 hover:bg-amber-500/20 transition-all"
                  >
                    Switch to Arc Testnet
                  </button>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Connected
                  </span>
                )}

                {/* Account Details / Disconnect */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col text-right text-xs">
                    <span className="font-semibold text-gray-300">{formatAddress(address)}</span>
                  </div>
                  <button
                    onClick={() => disconnect()}
                    className="rounded-lg bg-gray-900 border border-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-all hover:text-white"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => connect({ connector: injected() })}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 transition-all"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Links */}
        <div className="flex md:hidden border-t border-gray-900 py-2 justify-around">
          <Link
            href="/"
            className={`text-xs font-medium transition-colors ${
              pathname === '/' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Marketplace
          </Link>
          <Link
            href="/create"
            className={`text-xs font-medium transition-colors ${
              pathname === '/create' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Post a Job
          </Link>
          <Link
            href="/agent"
            className={`text-xs font-medium transition-colors ${
              pathname === '/agent' ? 'text-blue-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Agent Portal
          </Link>
        </div>
      </div>
    </nav>
  )
}
