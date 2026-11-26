import { toast } from 'sonner';
import { Switch } from '@/components/ui/controls';
import { useConfig, useConfigMutations } from '../hooks';
import { SettingRow } from './kit';

/** The "needs approval" switch shown above the Deals and Events queues. Saves as soon as it is flipped. */
export function ApprovalSetting({ field, title, description, noun }: { field: 'dealsRequireApproval' | 'eventsRequireApproval'; title: string; description: string; noun: string }) {
  const config = useConfig();
  const { update } = useConfigMutations();
  const on = config.data?.[field] ?? false;
  return (
    <div className="card mb-4 px-5">
      <SettingRow
        title={title}
        description={description}
        control={
          <Switch
            checked={on}
            disabled={!config.data || update.isPending}
            aria-label={title}
            onCheckedChange={(next) =>
              update.mutate(
                field === 'dealsRequireApproval' ? { dealsRequireApproval: next } : { eventsRequireApproval: next },
                { onSuccess: () => toast.success(next ? `New ${noun} now wait for approval` : `New ${noun} now go live straight away`) },
              )
            }
          />
        }
      />
    </div>
  );
}
