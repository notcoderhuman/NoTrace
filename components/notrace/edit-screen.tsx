'use client'

import { useState } from 'react'
import { ArrowRight, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react'
import { metadata } from '@/lib/notrace-demo'
import { mapDemoFindings, mapDemoReport } from '@/lib/presentation/demo-mapper'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { GlassButton, GlassCard, Modal, StatusBadge } from './primitives'
import { usePrototype } from './provider'
import { OutputPanel } from './report-panels'

export function EditScreen() {
  const { selected, drafts, setDraft, run, currentReport, retryFile } = usePrototype()
  const [confirm, setConfirm] = useState(false)
  const fields = ['make','model','author','description','capture','gps','color','modified'].map(id => metadata.find(m => m.id === id)!)
  const changed = fields.filter(f => f.capability === 'Editable' && drafts[f.id] !== undefined && drafts[f.id] !== f.value)
  if (!selected) return null
  if (!selected.demo) return <GlassCard className="empty-state"><h2>Local editing is not available.</h2><p>This prototype currently edits demo metadata only. Your local file remains untouched.</p></GlassCard>
  if (['success','partial'].includes(selected.state) && currentReport) return <OutputPanel report={mapDemoReport(currentReport, mapDemoFindings(metadata))} onReset={() => retryFile(selected.id)} />
  return <div className="screen-stack"><GlassCard className="editor-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR DETAILS, RECONSIDERED.</span><h2>Metadata editor</h2><p>Illustrative field values. Edits stay in this session only.</p></div><StatusBadge tone="accent">{changed.length} changed</StatusBadge></div><FieldGroup className="editor-fields">{fields.map(item => { const disabled = item.capability !== 'Editable'; const capability = item.id === 'gps' ? 'Unsupported' : item.capability; return <Field key={item.id} data-disabled={disabled} className={item.id === 'description' ? 'editor-wide' : undefined}><div className="editor-field-heading"><FieldLabel htmlFor={`edit-${item.id}`}>{item.label}</FieldLabel><StatusBadge tone={disabled ? 'neutral' : 'accent'}>{capability}</StatusBadge></div>{item.id === 'description' ? <Textarea id={`edit-${item.id}`} maxLength={2000} value={drafts[item.id] ?? item.value} onChange={e => setDraft(item.id, e.target.value)} rows={3} /> : <Input id={`edit-${item.id}`} disabled={disabled} type={item.id === 'capture' ? 'datetime-local' : 'text'} maxLength={300} value={drafts[item.id] ?? item.value} onChange={e => setDraft(item.id, e.target.value)} />}{disabled && <p className="field-hint"><LockKeyhole size={12} />{item.id === 'gps' ? 'GPS editing is not supported in this demo. Removal is available.' : item.capability === 'Unknown' ? 'Capability is unknown. This field stays untouched.' : 'Required for consistent rendering. This field stays untouched.'}</p>}</Field> })}</FieldGroup><div className="editor-preservation"><ShieldCheck size={18} /><p>Only supported fields can be edited. Protected, unsupported, and unknown fields are read-only.</p></div></GlassCard><GlassCard className="cleanup-action-panel"><div className="screen-actions"><div><strong>{changed.length ? `${changed.length} field${changed.length === 1 ? '' : 's'} ready for a fresh start.` : 'No changes just yet.'}</strong><p>Your original remains untouched.</p></div><div className="action-row"><GlassButton disabled={!changed.length} onClick={() => fields.forEach(item => setDraft(item.id, item.value))}><RotateCcw data-icon="inline-start" />Reset</GlassButton><GlassButton variant="default" disabled={!changed.length} onClick={() => setConfirm(true)}>Apply & Verify<ArrowRight data-icon="inline-end" /></GlassButton></div></div></GlassCard><Modal open={confirm} onOpenChange={setConfirm} title="Preview your edits" description="Apply these changes to the simulated result. Your actual media will not be modified."><div className="edit-changes">{changed.map(item => <div key={item.id}><span>{item.label}</span><span className="muted">{item.value}</span><ArrowRight size={14} /><strong>{drafts[item.id] || '(empty)'}</strong></div>)}</div><div className="action-row"><GlassButton onClick={() => setConfirm(false)}>Keep editing</GlassButton><GlassButton variant="default" onClick={() => { setConfirm(false); run('Custom edits', [], drafts) }}>Apply simulated edits<ArrowRight data-icon="inline-end" /></GlassButton></div></Modal></div>
}
