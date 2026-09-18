import type { ReportViewModel } from './models'

/** A detached presentation-only snapshot for the in-memory session history. */
export function snapshotReport(report: ReportViewModel): ReportViewModel {
  return JSON.parse(JSON.stringify(report)) as ReportViewModel
}

export function upsertReportSnapshot(history: readonly ReportViewModel[], report: ReportViewModel): readonly ReportViewModel[] {
  const snapshot = snapshotReport(report)
  const existing = history.find(item => item.id === snapshot.id)
  if (existing && JSON.stringify(existing) === JSON.stringify(snapshot)) return history
  return [...history.filter(item => item.id !== snapshot.id), snapshot]
}
