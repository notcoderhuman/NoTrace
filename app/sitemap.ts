import type { MetadataRoute } from 'next'
import { navigation } from '@/lib/notrace-demo'
import { siteUrl } from '@/lib/site-url'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', ...navigation.map(item => item.path)].map(path => ({
    url: new URL(`/${path}`, siteUrl).toString(), lastModified: '2026-09-13',
    changeFrequency: 'monthly', priority: path ? 0.7 : 1,
  }))
}
