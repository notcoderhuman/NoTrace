'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Check, Download, Eye, LockKeyhole, ShieldCheck, SlidersHorizontal, Sparkles, WandSparkles } from 'lucide-react'
import { metadata, quickFields, safeFields } from '@/lib/notrace-demo'
import { mapDemoFindings, mapDemoReport } from '@/lib/presentation/demo-mapper'
import { mapRealRemoval, mapRealVerification } from '@/lib/presentation/real-mapper'
import { mapDemoRisk } from '@/lib/presentation/demo-mapper'
import type { ReportViewModel } from '@/lib/presentation/models'
import { toRemovalTargetViewModels } from '@/lib/local-boundary/removal-view-model'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { usePrototype } from './provider'
import { GlassButton, GlassCard, Modal, RiskMeter, StatusBadge } from './primitives'
import { deriveReportCounts } from '@/lib/presentation/models'
import { PrivacyPreview } from './inspect-screen'
import { OutputPanel } from './report-panels'

const policies = [{ value:'quick',title:'Quick Clean',description:'The privacy essentials. Safely removed.',icon:WandSparkles },{value:'maximum',title:'Maximum Safe Cleanup',description:'Go further. Keep required data intact.',icon:ShieldCheck},{value:'custom',title:'Custom',description:'Choose exactly what stays and goes.',icon:SlidersHorizontal}]

function DemoRemoveScreen() {
  const { selected, files, run, currentReport, retryFile } = usePrototype()
  const [policy, setPolicy] = useState('quick')
  const [custom, setCustom] = useState<string[]>(quickFields)
  const [dryRun, setDryRun] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [batch, setBatch] = useState(false)
  const selectedFields = policy === 'quick' ? quickFields : policy === 'maximum' ? safeFields : custom
  if (!selected) return null
  if (selected.demo && ['success', 'partial'].includes(selected.state) && currentReport) return <OutputPanel report={mapDemoReport(currentReport, mapDemoFindings(metadata))} onReset={() => retryFile(selected.id)} />
  const label = policies.find(p => p.value === policy)?.title || 'Custom'
  const previewItems = metadata.filter(m => selectedFields.includes(m.id))
  const preservedItems = metadata.filter(m => !selectedFields.includes(m.id))
  const start = () => { setConfirm(false); setDryRun(false); run(label, selectedFields, {}, batch) }
  return <div className="screen-stack"><GlassCard className="policy-panel"><div className="panel-heading"><div><span className="eyebrow">LESS DATA. MORE CONTROL.</span><h2>How much would you like to leave behind?</h2></div></div><ToggleGroup className="policy-options" value={[policy]} onValueChange={value => value.length && setPolicy(value[0] as string)} aria-label="Cleanup policy">{policies.map(({icon:Icon,...item}) => <ToggleGroupItem key={item.value} value={item.value} className="policy-option"><span className="policy-icon"><Icon size={20} /></span><span className="policy-text"><strong>{item.title}</strong><span>{item.description}</span></span><span className="policy-radio" aria-hidden="true">{policy === item.value && <span />}</span>{item.value === 'quick' && <span className="recommended-label">Recommended</span>}</ToggleGroupItem>)}</ToggleGroup><div className="policy-explanation"><ShieldCheck size={17} /><p>{policy === 'maximum' ? 'Maximum supported safe removal. Required structures, protected fields, and uncertain information are always preserved.' : policy === 'custom' ? 'Only selected, supported fields would be removed. Protected and unknown fields cannot be selected.' : 'A recommended first pass: remove location, identifying device details, and editing software metadata.'}</p></div></GlassCard>
    {policy === 'custom' && <GlassCard className="custom-panel"><FieldSet><FieldLegend>Choose metadata to remove</FieldLegend><FieldGroup>{metadata.map(item => { const disabled = !safeFields.includes(item.id); return <Field key={item.id} orientation="horizontal" data-disabled={disabled}><input className="native-checkbox" type="checkbox" id={`remove-${item.id}`} disabled={disabled} checked={custom.includes(item.id)} onChange={e => setCustom(old => e.target.checked ? [...old, item.id] : old.filter(id => id !== item.id))} /><FieldLabel htmlFor={`remove-${item.id}`}>{item.label}</FieldLabel><StatusBadge tone={disabled ? 'neutral' : 'accent'}>{item.capability}</StatusBadge></Field> })}</FieldGroup></FieldSet></GlassCard>}
    <GlassCard className="removal-preview"><div className="panel-heading"><div><h2>A clearer picture of the changes.</h2><p>Preview of your selected policy · simulated</p></div><StatusBadge tone="accent">{selectedFields.length} selected</StatusBadge></div><div className="policy-diff"><div><h3><Sparkles size={15} />Would remove <span>{previewItems.length}</span></h3>{previewItems.map(item => <p key={item.id}><Check size={14} />{item.label}</p>)}{!previewItems.length && <p className="muted">No fields selected.</p>}</div><div><h3><LockKeyhole size={15} />Would preserve <span>{preservedItems.length}</span></h3>{preservedItems.map(item => <p key={item.id}><LockKeyhole size={13} />{item.label}</p>)}</div></div></GlassCard>
    <GlassCard className="inspection-overview"><RiskMeter assessment={mapDemoRisk({ risk: 82, partial: false })} /><PrivacyPreview findings={mapDemoFindings(metadata)} /></GlassCard>
    <GlassCard className="cleanup-action-panel">{files.length > 1 && <Field orientation="horizontal"><input type="checkbox" className="native-checkbox" id="batch-clean" checked={batch} onChange={e => setBatch(e.target.checked)} /><FieldLabel htmlFor="batch-clean">Apply to all {files.filter(f => !['error','unsupported'].includes(f.state)).length} supported files</FieldLabel></Field>}<div className="screen-actions"><div><strong>Your original stays exactly as it is.</strong><p>Detected metadata can be removed according to the selected policy.</p></div><div className="action-row"><GlassButton onClick={() => setDryRun(true)}><Eye data-icon="inline-start" />Dry Run</GlassButton><GlassButton variant="default" disabled={!selectedFields.length} onClick={() => setConfirm(true)}>Clean & Verify<ArrowRight data-icon="inline-end" /></GlassButton></div></div></GlassCard>
    <Modal open={dryRun} onOpenChange={setDryRun} title="Dry run. Nothing changes." description="This is a simulated preview. No files will be changed."><StatusBadge tone="accent">DRY RUN · {label}</StatusBadge><div className="policy-diff modal-diff"><div><h3>Would remove</h3>{previewItems.map(item => <p key={item.id}><Check size={14} />{item.label}</p>)}</div><div><h3>Would preserve</h3><p><LockKeyhole size={14} />Color Profile</p><p><LockKeyhole size={14} />Required Structure</p><p><LockKeyhole size={14} />Uncertain information</p></div></div><div className="action-row"><GlassButton onClick={() => setDryRun(false)}>Back to selection</GlassButton><GlassButton variant="default" disabled={!selectedFields.length} onClick={() => { setDryRun(false); setConfirm(true) }}>Continue<ArrowRight data-icon="inline-end" /></GlassButton></div></Modal>
    <Modal open={confirm} onOpenChange={setConfirm} title="Ready for a cleaner slate?" description="Run the simulated cleanup and verification. No file contents are read, changed, or exported."><div className="confirm-summary"><span>Policy<strong>{label}</strong></span><span>Selected fields<strong>{selectedFields.length}</strong></span><span>Scope<strong>{batch ? 'All supported files' : 'Selected file'}</strong></span></div><div className="action-row"><GlassButton onClick={() => setConfirm(false)}>Go back</GlassButton><GlassButton variant="default" onClick={start}>Run simulated cleanup<ArrowRight data-icon="inline-end" /></GlassButton></div></Modal>
  </div>
}

function RealRemoveScreen() {
  const { selected, removal, planRealRemoval, setRemovalTargets, approveAndProcessRemoval, downloadVerifiedRemoval } = usePrototype()
  const [confirm, setConfirm] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const fileId = selected?.id || ''
  useEffect(() => {
    if (selected && !selected.demo && (!removal || removal.fileId !== selected.id)) planRealRemoval(selected.id)
  }, [selected?.id, selected?.demo, removal?.fileId])
  if (!selected) return null
  const plan = removal && 'plan' in removal && removal.fileId === fileId ? removal.plan : undefined
  const targets = plan ? toRemovalTargetViewModels(plan) : []
  const selectedTargetIds = removal && 'selectedTargetIds' in removal && removal.fileId === fileId ? (removal.selectedTargetIds || []) : []
  const currentRemoval = removal?.fileId === fileId ? removal : undefined
  const status = currentRemoval?.status || 'idle'
  const successResult = currentRemoval?.status === 'success' ? currentRemoval.result : undefined
  const realRemoval = currentRemoval && 'plan' in currentRemoval && currentRemoval.plan ? mapRealRemoval(currentRemoval.plan, selectedTargetIds, successResult) : undefined
  const success = Boolean(realRemoval?.state === 'verified' && successResult && successResult.outputVerification === 'passed' && successResult.output?.created === true)
  const message = status === 'planning' ? 'Preparing the local JPEG plan…' : status === 'processing' ? 'Removing selected JPEG comments locally…' : status === 'unsupported' ? 'This local file is not a supported JPEG.' : undefined
  const toggle = (id: string, checked: boolean) => setRemovalTargets(fileId, checked ? [...selectedTargetIds, id] : selectedTargetIds.filter(targetId => targetId !== id))
  const download = async () => { setDownloadError(''); const result = await downloadVerifiedRemoval(fileId); if (!result.ok) setDownloadError(result.error.message) }
  return <div className="screen-stack"><GlassCard className="policy-panel"><div className="panel-heading"><div><span className="eyebrow">LESS DATA. MORE CONTROL.</span><h2>Choose JPEG comments to remove.</h2></div></div><div className="policy-explanation"><ShieldCheck size={17} /><p>Only selected JPEG comment segments can be removed. EXIF, XMP, ICC, unknown APP segments, and image data remain preserved.</p></div></GlassCard>
    {message && <GlassCard className="loading-state" aria-live="polite"><h2>{message}</h2><p>Local-only processing. Your original remains untouched.</p></GlassCard>}
    {status === 'ready' && plan && <GlassCard className="custom-panel"><FieldSet><FieldLegend>Choose structural targets</FieldLegend><FieldGroup>{targets.map(target => <Field key={target.id} orientation="horizontal" data-disabled={!target.selectable}><input className="native-checkbox" type="checkbox" id={`remove-${target.id}`} disabled={!target.selectable} checked={selectedTargetIds.includes(target.id)} onChange={event => toggle(target.id, event.target.checked)} /><FieldLabel htmlFor={`remove-${target.id}`}>{target.label}</FieldLabel><StatusBadge tone={target.capability === 'Removable' ? 'accent' : target.capability === 'Protected' ? 'neutral' : 'warning'}>{target.capability}</StatusBadge></Field>)}</FieldGroup></FieldSet></GlassCard>}
    {status === 'ready-empty' && plan && <GlassCard className="removal-preview" role="status"><h2>No supported JPEG comments to remove.</h2><p>Inspection found no removable comment segments. Protected, unknown, and unsupported structures remain untouched.</p></GlassCard>}
     {(status === 'failed' || status === 'cancelled') && <GlassCard className="empty-state" role="alert"><h2>{status === 'cancelled' ? 'Local removal cancelled.' : 'Local removal could not be completed.'}</h2><p>{currentRemoval && 'error' in currentRemoval ? currentRemoval.error.message : 'Your original remains untouched and no output is downloadable.'}</p><div className="action-row"><GlassButton onClick={() => planRealRemoval(fileId)}>Try removal again</GlassButton></div></GlassCard>}
    {(status === 'ready' || status === 'processing') && plan && <GlassCard className="removal-preview"><div className="panel-heading"><div><h2>Local removal plan</h2><p>{selectedTargetIds.length} selected · COM-only</p></div><StatusBadge tone="accent">{selectedTargetIds.length} selected</StatusBadge></div><div className="policy-diff"><div><h3><Sparkles size={15} />Would remove <span>{selectedTargetIds.length}</span></h3>{targets.filter(target => selectedTargetIds.includes(target.id)).map(target => <p key={target.id}><Check size={14} />{target.label}</p>)}</div><div><h3><LockKeyhole size={15} />Would preserve <span>{targets.filter(target => !selectedTargetIds.includes(target.id)).length}</span></h3>{targets.filter(target => !selectedTargetIds.includes(target.id)).map(target => <p key={target.id}><LockKeyhole size={13} />{target.label}</p>)}</div></div></GlassCard>}
    {success && successResult && <GlassCard className="removal-preview"><div className="panel-heading"><div><h2>Verified output is ready in memory.</h2><p>{successResult.removedTargetIds.length} removed · {successResult.preservedTargetIds.length} preserved</p></div><StatusBadge tone="success">Verified</StatusBadge></div><p>Your original remains untouched. The verified output has not been persisted.</p><div className="action-row"><GlassButton onClick={download}><Download data-icon="inline-start" />Download verified JPEG</GlassButton></div>{downloadError && <p className="danger" role="alert">{downloadError}</p>}</GlassCard>}
    {(status === 'ready' || status === 'processing') && <GlassCard className="cleanup-action-panel"><div className="screen-actions"><div><strong>Your original stays exactly as it is.</strong><p>Independent verification is required before output is available.</p></div><div className="action-row"><GlassButton variant="default" disabled={status !== 'ready' || selectedTargetIds.length === 0} onClick={() => setConfirm(true)}>Remove and verify<ArrowRight data-icon="inline-end" /></GlassButton></div></div></GlassCard>}
    <Modal open={confirm} onOpenChange={setConfirm} title="Review local removal" description="Only the selected JPEG comment segments will be removed. The result must pass independent verification before it is made available."><div className="confirm-summary"><span>Selected targets<strong>{selectedTargetIds.length}</strong></span><span>Scope<strong>JPEG comments only</strong></span><span>Preserved<strong>EXIF · XMP · ICC · image data</strong></span></div><div className="policy-diff modal-diff">{targets.filter(target => selectedTargetIds.includes(target.id)).map(target => <p key={target.id}><Check size={14} />{target.label}</p>)}</div><div className="action-row"><GlassButton onClick={() => setConfirm(false)}>Go back</GlassButton><GlassButton variant="default" onClick={() => { setConfirm(false); approveAndProcessRemoval(fileId) }}>Remove and verify<ArrowRight data-icon="inline-end" /></GlassButton></div></Modal>
  </div>
}

export function RemoveScreen() {
  const { selected } = usePrototype()
  if (!selected) return null
  return selected.demo ? <DemoRemoveScreen /> : <RealRemoveScreen />
}
