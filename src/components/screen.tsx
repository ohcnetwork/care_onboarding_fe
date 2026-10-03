import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Screen({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-slot="setup-screen" className={cn("flex min-w-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function ScreenHead({
  kicker,
  title,
  subtitle,
  className,
  onBack,
  backDisabled,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  className?: string;
  onBack?: () => void;
  backDisabled?: boolean;
}) {
  return (
    <div className={cn("px-4 pt-6 pb-5 md:px-6", className)}>
      {onBack ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 mb-3"
          disabled={backDisabled}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" strokeWidth={2.2} />
          Back
        </Button>
      ) : null}
      {kicker ? (
        <div className="mb-1.5 text-xs font-bold tracking-[0.04em] text-brand-ink uppercase">
          {kicker}
        </div>
      ) : null}
      <h1 className="text-2xl font-bold tracking-[-0.015em] text-ink">{title}</h1>
      {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export function ScreenBody({ className, children, disabled }: { className?: string; children: ReactNode; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className={cn("m-0 min-w-0 flex-1 border-0 px-4 pb-6 md:px-6", className)}>{children}</fieldset>
  );
}

export function ScreenFoot({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-line px-4 py-4 md:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FootNote({ children }: { children: ReactNode }) {
  return <span className="text-[13px] text-muted-foreground">{children}</span>;
}
