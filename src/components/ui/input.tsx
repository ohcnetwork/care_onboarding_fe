import * as React from "react";

import { cn } from "@/lib/utils";
import { useField } from "@/components/field";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const field = useField();
  return (
    <input
      type={type}
      id={field?.id}
      aria-describedby={field?.descriptionId}
      aria-invalid={field?.invalid}
      aria-required={field?.required}
      data-slot="input"
      className={cn(
        "flex w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-base shadow-xs transition-colors md:text-sm",
        "placeholder:text-gray-500 focus-visible:outline-none focus:ring-brand focus:border-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
