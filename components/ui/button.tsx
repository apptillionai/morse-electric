import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover hover:text-on-accent",
  dark: "bg-bold text-on-bold hover:bg-bold-hover hover:text-on-bold",
  outline: "border border-bold text-fg hover:bg-bold hover:text-on-bold",
  "outline-light": "border border-inverse-edge-strong text-on-inverse hover:border-on-inverse hover:text-on-inverse",
  quiet: "border border-edge-strong bg-surface text-fg hover:border-bold hover:text-fg",
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
