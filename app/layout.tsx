import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { PrototypeProvider } from '@/components/notrace/provider'
import { AppShell } from '@/components/notrace/app-shell'
import { siteUrl } from '@/lib/site-url'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const title = 'NoTrace — Your media. Your control.'
const description = 'A local-first media privacy toolkit. Inspect, remove, edit, and verify in an interactive frontend prototype. All analysis is simulated; your media stays on this device.'
export const metadata: Metadata = {
  title: { default: title, template: '%s · NoTrace' }, description,
  openGraph: { title, description, type: 'website', siteName: 'NoTrace' },
  metadataBase: siteUrl,
  alternates: { canonical: '/' },
  twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image'] },
  icons: { icon: '/icon.svg', apple: '/apple-icon' },
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: true },
}
export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#090a10', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geist.variable} ${mono.variable} dark bg-background`}><body className="font-sans antialiased"><PrototypeProvider><AppShell>{children}</AppShell></PrototypeProvider></body></html>
}
