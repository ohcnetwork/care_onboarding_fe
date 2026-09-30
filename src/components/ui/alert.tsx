import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-lg border px-4 py-3 text-sm leading-relaxed", {
  variants: {
    variant: {
      info: "border-gray-200 bg-white text-gray-600",
      danger:
        "border-red-200 bg-white text-red-600",
      success: "border-green-200 bg-green-50 text-green-800",
    },
  },
  defaultVariants: { variant: "info" },
});

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "danger" ? "alert" : variant === "success" ? "status" : "note"}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    >
      {variant === "success" ? <div className="flex items-start gap-3">
        <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-green-700" />
        <div>{children}</div>
      </div> : children}
    </div>
  );
}

export { Alert };
