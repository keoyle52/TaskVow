import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { arcTestnet } from './chains/arcTestnet'

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  ssr: true,
  transports: {
    [arcTestnet.id]: http('/api/rpc'),
  },
})
export { arcTestnet }
