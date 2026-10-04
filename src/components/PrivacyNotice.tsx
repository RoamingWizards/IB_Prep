import { Fragment } from "react"
import { Panel } from "@/components/kit"
import { NOTICE_INTRO, NOTICE_SECTIONS, PLACEHOLDERS, type Segment } from "@/lib/privacyNotice"

const byId = new Map(PLACEHOLDERS.map((p) => [p.id, p]))

/** A detail the publisher still has to supply: visibly marked, and announced as such to screen readers. */
function Gap({ id }: { id: string }) {
  const p = byId.get(id)
  return (
    <mark className="rounded border border-grade-hard/60 bg-grade-hard/15 px-1 py-0.5 text-foreground" data-testid="notice-placeholder" data-placeholder={id}>
      <span className="sr-only">To be supplied by the publisher: </span>[{p?.label ?? id}: to be supplied]
    </mark>
  )
}

function Line({ parts }: { parts: Segment[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{typeof p === "string" ? p : <Gap id={p.placeholder} />}</Fragment>
      ))}
    </>
  )
}

/** The Privacy & Data notice: a draft built from verified behaviour, with the publisher's missing details marked. */
export function PrivacyNotice() {
  return (
    <Panel className="p-6" data-testid="privacy-notice" id="privacy-notice" aria-labelledby="privacy-notice-title" role="region">
      <h2 id="privacy-notice-title" className="text-lg font-medium">
        Privacy &amp; Data notice <span className="ml-2 rounded-md border border-grade-hard/50 px-2 py-0.5 align-middle text-xs font-normal text-grade-hard">Draft</span>
      </h2>
      <p className="mt-2 max-w-[75ch] text-sm leading-relaxed text-muted-foreground" data-testid="notice-intro">
        <Line parts={NOTICE_INTRO} />
      </p>

      <div className="mt-4 rounded-xl border border-grade-hard/40 bg-grade-hard/10 p-4" role="note" data-testid="notice-missing">
        <h3 className="text-sm font-medium">Details the publisher must supply before this is published</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {PLACEHOLDERS.map((p) => (
            <li key={p.id}>
              <strong>{p.label}.</strong> <span className="text-muted-foreground">{p.why}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 max-w-[75ch] space-y-6">
        {NOTICE_SECTIONS.map((sec) => (
          <section key={sec.id} aria-labelledby={`notice-${sec.id}`} data-testid="notice-section" data-section={sec.id}>
            <h3 id={`notice-${sec.id}`} className="text-base font-medium">
              {sec.heading}
            </h3>
            {sec.paragraphs?.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed">
                <Line parts={p} />
              </p>
            ))}
            {sec.items && (
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                {sec.items.map((it, i) => (
                  <li key={i}>
                    <Line parts={it} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Panel>
  )
}
