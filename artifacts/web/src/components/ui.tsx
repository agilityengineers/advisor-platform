import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ap";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-brand text-[var(--brand-on-primary)] hover:bg-brand-hover shadow-[0_8px_20px_rgba(22,104,240,0.22)]",
  secondary: "bg-white text-navy border border-line hover:border-blue hover:text-blue",
  ghost: "bg-transparent text-body hover:bg-pale hover:text-navy",
  danger: "bg-danger text-white hover:bg-[#a52d19]",
  ap: "bg-ap-brass text-white hover:bg-[#956823] rounded-[4px]",
};
const sizeClass: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-5 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = "primary", size = "md", loading, disabled, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-input border border-line bg-white px-3.5 text-[14.5px] text-navy outline-none transition-colors placeholder:text-[#9AAABF] focus:border-brand focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn("w-full rounded-input border border-line bg-white px-3.5 py-2.5 text-[14.5px] text-navy outline-none transition-colors placeholder:text-[#9AAABF] focus:border-brand focus:ring-4 focus:ring-brand/15", className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn("h-11 w-full rounded-input border border-line bg-white px-3 text-[14.5px] text-navy outline-none focus:border-brand focus:ring-4 focus:ring-brand/15", className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-[12.5px] font-bold tracking-[0.02em] text-body-2">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-[12.5px] font-semibold text-danger">{error}</span> : hint ? <span className="mt-1.5 block text-[12.5px] text-muted">{hint}</span> : null}
    </label>
  );
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "success" | "warn" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    info: "bg-pale text-navy border-line",
    success: "bg-[#EAF8F0] text-success-deep border-[#BFE7D2]",
    warn: "bg-[#FFF6E8] text-warn-deep border-[#F3D9AE]",
    danger: "bg-[#FDECE9] text-danger border-[#F2C2B9]",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-[12px] border px-4 py-3 text-[13.5px] font-semibold leading-snug", tones[tone], className)}>
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-6 w-6 animate-spin text-brand", className)} aria-label="Loading" />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-card border border-line bg-white shadow-card", className)}>{children}</div>;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted-2", className)}>{children}</div>;
}
