import { useEffect, useRef, useState } from "react"
import { Download, FileUp, ShieldAlert, Trash2 } from "lucide-react"
import { GlowButton, Panel } from "@/components/kit"
import { fieldClass } from "@/components/behavioural/fields"
import { bundledBank } from "@/content/bundled"
import { knownIds } from "@/content/merge"
import { DELETE_SCOPES, validateBackup, type BackupFile, type DeleteScope } from "@/lib/backup"
import { countEverything, createBackup, DeleteError, deleteData, groupCountsOf, previewDeletion, restoreBackup, RestoreError } from "@/lib/backupData"
import { cn } from "@/lib/utils"

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
/** After a restore or a deletion the app reloads so every screen reads the data as it now is. */
const RELOAD_DELAY_MS = 2200

function save(text: string, name: string) {
  const blob = new Blob([text], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2")

type Restore =
  | { kind: "idle" }
  | { kind: "checking"; name: string }
  | { kind: "rejected"; name: string; errors: string[] }
  | { kind: "preview"; name: string; backup: BackupFile; rows: { id: string; label: string; now: number; backup: number }[]; warnings: string[]; createdAt: string }
  | { kind: "restoring" }
  | { kind: "failed"; message: string; rolledBack: boolean; emergency: BackupFile | null }
  | { kind: "done" }

/** Settings → Privacy & Data: what is stored, full backup and restore, and clearly scoped deletion. */
export function PrivacyData() {
  const [usage, setUsage] = useState<{ bytes: number | null; rows: { label: string; count: number }[] } | null>(null)
  const [restore, setRestore] = useState<Restore>({ kind: "idle" })
  const [understood, setUnderstood] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [scope, setScope] = useState<DeleteScope | null>(null)
  const [toDelete, setToDelete] = useState<{ label: string; count: number }[] | null>(null)
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<{ message: string; cleared: string[]; failed: string[]; remaining: { label: string; count: number }[] } | null>(null)
  const [deleted, setDeleted] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const lock = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [counts, estimate] = await Promise.all([countEverything(), navigator.storage?.estimate?.().catch(() => undefined)])
      if (!cancelled) setUsage({ bytes: estimate?.usage ?? null, rows: groupCountsOf(counts).map((g) => ({ label: g.label, count: g.count })) })
    })().catch((err) => console.error("Could not count stored data", err))
    return () => {
      cancelled = true
    }
  }, [])

  async function downloadBackup() {
    setNote(null)
    try {
      const backup = await createBackup()
      save(JSON.stringify(backup) + "\n", `ib-prep-backup-${stamp()}.json`)
      const records = Object.values(backup.counts.progress).reduce((a, b) => a + b, 0) + Object.values(backup.counts.content).reduce((a, b) => a + b, 0)
      setNote(`Backup saved: ${records.toLocaleString()} records, made ${when.format(new Date(backup.createdAt))}. It is a plain file that includes your answers; keep it somewhere you trust.`)
    } catch (err) {
      console.error("Could not create the backup", err)
      setNote("The backup could not be created. Nothing was changed.")
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setNote(null)
    setUnderstood(false)
    setRestore({ kind: "checking", name: file.name })
    try {
      const result = await validateBackup(await file.text(), knownIds(bundledBank))
      if (!result.ok) return setRestore({ kind: "rejected", name: file.name, errors: result.errors })
      const now = groupCountsOf(await countEverything())
      const rows = result.summary.groups.map((g, i) => ({ id: g.id, label: g.label, now: now[i].count, backup: g.count }))
      setRestore({ kind: "preview", name: file.name, backup: result.backup, rows, warnings: result.warnings, createdAt: result.summary.createdAt })
    } catch (err) {
      console.error("Could not read the backup", err)
      setRestore({ kind: "rejected", name: file.name, errors: ["The file could not be read. Nothing was changed."] })
    }
  }

  async function confirmRestore() {
    if (restore.kind !== "preview" || !understood || lock.current) return
    lock.current = true
    const { backup } = restore
    setRestore({ kind: "restoring" })
    try {
      await restoreBackup(backup)
      setRestore({ kind: "done" })
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    } catch (err) {
      const e = err instanceof RestoreError ? err : null
      setRestore({ kind: "failed", message: err instanceof Error ? err.message : String(err), rolledBack: e?.rolledBack ?? true, emergency: e?.previous ?? null })
    } finally {
      lock.current = false
    }
  }

  async function startDelete(s: DeleteScope) {
    setToDelete(null)
    setScope(s)
    setTyped("")
    setDeleteError(null)
    setDeleted(null)
    setToDelete(await previewDeletion(s))
  }

  async function confirmDelete() {
    if (!scope || lock.current) return
    lock.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteData(scope)
      setDeleted(`${scope.title.replace("Delete ", "")} deleted.`)
      setScope(null)
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    } catch (err) {
      console.error("Deletion failed", err)
      const e = err instanceof DeleteError ? err : null
      setDeleteError({
        message: e ? "Not everything was deleted. The data listed below is still on this device." : "The deletion could not be completed. Nothing has been confirmed as deleted.",
        cleared: e?.cleared ?? [],
        failed: e?.failed ?? [],
        remaining: e?.remaining ?? [],
      })
      if (e) setToDelete(e.remaining)
    } finally {
      lock.current = false
      setDeleting(false)
    }
  }

  const busy = restore.kind === "restoring" || restore.kind === "done" || deleted !== null

  return (
    <Panel className="p-6" id="privacy-data" data-testid="privacy-settings">
      <h2 className="text-lg font-medium">Privacy &amp; Data</h2>
      <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
        Everything stays on this device. The app has no accounts and sends nothing anywhere. This section shows what is stored, lets you back it up and restore it, and lets you delete it. The{" "}
        <a href="#privacy-notice" className="underline underline-offset-2 hover:text-foreground">
          Privacy &amp; Data notice
        </a>{" "}
        is below.
      </p>

      <section className="mt-5" aria-labelledby="stored-heading" data-testid="stored-summary">
        <h3 id="stored-heading" className="text-sm font-medium">
          What is stored on this device
        </h3>
        {usage ? (
          <>
            <ul className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/[0.07]">
              {usage.rows.map((r) => (
                <li key={r.label} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
                  <span>{r.label}</span>
                  <span className="tabular-nums text-muted-foreground" data-testid="stored-count">
                    {r.count}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              {usage.bytes === null ? "Your browser did not report how much space this uses." : `About ${kb(usage.bytes)} in use (your browser's estimate, including fonts and caches for this site).`} The browser can remove this data if you clear site data or
              storage runs low.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Counting…</p>
        )}
      </section>

      <section className="mt-6 border-t border-white/[0.07] pt-5" aria-labelledby="backup-heading" data-testid="backup-section">
        <h3 id="backup-heading" className="text-sm font-medium">
          Backup and restore
        </h3>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">
          A backup is one file with everything: imported content, all progress and History, unfinished drafts, Behavioural answers and settings. It is a plain, unencrypted file, so keep it somewhere you trust.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <GlowButton tone="blue" solid className="h-10 gap-2 px-4 text-sm" onClick={() => void downloadBackup()} disabled={busy} data-testid="backup-download">
            <Download className="size-4" aria-hidden />
            Download backup
          </GlowButton>
          <GlowButton className="h-10 gap-2 px-4 text-sm" onClick={() => input.current?.click()} disabled={busy || restore.kind === "checking"} data-testid="restore-choose">
            <FileUp className="size-4" aria-hidden />
            Restore from backup…
          </GlowButton>
          <input ref={input} type="file" accept=".json,application/json" hidden data-testid="restore-file" onChange={(e) => void onFile(e)} />
        </div>
        {note && (
          <p role="status" className="mt-3 text-sm text-muted-foreground" data-testid="backup-note">
            {note}
          </p>
        )}

        {restore.kind === "checking" && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            Checking {restore.name}…
          </p>
        )}
        {restore.kind === "rejected" && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="restore-rejected">
            <h4 className="font-medium">This file cannot be restored: {restore.name}</h4>
            <p className="mt-1 text-sm">Nothing was changed. Your current data is untouched.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {restore.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <GlowButton className="mt-3 h-9 px-3 text-sm" onClick={() => setRestore({ kind: "idle" })}>
              Dismiss
            </GlowButton>
          </div>
        )}
        {restore.kind === "preview" && (
          <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/15 p-4" data-testid="restore-preview">
            <div>
              <h4 className="font-medium">Backup checked: {restore.name}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Made {when.format(new Date(restore.createdAt))}. The file is complete and has not been changed since it was made.
              </p>
            </div>
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-grade-hard/40 bg-grade-hard/10 p-3 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-grade-hard" aria-hidden />
              <p>
                <strong>Restoring replaces everything on this device with the backup.</strong> Anything below that is not in the backup will be removed, even if you have more of it now. Unfinished drafts, answers and settings are replaced too.
              </p>
            </div>
            <table className="w-full text-sm" data-testid="restore-table">
              <caption className="sr-only">What the backup will replace</caption>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th scope="col" className="pb-2 font-normal">
                    Item
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    Now
                  </th>
                  <th scope="col" className="pb-2 text-right font-normal">
                    After restore
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {restore.rows.map((r) => (
                  <tr key={r.id} data-testid="restore-row" data-group={r.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {r.label}
                    </th>
                    <td className="py-2 text-right tabular-nums">{r.now}</td>
                    <td className={cn("py-2 text-right tabular-nums", r.backup !== r.now && "font-medium text-grade-hard")}>{r.backup}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {restore.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground" data-testid="restore-warnings">
                {restore.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">If the restore fails part-way, your current data is put back as it was.</p>
            <GlowButton className="h-9 gap-2 px-3 text-sm" onClick={() => void downloadBackup()} data-testid="backup-first">
              <Download className="size-4" aria-hidden />
              Download a backup of the current data first
            </GlowButton>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="restore-understood" />I understand that this replaces all the data on this device with the backup.
            </label>
            <div className="flex gap-3">
              <GlowButton tone="again" className="h-10 px-4 text-sm" disabled={!understood} onClick={() => void confirmRestore()} data-testid="restore-confirm">
                Replace my data with this backup
              </GlowButton>
              <GlowButton className="h-10 px-4 text-sm" onClick={() => setRestore({ kind: "idle" })} data-testid="restore-cancel">
                Cancel
              </GlowButton>
            </div>
          </div>
        )}
        {restore.kind === "restoring" && (
          <p role="status" className="mt-3 text-sm" data-testid="restore-progress">
            Restoring… do not close the app.
          </p>
        )}
        {restore.kind === "done" && (
          <p role="status" className="mt-3 text-sm text-grade-easy" data-testid="restore-done">
            Restore complete. The app is reloading to use the restored data.
          </p>
        )}
        {restore.kind === "failed" && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="restore-failed">
            <h4 className="font-medium">The restore failed</h4>
            <p className="mt-1 text-sm" data-testid="restore-failed-state">
              {restore.rolledBack ? "Your previous data was kept: nothing was lost or changed." : "Your previous data could not be put back automatically. Save the emergency copy below before doing anything else."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Reason: {restore.message}</p>
            {restore.emergency && (
              <GlowButton tone="blue" className="mt-3 h-9 gap-2 px-3 text-sm" onClick={() => save(JSON.stringify(restore.emergency) + "\n", `ib-prep-emergency-copy-${stamp()}.json`)} data-testid="emergency-download">
                <Download className="size-4" aria-hidden />
                Save the emergency copy of my previous data
              </GlowButton>
            )}
            <GlowButton className="mt-3 ml-2 h-9 px-3 text-sm" onClick={() => setRestore({ kind: "idle" })}>
              Dismiss
            </GlowButton>
          </div>
        )}
      </section>

      <section className="mt-6 border-t border-white/[0.07] pt-5" aria-labelledby="delete-heading" data-testid="delete-section">
        <h3 id="delete-heading" className="text-sm font-medium">
          Delete data
        </h3>
        <p className="mt-1 max-w-[75ch] text-sm text-muted-foreground">Each button removes a different, clearly stated part of your data. Deleting cannot be undone, so download a backup first if you might want it back.</p>
        <ul className="mt-3 space-y-3">
          {DELETE_SCOPES.map((s) => (
            <li key={s.id} className="rounded-xl border border-white/[0.08] p-4" data-testid="delete-row" data-scope={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-[60ch]">
                  <h4 className="font-medium">{s.title.replace("Delete ", "")}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">Removes: {s.removes.join("; ")}.</p>
                  <p className="mt-1 text-sm text-muted-foreground">Keeps: {s.keeps.join("; ")}.</p>
                </div>
                <GlowButton tone="again" className="h-9 gap-2 px-3 text-sm" disabled={busy} onClick={() => void startDelete(s)} aria-label={`${s.title}…`} data-testid={`delete-${s.id}`}>
                  <Trash2 className="size-4" aria-hidden />
                  Delete…
                </GlowButton>
              </div>
              {scope?.id === s.id && (
                <div role="alertdialog" aria-label={`Confirm: ${s.title}`} className="mt-4 space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4" data-testid="delete-confirm">
                  <p className="text-sm font-medium">This will permanently remove:</p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {s.removes.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <p className="text-sm" data-testid="delete-counts">
                    Right now that is: {toDelete === null ? "being counted" : toDelete.length === 0 ? "nothing (there is no data of this kind)" : toDelete.map((g) => `${g.label}: ${g.count}`).join("; ")}.
                  </p>
                  <p className="text-sm text-muted-foreground">It keeps: {s.keeps.join("; ")}.</p>
                  <GlowButton className="h-9 gap-2 px-3 text-sm" onClick={() => void downloadBackup()} data-testid="delete-backup-first">
                    <Download className="size-4" aria-hidden />
                    Download a backup first
                  </GlowButton>
                  {s.id === "all" && (
                    <div>
                      <label htmlFor="delete-typed" className="mb-1.5 block text-sm">
                        Type <strong>DELETE</strong> to confirm
                      </label>
                      <input id="delete-typed" className={cn(fieldClass, "max-w-xs")} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-testid="delete-typed" />
                    </div>
                  )}
                  {deleteError && (
                    <div role="alert" className="space-y-1 text-sm" data-testid="delete-error">
                      <p className="font-medium text-destructive">{deleteError.message}</p>
                      {deleteError.cleared.length > 0 && <p data-testid="delete-cleared">Cleared: {deleteError.cleared.join("; ")}.</p>}
                      {deleteError.failed.length > 0 && <p data-testid="delete-failed">Could not clear: {deleteError.failed.join("; ")}.</p>}
                      {deleteError.remaining.length > 0 && <p data-testid="delete-remaining">Still stored: {deleteError.remaining.map((g) => `${g.label}: ${g.count}`).join("; ")}.</p>}
                      <p className="text-muted-foreground">Nothing is lost by trying again. Choose the button to retry.</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <GlowButton tone="again" solid className="h-10 px-4 text-sm" disabled={deleting || (s.id === "all" && typed.trim() !== "DELETE")} onClick={() => void confirmDelete()} data-testid="delete-confirm-yes">
                      {deleteError ? `Retry: ${s.title.toLowerCase()}` : s.title}
                    </GlowButton>
                    <GlowButton className="h-10 px-4 text-sm" onClick={() => setScope(null)} data-testid="delete-cancel">
                      Cancel
                    </GlowButton>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        {deleted && (
          <p role="status" className="mt-3 text-sm text-grade-easy" data-testid="delete-done">
            {deleted} The app is reloading.
          </p>
        )}
      </section>
    </Panel>
  )
}
