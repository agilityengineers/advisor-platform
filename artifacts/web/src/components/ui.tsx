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

// ---------------------------------------------------------------------------
// Console primitives (Platform Admin / company console)
// ---------------------------------------------------------------------------

export function Pill({ children, tone = "blue", className }: { children: ReactNode; tone?: "blue" | "green" | "amber" | "grey" | "red" | "navy"; className?: string }) {
  const tones = {
    blue: "bg-pale text-blue-hover",
    green: "bg-[#EDF7F1] text-success-deep",
    amber: "bg-[#FFF8F0] text-warn-deep",
    grey: "bg-[#F1F4F8] text-muted",
    red: "bg-[#FDECE9] text-danger",
    navy: "bg-navy text-white",
  };
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-[5px] text-[12px] font-bold", tones[tone], className)}>{children}</span>;
}

export function KpiTile({ label, value, dark, sub }: { label: string; value: ReactNode; dark?: boolean; sub?: string }) {
  return (
    <div className={cn("rounded-card border p-[18px]", dark ? "border-navy bg-navy text-white" : "border-line bg-white")}>
      <div className={cn("text-[11.5px] font-bold tracking-[0.1em]", dark ? "text-[#7FB6FF]" : "text-muted-2")}>{label}</div>
      <div className="mt-2 font-display text-[28px] font-bold leading-none">{value}</div>
      {sub && <div className={cn("mt-2 text-[12px] font-semibold", dark ? "text-white/60" : "text-muted")}>{sub}</div>}
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3.5">
      <div>
        <h1 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-navy">{title}</h1>
        {sub && <div className="mt-[3px] text-[13.5px] font-semibold text-muted">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 540, labelledBy }: { title: string; onClose: () => void; children: ReactNode; width?: number; labelledBy?: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy/50" />
      <div role="dialog" aria-modal="true" aria-label={labelledBy ? undefined : title} className="relative max-h-[92vh] w-full overflow-y-auto rounded-[20px] bg-white p-7 shadow-[0_30px_80px_rgba(10,22,38,0.3)]" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between">
          <h3 className="m-0 font-display text-[20px] font-bold text-navy">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-line bg-page text-[15px] font-bold text-body-2 hover:bg-pale">
            ×
          </button>
        </div>
        <div className="mt-3.5">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({ onClose, children, width = 560, label }: { onClose: () => void; children: ReactNode; width?: number; label: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-navy/45" />
      <div role="dialog" aria-modal="true" aria-label={label} className="relative h-full max-w-[96vw] overflow-y-auto bg-white shadow-[-24px_0_60px_rgba(10,22,38,0.25)]" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string; activeClass?: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-pill border border-line bg-page p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("rounded-pill px-[9px] py-[5px] text-[11px] font-bold transition-colors", value === o.value ? (o.activeClass ?? "bg-navy text-white") : "text-body-2 hover:text-navy")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <div className="text-[11.5px] font-bold tracking-[0.1em] text-muted-2">{children}</div>
      {right}
    </div>
  );
}
