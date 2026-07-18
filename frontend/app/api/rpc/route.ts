import { NextResponse } from 'next/server'

// Simple in-memory cache for JSON-RPC read calls (eth_call, eth_blockNumber, eth_getBalance)
const cache = new Map<string, { data: any; expiry: number }>()
const CACHE_TTL_MS = 6000 // Cache read calls for 6 seconds
const RATE_LIMIT_CACHE_TTL_MS = 15000 // Cache rate limit errors for 15 seconds

// In-flight requests map for deduplication
const inFlight = new Map<string, Promise<any>>()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const requestKey = JSON.stringify(body)

    // Check if it's a read call
    const isReadCall =
      body.method === 'eth_call' ||
      body.method === 'eth_blockNumber' ||
      body.method === 'eth_getBalance'

    if (isReadCall) {
      // 1. Check cache (including cached rate limit errors)
      const cached = cache.get(requestKey)
      if (cached && cached.expiry > Date.now()) {
        return NextResponse.json(cached.data)
      }

      // 2. Check in-flight deduplication
      const activePromise = inFlight.get(requestKey)
      if (activePromise) {
        const result = await activePromise
        return NextResponse.json(result)
      }
    }

    const rpcUrl = process.env.RPC_URL || 'https://rpc.testnet.arc.network'

    // 3. Make fetch promise
    const fetchPromise = (async () => {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          // Prevent Next.js default fetch cache from breaking dynamic JSON-RPC payloads
          cache: 'no-store',
        })

        // Check if HTTP status is rate limited (e.g. 429)
        let isRateLimited = response.status === 429 || !response.ok
        let data: any

        try {
          data = await response.json()
        } catch (err) {
          data = { error: { code: response.status, message: 'Invalid JSON response from RPC' } }
          isRateLimited = true
        }

        // Check if JSON-RPC payload reports rate limit
        if (data && data.error) {
          const errMsg = String(data.error.message || '').toLowerCase()
          if (
            errMsg.includes('limit') ||
            errMsg.includes('rate') ||
            errMsg.includes('too many') ||
            data.error.code === 429 ||
            data.error.code === -32005
          ) {
            isRateLimited = true
          }
        }

        // If rate limited, cache the error for 15 seconds to prevent RPC spam
        if (isRateLimited && isReadCall) {
          const rateLimitError = data || { error: { code: 429, message: 'request limit reached (cached proxy)' } }
          cache.set(requestKey, {
            data: rateLimitError,
            expiry: Date.now() + RATE_LIMIT_CACHE_TTL_MS,
          })
          return rateLimitError
        }

        // Cache successful read data for 6 seconds
        if (isReadCall && !data.error) {
          cache.set(requestKey, {
            data,
            expiry: Date.now() + CACHE_TTL_MS,
          })
        }

        return data
      } finally {
        if (isReadCall) {
          inFlight.delete(requestKey)
        }
      }
    })()

    if (isReadCall) {
      inFlight.set(requestKey, fetchPromise)
    }

    const data = await fetchPromise
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('RPC proxy error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
