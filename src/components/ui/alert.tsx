import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-lg border px-4 py-3 text-sm leading-relaxed", {
  variants: {
    variant: {
      info: "border-gray-200 bg-white text-gray-600",
      danger:
        "border-red-200 bg-white text-red-600",
    },
  },
  defaultVariants: { variant: "info" },
});

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === "danger" ? "alert" : "note"}
      className={cn(alertVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Alert };
