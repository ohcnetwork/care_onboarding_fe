import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-gray-400 bg-white shadow-sm hover:bg-gray-100 hover:text-gray-900",
        primary: "bg-brand-ink text-white shadow-sm hover:bg-brand-ink/90",
        destructive: "bg-red-500 text-white shadow-sm hover:bg-red-500/90",
        ghost: "hover:bg-gray-100 hover:text-gray-900",
      },
      size: {
        default: "h-9 px-4 py-2",
        lg: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
function Button({ className, variant, size, asChild, ...props }: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
