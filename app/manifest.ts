import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NoTrace — Media Privacy Toolkit', short_name: 'NoTrace',
    description: 'A local-first media privacy UI prototype. All results are simulated.',
    start_url: '/', display: 'standalone', background_color: '#090a10', theme_color: '#090a10',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
