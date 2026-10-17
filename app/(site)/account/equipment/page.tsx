import { Cog, Plus } from "lucide-react";
import Link from "next/link";
import { AccountShell } from "@/components/account/account-shell";
import { ButtonLink } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/admin/requests";
import { requireCustomer } from "@/lib/customers/account";
import { nameplateLine, replacementHref } from "@/lib/customers/equipment";
import { listEquipment } from "@/lib/customers/equipment-store";
import { EQUIPMENT_TYPES } from "@/lib/requests/schemas";
import { createSessionClient } from "@/lib/supabase/server";

export const metadata = { title: "Equipment" };

const date = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(iso));

const SAVED: Record<string, string> = { added: "Unit added.", updated: "Changes saved.", removed: "Unit removed from your list." };

export default async function EquipmentPage(props: PageProps<"/account/equipment">) {
  const [{ id, customer }, sp] = await Promise.all([requireCustomer(), props.searchParams]);
  const units = await listEquipment(await createSessionClient(), id);
  const saved = typeof sp.saved === "string" ? SAVED[sp.saved] : undefined;

  return (
    <AccountShell current="/account/equipment" name={customer.name} company={customer.company}>
      {saved && <p role="status" className="rounded border-2 border-ok bg-surface px-4 py-3 text-sm font-medium text-ok">{saved}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase tracking-[0.03em]">
            <Cog size={24} aria-hidden="true" /> Your equipment
          </h2>
          <p className="text-fg-muted">
            Keep your motors and pumps on file with their nameplate details. Request a repair in one click, see each
            unit’s repair history, and find a matching replacement.
          </p>
        </div>
        <ButtonLink href="/account/equipment/new" size="sm"><Plus size={16} aria-hidden="true" /> Add a unit</ButtonLink>
      </div>

      {units.length === 0 ? (
        <p className="rounded-md border border-edge bg-surface p-5 text-fg-muted">
          Nothing here yet. <Link href="/account/equipment/new">Add your first unit</Link>: a name you’ll recognise and
          whatever’s on the nameplate.
        </p>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Your equipment">
          {units.map((u) => {
            const replacement = replacementHref(u);
            const nameplate = nameplateLine(u);
            return (
              <li key={u.id} id={`unit-${u.id}`} className="flex flex-col gap-3 rounded-md border border-edge bg-surface p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-lg font-semibold">{u.label}</h3>
                  <span className="text-sm text-fg-muted">
                    {EQUIPMENT_TYPES[u.equipment_type]}
                    {u.location && <> · {u.location}</>}
                  </span>
                </div>
                {nameplate && <p className="font-mono text-[13px] text-fg-muted">{nameplate}</p>}
                {(u.model || u.serial) && (
                  <p className="text-sm text-fg-muted">
                    {u.model && <>Model <span className="font-mono">{u.model}</span></>}
                    {u.model && u.serial && " · "}
                    {u.serial && <>Serial <span className="font-mono">{u.serial}</span></>}
                  </p>
                )}
                {u.notes && <p className="text-sm whitespace-pre-line">{u.notes}</p>}
                <div className="text-sm">
                  <p className="font-semibold">Repair history</p>
                  {u.jobs.length === 0 ? (
                    <p className="text-fg-muted">No repairs with us yet.</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {u.jobs.map((j) => (
                        <li key={j.id}>
                          <span className="font-mono font-semibold">{j.reference}</span> · {date(j.created_at)} · {STATUS_LABELS[j.status] ?? j.status}
                          <span className="text-fg-muted"> · {j.symptoms.length > 80 ? `${j.symptoms.slice(0, 80)}…` : j.symptoms}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/service?unit=${u.id}#request`} size="sm">Request a repair</ButtonLink>
                  {replacement && <ButtonLink href={replacement} size="sm" variant="quiet">Find a replacement</ButtonLink>}
                  <ButtonLink href={`/account/equipment/${u.id}`} size="sm" variant="quiet">Edit</ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}
