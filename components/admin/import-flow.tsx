"use client";

import { CheckCircle2, Download } from "lucide-react";
import { useActionState } from "react";
import { applyImportAction, previewImportAction, type ImportState } from "@/app/admin/actions";
import { FormMessage } from "@/components/forms/fields";
import { Button, ButtonLink } from "@/components/ui/button";

async function importStep(prev: ImportState, formData: FormData): Promise<ImportState> {
  const intent = formData.get("intent");
  if (intent === "apply") return applyImportAction(prev, formData);
  if (intent === "reset") return { step: "upload" };
  return previewImportAction(prev, formData);
}

const FIELD_LABELS: Record<string, string> = {
  price_cents: "price",
  core_charge_cents: "core charge",
  mfr_part_number: "mfr part #",
  ship_class: "shipping",
  weight_lb: "weight",
  family_key: "family",
};
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f.replace(/_/g, " ");

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="flex flex-col rounded-md border border-edge bg-surface px-4 py-3">
      <span className={`font-display text-4xl font-bold ${tone === "danger" && value > 0 ? "text-danger" : ""}`}>{value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </div>
  );
}

export function ImportFlow() {
  const [state, action, pending] = useActionState(importStep, { step: "upload" } as ImportState);

  if (state.step === "done" && state.result) {
    const r = state.result;
    return (
      <div className="flex flex-col gap-5 rounded-md border-2 border-ok bg-surface p-6" role="status">
        <p className="flex items-center gap-2 text-lg font-semibold text-ok">
          <CheckCircle2 size={22} aria-hidden="true" /> Import finished
        </p>
        <p>
          Created {r.created} product{r.created === 1 ? "" : "s"}, updated {r.updated}
          {r.brandsCreated ? `, added ${r.brandsCreated} brand${r.brandsCreated === 1 ? "" : "s"}` : ""}
          {r.stockRows ? ` and set stock on ${r.stockRows}` : ""}. The site is already showing the changes.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/admin/products" variant="dark" size="sm">View products</ButtonLink>
          <form action={action}>
            <input type="hidden" name="intent" value="reset" />
            <Button type="submit" variant="quiet" size="sm">Import another file</Button>
          </form>
        </div>
      </div>
    );
  }

  if (state.step === "preview" && state.summary) {
    const s = state.summary;
    const errorCount = state.errorCount ?? 0;
    const nothingToDo = s.createCount + s.updateCount === 0;
    return (
      <div className="flex flex-col gap-6">
        <p>
          <strong>{state.fileName}</strong>: {s.rows} row{s.rows === 1 ? "" : "s"} read. Nothing has been saved yet.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Stat label="New products" value={s.createCount} />
          <Stat label="Updated" value={s.updateCount} />
          <Stat label="Unchanged" value={s.unchanged} />
          <Stat label="Problems" value={errorCount} tone="danger" />
        </div>

        {s.ignoredHeaders.length > 0 && (
          <p className="text-sm text-fg-muted">
            Ignored columns the importer doesn’t recognise: {s.ignoredHeaders.join(", ")}.
          </p>
        )}
        {s.newBrands.length > 0 && <p className="text-sm">New brands to add: {s.newBrands.join(", ")}.</p>}

        {errorCount > 0 && (
          <section aria-labelledby="errors-heading" className="rounded-md border-2 border-danger bg-surface p-5">
            <h2 id="errors-heading" className="mb-2 font-semibold text-danger">
              Fix {errorCount === 1 ? "this problem" : `these ${errorCount} problems`} in the spreadsheet, then upload it again
            </h2>
            <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
              {state.errors?.map((err, i) => (
                <li key={i}>
                  <span className="font-semibold">Row {err.line}</span>
                  {err.sku ? <span className="font-mono"> {err.sku}</span> : null}
                  : {err.message}
                </li>
              ))}
            </ul>
            {errorCount > (state.errors?.length ?? 0) && <p className="mt-2 text-sm text-fg-muted">…and {errorCount - (state.errors?.length ?? 0)} more.</p>}
          </section>
        )}

        {s.createCount > 0 && (
          <details className="rounded-md border border-edge bg-surface p-4">
            <summary className="cursor-pointer font-semibold">New products ({s.createCount})</summary>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {s.creates.map((c) => (
                <li key={c.line}><span className="font-mono">{c.sku}</span> — {c.name}</li>
              ))}
              {s.createCount > s.creates.length && <li className="text-fg-muted">…and {s.createCount - s.creates.length} more</li>}
            </ul>
          </details>
        )}
        {s.updateCount > 0 && (
          <details className="rounded-md border border-edge bg-surface p-4">
            <summary className="cursor-pointer font-semibold">Updates ({s.updateCount})</summary>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {s.updates.map((u) => (
                <li key={u.line}><span className="font-mono">{u.sku}</span>: {u.fields.map(fieldLabel).join(", ")}</li>
              ))}
              {s.updateCount > s.updates.length && <li className="text-fg-muted">…and {s.updateCount - s.updates.length} more</li>}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap gap-3">
          {errorCount === 0 && !nothingToDo && (
            <form action={action}>
              <input type="hidden" name="intent" value="apply" />
              <input type="hidden" name="csv" value={state.csv ?? ""} />
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Importing…" : `Import ${s.createCount + s.updateCount} change${s.createCount + s.updateCount === 1 ? "" : "s"}`}
              </Button>
            </form>
          )}
          <form action={action}>
            <input type="hidden" name="intent" value="reset" />
            <Button type="submit" variant="quiet" size="lg" disabled={pending}>{errorCount ? "Upload a fixed file" : "Cancel"}</Button>
          </form>
        </div>
        {nothingToDo && errorCount === 0 && <p className="text-fg-muted">Everything in this file already matches the catalog.</p>}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <form action={action} className="flex flex-col gap-4 rounded-md border border-edge bg-surface p-6">
        <input type="hidden" name="intent" value="preview" />
        <FormMessage message={state.error} />
        <label htmlFor="file" className="text-sm font-semibold">Spreadsheet (.csv)</label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-describedby="file-hint"
          className="text-sm file:mr-3 file:h-11 file:cursor-pointer file:rounded file:border file:border-edge-strong file:bg-surface file:px-4 file:font-semibold file:text-fg"
        />
        <span id="file-hint" className="text-[13px] text-fg-muted">Up to 5,000 rows. You’ll see a preview before anything is saved.</span>
        <div>
          <Button type="submit" size="lg" disabled={pending}>{pending ? "Checking…" : "Preview import"}</Button>
        </div>
      </form>
      <div className="flex flex-col gap-3 text-sm">
        <h2 className="font-semibold">How it works</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Rows are matched to existing products by <strong>SKU</strong>. A new SKU creates a product.</li>
          <li>Only the columns in your file change. Leave a column out to keep what’s there.</li>
          <li>New products need a <strong>name</strong> and <strong>category</strong> (electric-motors, pumps, blowers, vacuum-pumps, starters-controls or alternators).</li>
          <li>Blank price means “price on request”. Blank status means active.</li>
          <li>Specs go in one cell as <code>Label: value; Label: value</code>.</li>
        </ul>
        <div className="flex flex-wrap gap-3 pt-1">
          <a href="/admin/import/template" className="inline-flex items-center gap-1.5 font-semibold">
            <Download size={16} aria-hidden="true" /> Download the template
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a file download from a route handler, not a page */}
          <a href="/admin/products/export" className="inline-flex items-center gap-1.5 font-semibold">
            <Download size={16} aria-hidden="true" /> Export current catalog
          </a>
        </div>
      </div>
    </div>
  );
}
