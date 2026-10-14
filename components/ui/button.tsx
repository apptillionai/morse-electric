import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-copper text-white hover:bg-copper-dark hover:text-white",
  dark: "bg-ink text-white hover:bg-ink-2 hover:text-white",
  outline: "border border-ink text-ink hover:bg-ink hover:text-white",
  "outline-light": "border border-steel text-white hover:border-white hover:text-white",
  quiet: "border border-field bg-white text-ink hover:border-ink hover:text-ink",
} as const;

const SIZES = {
  sm: "h-11 px-4 text-sm",
  md: "h-12 px-5 text-[15px]",
  lg: "h-14 px-7 text-base",
} as const;

export interface ButtonStyleProps {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}

export function buttonClasses({ variant = "primary", size = "md" }: ButtonStyleProps = {}, className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded font-semibold no-underline transition-colors disabled:pointer-events-none disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={buttonClasses({ variant, size }, className)} {...props} />;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return <button type={type} className={buttonClasses({ variant, size }, className)} {...props} />;
}
