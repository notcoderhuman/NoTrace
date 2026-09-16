export type Section = 'inspect' | 'remove' | 'edit' | 'ai-watermark' | 'reports'
export type FileState = 'ready' | 'processing' | 'success' | 'partial' | 'error' | 'unsupported'
export type DemoFile = { id: string; name: string; format: string; size: string; kind: 'image' | 'video' | 'audio' | 'document'; state: FileState; demo: boolean }
export type Capability = 'Safe to remove' | 'Editable' | 'Protected' | 'Unknown' | 'Unsupported'
export type MetadataItem = { id: string; label: string; value: string; category: string; capability: Capability; risk?: 'High' | 'Medium' | 'Low' }
export type Change = { label: string; before: string; after: string; action: 'Removed' | 'Edited' | 'Preserved' }
export type DemoReport = { id: string; fileId: string; filename: string; format: string; kind: DemoFile['kind']; createdAt: string; policy: string; removed: number; edited: number; preserved: number; risk: number; changes: Change[]; partial: boolean }
export const navigation: { label: string; path: Section }[] = [
  { label: 'Inspect', path: 'inspect' }, { label: 'Remove', path: 'remove' }, { label: 'Edit', path: 'edit' }, { label: 'AI Watermark', path: 'ai-watermark' }, { label: 'Reports', path: 'reports' },
]
export const metadata: MetadataItem[] = [
  { id: 'gps', label: 'GPS Location', value: '46.6863° N, 7.8632° E', category: 'EXIF', capability: 'Safe to remove', risk: 'High' },
  { id: 'altitude', label: 'GPS Altitude', value: '1,842 m', category: 'EXIF', capability: 'Safe to remove', risk: 'High' },
  { id: 'make', label: 'Camera Make', value: 'Sony', category: 'EXIF', capability: 'Editable', risk: 'Medium' },
  { id: 'model', label: 'Camera Model', value: 'A7 IV', category: 'EXIF', capability: 'Editable', risk: 'Medium' },
  { id: 'serial', label: 'Device Serial', value: '4290176', category: 'EXIF', capability: 'Safe to remove', risk: 'High' },
  { id: 'capture', label: 'Capture Date', value: '2026-09-08T07:42', category: 'EXIF', capability: 'Editable', risk: 'Medium' },
  { id: 'lens', label: 'Lens Model', value: 'FE 24–70mm F2.8 GM', category: 'EXIF', capability: 'Safe to remove', risk: 'Low' },
  { id: 'exposure', label: 'Exposure Time', value: '1/250 s', category: 'EXIF', capability: 'Protected' },
  { id: 'aperture', label: 'Aperture', value: 'f/8', category: 'EXIF', capability: 'Protected' },
  { id: 'iso', label: 'ISO Speed', value: '100', category: 'EXIF', capability: 'Protected' },
  { id: 'author', label: 'Author', value: 'Alex Morgan', category: 'IPTC', capability: 'Editable', risk: 'Medium' },
  { id: 'description', label: 'Description', value: 'A quiet morning in the Alps.', category: 'IPTC', capability: 'Editable', risk: 'Low' },
  { id: 'copyright', label: 'Copyright', value: '© 2026 Alex Morgan', category: 'IPTC', capability: 'Safe to remove', risk: 'Low' },
  { id: 'software', label: 'Software', value: 'Adobe Lightroom 8.4', category: 'XMP', capability: 'Safe to remove', risk: 'Medium' },
  { id: 'created', label: 'Create Date', value: '2026-09-08 07:42:16', category: 'XMP', capability: 'Editable', risk: 'Medium' },
  { id: 'modified', label: 'Modification History', value: 'Unknown vendor extension', category: 'XMP', capability: 'Unknown' },
  { id: 'credentials', label: 'Content Credentials', value: 'OpenAI · signed manifest', category: 'C2PA', capability: 'Unknown' },
  { id: 'color', label: 'Color Profile', value: 'sRGB IEC61966-2.1', category: 'Other', capability: 'Protected' },
]
export const quickFields = ['gps', 'altitude', 'make', 'model', 'serial', 'lens', 'software']
export const safeFields = metadata.filter(m => m.capability === 'Editable' || m.capability === 'Safe to remove').map(m => m.id)
export const sampleFile: DemoFile = { id: 'alpine-demo', name: 'alpine_morning.jpg', format: 'JPEG', size: '4.8 MB', kind: 'image', state: 'ready', demo: true }
export function reportText(report: DemoReport) {
  return `NOTRACE PRIVACY REPORT — SIMULATED DEMO\nNo media has been analyzed, modified, or verified.\n\nFile: ${report.filename}\nDate: ${report.createdAt}\nPolicy: ${report.policy}\nFound: 18\nRemoved: ${report.removed}\nEdited: ${report.edited}\nPreserved: ${report.preserved}\nMock risk: 82 → ${report.risk}\nSimulated verification: ${report.partial ? 'PARTIAL — review unsupported fields' : 'PASSED'}\n\n${report.changes.map(c => `${c.label}: ${c.before} → ${c.after} (${c.action})`).join('\n')}\n\nOriginal remains untouched. Your media stays on this device.`
}
export function downloadReport(report: DemoReport) {
  const url = URL.createObjectURL(new Blob([reportText(report)], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${report.filename.replace(/\.[^.]+$/, '')}_notrace_demo_report.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
