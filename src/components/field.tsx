import { createContext, useContext, useId, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const FieldContext = createContext<{ id: string; descriptionId?: string; invalid?: boolean; required?: boolean } | null>(null);
export const useField = () => useContext(FieldContext);

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const descriptionId = hint || error ? `${id}-description` : undefined;
  return (
    <FieldContext.Provider value={{ id, descriptionId, invalid: !!error, required }}>
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} className="mb-2 block">
        {label}
        {required ? <span aria-hidden="true" className="ml-0.5 text-danger-ink">*</span> : null}
      </Label>
      {children}
      {error ? (
        <div id={descriptionId} role="alert" className="mt-2 text-sm text-red-500">{error}</div>
      ) : hint ? (
        <div id={descriptionId} className="mt-2 text-sm text-muted-foreground">{hint}</div>
      ) : null}
    </div>
    </FieldContext.Provider>
  );
}
