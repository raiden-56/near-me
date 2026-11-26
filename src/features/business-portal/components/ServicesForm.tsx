import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FieldError, Input } from '@/components/ui/field';
import { uid } from '@/lib/utils';
import { servicesSchema, type ServiceInput } from '@/services/businessPortal';
import type { BusinessListing } from '@/types';
import type { FormFooter } from './bits';

type Values = z.input<typeof servicesSchema>;

const MAX_SERVICES = 40;

interface ServicesFormProps {
  services: BusinessListing['services'];
  onSubmit: (services: ServiceInput[]) => Promise<unknown>;
  footer: FormFooter;
}

/** Add, edit, reorder and remove services. Nothing is stored until the form is saved. */
export function ServicesForm({ services, onSubmit, footer }: ServicesFormProps) {
  const form = useForm<Values>({
    resolver: zodResolver(servicesSchema),
    defaultValues: { services: services.map((s) => ({ id: s.id, name: s.name, price: s.price ?? '', note: s.note ?? '' })) },
    mode: 'onTouched',
  });
  // Rows carry their own `id`, so the list key lives under a different name.
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'services', keyName: 'rowKey' });
  const { errors, isSubmitting, isDirty } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values.services);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });

  const add = () => append({ id: uid('svc'), name: '', price: '', note: '' });

  return (
    <form onSubmit={submit} noValidate className="@container">
      {fields.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-bg-2 text-muted-2">
            <ListChecks className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="display-sm mt-3 text-[19px] text-ink">No services listed yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-2">List what customers can get from you: a haircut, a full-body check-up, a puncture repair, a masala dosa. Prices are optional.</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={add}>
            <Plus /> Add your first service
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[1fr_140px_1fr_116px] gap-2.5 px-1 pb-2 text-[13px] font-medium text-muted-2 @2xl:grid" aria-hidden>
            <span>Service</span>
            <span>Price</span>
            <span>Note</span>
            <span />
          </div>
          <ul className="space-y-2.5">
            {fields.map((field, index) => {
              const rowErrors = errors.services?.[index];
              const message = rowErrors?.name?.message ?? rowErrors?.price?.message ?? rowErrors?.note?.message;
              return (
                <li key={field.rowKey} className="rounded-2xl border border-line bg-surface p-3 @2xl:rounded-xl @2xl:border-0 @2xl:bg-transparent @2xl:p-0">
                  <div className="grid gap-2.5 @2xl:grid-cols-[1fr_140px_1fr_116px] @2xl:items-center">
                    <Input placeholder="Service name" aria-label={`Service ${index + 1} name`} aria-invalid={Boolean(rowErrors?.name)} {...form.register(`services.${index}.name`)} />
                    <Input placeholder="Price, e.g. ₹250" aria-label={`Service ${index + 1} price (optional)`} aria-invalid={Boolean(rowErrors?.price)} {...form.register(`services.${index}.price`)} />
                    <Input placeholder="Note (optional)" aria-label={`Service ${index + 1} note (optional)`} aria-invalid={Boolean(rowErrors?.note)} {...form.register(`services.${index}.note`)} />
                    <div className="flex items-center justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move service ${index + 1} up`}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(index, index + 1)} disabled={index === fields.length - 1} aria-label={`Move service ${index + 1} down`}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)} aria-label={`Remove service ${index + 1}`} className="text-danger hover:bg-danger-soft hover:text-danger">
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <FieldError>{message}</FieldError>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={add} disabled={fields.length >= MAX_SERVICES}>
              <Plus /> Add a service
            </Button>
            <p className="tabular text-[13px] text-muted-2">
              {fields.length} of {MAX_SERVICES}
            </p>
          </div>
        </>
      )}
      <FieldError>{(errors.services as { message?: string } | undefined)?.message}</FieldError>
      {footer({ submitting: isSubmitting, dirty: isDirty, reset: () => form.reset() })}
    </form>
  );
}
