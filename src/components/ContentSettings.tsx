import { useRef, useState, type ChangeEvent } from "react"
import { Download, FileUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { GlowButton, Panel } from "@/components/kit"
import { useContent } from "@/content/contentContext"
import type { ItemType, Preview, PreviewItem } from "@/content/merge"
import { MAX_PACK_BYTES } from "@/content/schema"
import type { ContentPack } from "@/content/types"
import { parsePack } from "@/content/validate"

type Stage =
  | { kind: "idle" }
  | { kind: "rejected"; heading: string; fileName: string; errors: string[] }
  | { kind: "preview"; fileName: string; pack: ContentPack; preview: Preview; warnings: string[] }
  | { kind: "done"; message: string }

const TYPE_LABEL: Record<ItemType, string> = {
  question: "Question",
  scenario: "Scenario",
  concept: "Concept",
  choice: "Multiple choice",
  process: "Process",
  statement: "Three statements",
  valuation: "Valuation builder",
  quickMath: "Quick maths",
  behavioural: "Behavioural",
}
const MAX_LISTED_ERRORS = 50
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function ChangeList({ title, items }: { title: string; items: PreviewItem[] }) {
  if (items.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="thin-scroll max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/15">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <Badge variant="secondary">{TYPE_LABEL[item.type]}</Badge>
            <span className="font-medium">{item.label}</span>
            <span className="text-muted-foreground">{item.id}</span>
            {item.category && (
              <span className="text-muted-foreground">
                {item.category} › {item.subcategory}
              </span>
            )}
            {item.detail && <span className="text-muted-foreground">{item.detail}</span>}
            {item.changedFields && (
              <span className="text-muted-foreground">changes: {item.changedFields.join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ContentSettings() {
  const content = useContent()
  const input = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: "idle" })
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { bank } = content
  const last = content.imports[content.imports.length - 1]

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // lets the same file be chosen again
    if (!file) return
    setNote(null)
    const reject = (errors: string[]) => setStage({ kind: "rejected", heading: "Import rejected", fileName: file.name, errors })

    if (file.size > MAX_PACK_BYTES) return reject([`The file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_PACK_BYTES / 1048576} MB.`])
    let text: string
    try {
      text = await file.text()
    } catch {
      return reject(["The file could not be read."])
    }
    const result = parsePack(text, content.known)
    if (!result.ok) return reject(result.errors)
    setStage({ kind: "preview", fileName: file.name, pack: result.pack, warnings: result.warnings, preview: content.preview(result.pack) })
  }

  async function confirm() {
    if (stage.kind !== "preview" || busy) return
    setBusy(true)
    try {
      const done = await content.commit(stage.pack)
      setStage({
        kind: "done",
        message: `Imported content version ${stage.pack.contentVersion}: ${plural(done.added, "item")} added, ${plural(done.updated, "item")} updated. Saved progress and History were not changed.`,
      })
    } catch (err) {
      console.error("Import failed", err)
      setStage({
        kind: "rejected",
        heading: "Import failed",
        fileName: stage.fileName,
        errors: ["The content could not be saved, so nothing was changed.", err instanceof Error ? err.message : String(err)],
      })
    } finally {
      setBusy(false)
    }
  }

  function exportBank() {
    const pack = content.exportPack()
    const blob = new Blob([JSON.stringify(pack, null, 2) + "\n"], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ib-prep-content-${pack.contentVersion.replace(/[^a-z0-9._-]+/gi, "-")}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNote(
      `Exported ${plural(pack.questions?.length ?? 0, "question")}, ${plural(pack.scenarios?.length ?? 0, "scenario")}, ${plural(pack.multipleChoice?.length ?? 0, "multiple-choice question")}, ${plural(pack.processes?.length ?? 0, "process", "processes")}, ${plural(pack.threeStatementExercises?.length ?? 0, "three-statement exercise")}, ${plural(pack.valuationExercises?.length ?? 0, "valuation exercise")}, ${plural(pack.quickMathQuestions?.length ?? 0, "quick maths question")}, ${plural(pack.behaviouralQuestions?.length ?? 0, "behavioural question")} and ${plural(pack.concepts?.length ?? 0, "concept")}.`,
    )
  }

  const changes = stage.kind === "preview" ? stage.preview : null
  const nothingToDo = changes !== null && changes.added + changes.updated === 0

  return (
    <Panel className="p-6" id="content-settings" data-testid="content-settings">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Content</h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="content-summary">
            Version {content.contentVersion} · {plural(bank.questions.length, "question")} ·{" "}
            {plural(bank.scenarios.length, "scenario")} · {plural(bank.multipleChoice.length, "multiple-choice question")} ·{" "}
            {plural(bank.processes.length, "process", "processes")} · {plural(bank.threeStatementExercises.length, "three-statement exercise")} ·{" "}
            {plural(bank.valuationExercises.length, "valuation exercise")} · {plural(bank.quickMathQuestions.length, "quick maths question")} · {plural(bank.behaviouralQuestions.length, "behavioural question")} ·{" "}
            {plural(bank.concepts.length, "concept")}
            {content.importedItemCount > 0 && ` · ${plural(content.importedItemCount, "item")} from imports`}
          </p>
          {last && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Last import: version {last.contentVersion}, {new Date(last.importedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <GlowButton className="h-10 gap-2 px-4 text-sm" onClick={exportBank} data-testid="content-export">
            <Download className="size-4" aria-hidden />
            Export content bank
          </GlowButton>
          <GlowButton tone="blue" solid className="h-10 gap-2 px-4 text-sm" onClick={() => input.current?.click()} data-testid="content-import">
            <FileUp className="size-4" aria-hidden />
            Import pack…
          </GlowButton>
          <input ref={input} type="file" accept=".json,application/json" hidden data-testid="content-file-input" onChange={onFile} />
        </div>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Importing adds new items and updates existing ones by their ID. Items missing from a pack are kept, and your saved progress and History are never changed.
      </p>

      {note && (
        <p role="status" className="mt-4 text-sm text-muted-foreground" data-testid="content-note">
          {note}
        </p>
      )}

      {stage.kind === "done" && (
        <p role="status" className="mt-4 text-sm text-grade-easy" data-testid="content-done">
          {stage.message}
        </p>
      )}

      {stage.kind === "rejected" && (
        <div role="alert" className="mt-5 rounded-xl border border-destructive/40 bg-destructive/10 p-4" data-testid="content-rejected">
          <p className="font-medium text-destructive">
            {stage.heading}: {stage.fileName}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Nothing was imported and your stored content is unchanged.</p>
          <ul className="thin-scroll mt-3 max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-sm">
            {stage.errors.slice(0, MAX_LISTED_ERRORS).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {stage.errors.length > MAX_LISTED_ERRORS && (
            <p className="mt-2 text-sm text-muted-foreground">…and {stage.errors.length - MAX_LISTED_ERRORS} more.</p>
          )}
        </div>
      )}

      {stage.kind === "preview" && changes && (
        <div className="mt-5 space-y-5 border-t border-white/[0.07] pt-5" data-testid="content-preview">
          <div>
            <h3 className="font-medium">
              Preview: {stage.pack.title ?? stage.fileName}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="content-preview-counts">
              Content version {stage.pack.contentVersion} · {plural(changes.added, "item")} to add · {plural(changes.updated, "item")} to update · {changes.unchanged} unchanged
            </p>
          </div>

          <ChangeList title="Additions" items={changes.items.filter((i) => i.status === "add")} />
          <ChangeList title="Updates" items={changes.items.filter((i) => i.status === "update")} />

          {changes.newTopics.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="content-new-topics">
              New topics for the selectors:{" "}
              {changes.newTopics
                .map((t) => `${t.category} › ${t.subcategory} (${t.kind === "question" ? "Questions" : "Scenarios"})`)
                .join(", ")}
            </p>
          )}

          {stage.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-grade-hard">
              {stage.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {nothingToDo && (
            <p className="text-sm text-muted-foreground">Nothing to import: every item already matches what is stored.</p>
          )}

          <div className="flex gap-2">
            <GlowButton tone="blue" solid className="h-10 px-4 text-sm" disabled={nothingToDo || busy} onClick={confirm} data-testid="content-confirm">
              Confirm import
            </GlowButton>
            <GlowButton className="h-10 px-4 text-sm" disabled={busy} onClick={() => setStage({ kind: "idle" })} data-testid="content-cancel">
              Cancel
            </GlowButton>
          </div>
        </div>
      )}
    </Panel>
  )
}
