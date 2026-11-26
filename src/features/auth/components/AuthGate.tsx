import { Sheet } from '@/components/ui/sheet';
import { useUi } from '@/store/ui';
import { AuthForm } from './AuthForm';

/** Sign-in sheet that appears in place, so people never lose what they were doing. */
export function AuthGate() {
  const { open, reason, onDone } = useUi((s) => s.authGate);
  const close = useUi((s) => s.closeAuthGate);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} title="Sign in to continue" description={reason} size="sm">
      <AuthForm
        embedded
        onDone={() => {
          close();
          onDone?.();
        }}
      />
    </Sheet>
  );
}
