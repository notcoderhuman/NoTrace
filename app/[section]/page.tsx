import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { navigation, type Section } from '@/lib/notrace-demo'
import { Workspace } from '@/components/notrace/workspace'

export function generateStaticParams() { return navigation.map(item => ({ section: item.path })) }
export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params
  return { title: navigation.find(item => item.path === section)?.label || 'Page not found', alternates: { canonical: `/${section}` } }
}
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!navigation.some(item => item.path === section)) notFound()
  return <Workspace section={section as Section} />
}
