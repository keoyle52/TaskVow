import { NextResponse } from 'next/server'

// Simple in-memory cache for JSON-RPC read calls (eth_call, eth_blockNumber, eth_getBalance)
const cache = new Map<string, { data: any; expiry: number }>()
const CACHE_TTL_MS = 4000 // Cache successful read calls for 4 seconds

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
      // 1. Check cache (only for successful previous data)
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

    // 3. Make fetch promise with retry for rate limits
    const fetchPromise = (async () => {
      try {
        let attempts = 0
        let data: any = null

        while (attempts < 3) {
          attempts++
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
          })

          try {
            data = await response.json()
          } catch {
            data = { error: { code: response.status, message: 'Invalid JSON response from RPC' } }
          }

          const errMsg = String(data?.error?.message || '').toLowerCase()
          const isRateLimited =
            response.status === 429 ||
            errMsg.includes('limit') ||
            errMsg.includes('rate') ||
            errMsg.includes('too many') ||
            data?.error?.code === 429 ||
            data?.error?.code === -32005

          if (isRateLimited && attempts < 3) {
            // Wait 500ms before retrying RPC request
            await new Promise((r) => setTimeout(r, 500 * attempts))
            continue
          }

          // Successful read call: store in cache for 4s
          if (isReadCall && data && !data.error) {
            cache.set(requestKey, {
              data,
              expiry: Date.now() + CACHE_TTL_MS,
            })
          }

          return data
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
