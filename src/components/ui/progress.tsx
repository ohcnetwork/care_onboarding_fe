import * as ProgressPrimitive from "@radix-ui/react-progress";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-gray-900/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full rounded-full bg-brand-ink transition-[width] duration-300 ease-out"
        style={{ width: `${value ?? 0}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
