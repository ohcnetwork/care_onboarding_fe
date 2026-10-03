import { useEffect, type ReactNode } from "react";

import { FootNote, ScreenFoot } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";

export function StepFoot({
  primary,
  onPrimary,
  primaryDisabled,
  busy,
  busyLabel = "Saving...",
  onSkip,
  onBack,
  note,
}: {
  primary: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onSkip?: () => void;
  onBack?: () => void;
  note?: ReactNode;
}) {
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  return (
    <ScreenFoot>
      {onBack ? (
        <Button className="order-2 sm:order-1" disabled={busy} onClick={onBack}>
          Back
        </Button>
      ) : null}
      <Button variant="primary" size="lg" className="order-1 w-full sm:order-2 sm:w-auto" aria-busy={busy}
        disabled={primaryDisabled || busy} onClick={(event) => {
          const screen = event.currentTarget.closest('[data-slot="setup-screen"]');
          onPrimary();
          requestAnimationFrame(() => {
            screen?.querySelector<HTMLElement>(
              'input[aria-invalid="true"], textarea[aria-invalid="true"], button[aria-invalid="true"], fieldset[aria-invalid="true"] button:not(:disabled)',
            )?.focus();
          });
        }}>
        {busy ? <span aria-hidden="true"><Spinner /></span> : null}
        {busy ? busyLabel : primary}
      </Button>
      {onSkip ? (
        <Button className="order-3" variant="ghost" disabled={busy} onClick={onSkip}>
          Do this later
        </Button>
      ) : null}
      {note ? <div className="order-last w-full"><FootNote>{note}</FootNote></div> : null}
    </ScreenFoot>
  );
}
