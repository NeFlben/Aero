"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" };

export const btnClass = (variant: BtnProps["variant"] = "secondary", size: BtnProps["size"] = "md") =>
  cx(
    "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,filter,transform] active:scale-[0.98] select-none disabled:opacity-45 disabled:pointer-events-none",
    size === "sm" && "h-8 px-3 text-[12.5px]",
    size === "md" && "h-10 px-4 text-[13.5px] max-md:h-11",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" && "grad text-white shadow-[0_10px_24px_-10px_var(--accent)] hover:brightness-110",
    variant === "secondary" && "border border-[var(--glass-line)] bg-[var(--glass)] text-ink shadow-[var(--shadow-sm)] backdrop-blur hover:bg-surface",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "danger" && "border border-line bg-surface text-neg shadow-[var(--shadow-sm)] hover:border-neg/40 hover:bg-surface-2",
  );

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant, size, className, type = "button", ...p }, ref) {
  return <button ref={ref} type={type} className={cx(btnClass(variant, size), className)} {...p} />;
});

export const inputClass =
  "h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink shadow-[var(--shadow-sm)] placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 max-md:h-11 max-md:text-base";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(inputClass, className)} {...p} />;
});

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative block", className)}>
      <select className={cx(inputClass, "appearance-none pr-7")} {...p}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3" />
    </span>
  );
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-[12px] font-medium text-ink-2">
        <span>
          {label}
          {required && <span className="text-accent"> *</span>}
        </span>
        {hint && <span className="truncate font-normal text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span role="alert" className="mt-1 block text-[12px] text-neg">{error}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label: string; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()} className="size-4 cursor-pointer accent-[var(--accent)]" />;
}

/** Native <dialog>: focus trap, Escape and the top layer come from the browser. */
export function Dialog({ open, onClose, children, label, wide, xl, align = "center" }: { open: boolean; onClose: () => void; children: ReactNode; label: string; wide?: boolean; xl?: boolean; align?: "center" | "top" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-auto w-full overflow-hidden rounded-2xl border border-line bg-surface p-0 shadow-[var(--shadow)] backdrop:backdrop-blur-[3px] max-md:h-dvh max-md:max-h-dvh max-md:max-w-full max-md:rounded-none max-md:border-0",
        xl ? "max-w-6xl" : wide ? "max-w-3xl" : "max-w-xl",
        align === "top" && "md:mt-[9vh]",
      )}
    >
      {open && children}
    </dialog>
  );
}

export function IconClose({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink max-md:size-11">
      <X className="size-4" />
    </button>
  );
}

export const Flag = ({ code, className }: { code: string | null | undefined; className?: string }) =>
  code ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/flags/${code.toLowerCase()}.svg`} alt="" loading="lazy" width={16} height={12} className={cx("inline-block h-3 w-4 rounded-[1px] object-cover ring-1 ring-black/10", className)} />
  ) : null;

export const Reg = ({ children, className }: { children: ReactNode; className?: string }) =>
  children ? <span className={cx("code rounded-lg bg-accent-soft px-2 py-0.5 text-[11.5px] font-semibold text-accent", className)}>{children}</span> : null;

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon}
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-1 max-w-md text-ink-2">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[11.5px] font-semibold text-accent">{eyebrow}</div>}
        <h1 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.035em] md:text-[42px]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export const Panel = ({ title, children, className, aside, icon }: { title?: string; children: ReactNode; className?: string; aside?: ReactNode; icon?: ReactNode }) => (
  <section className={cx("card", className)}>
    {title && (
      <div className="flex items-center justify-between gap-2 px-5 pt-5 pb-1">
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold tracking-[-0.015em]">
          {icon && <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-4">{icon}</span>}
          {title}
        </h2>
        {aside}
      </div>
    )}
    {children}
  </section>
);

export interface ComboOption {
  id: string;
  label: string;
  hint?: string;
  flag?: string | null;
}

/**
 * Searchable text field with suggestions. Free text always stays valid: choosing a suggestion is
 * help, never a requirement.
 */
export function Combobox({ value, onChange, onPick, search, placeholder, autoFocus, inputProps, id }: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (o: ComboOption) => void;
  search: (q: string) => ComboOption[];
  placeholder?: string;
  autoFocus?: boolean;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = open ? search(value) : [];
  const pick = (o: ComboOption) => {
    onChange(o.label);
    onPick?.(o);
    setOpen(false);
  };
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[Math.min(active, options.length - 1)]);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        {...inputProps}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="scroll-thin absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line-strong bg-surface py-1 shadow-[var(--shadow)]">
          {options.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cx("flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm max-md:py-2.5", i === active && "bg-accent-soft")}
              >
                <Flag code={o.flag} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="code shrink-0 text-[11px] text-ink-3">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MultiChips({ options, selected, onToggle, render }: { options: string[]; selected: string[]; onToggle: (v: string) => void; render?: (v: string) => ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onToggle(o)} className={cx("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] transition-colors max-md:h-9", on ? "border-accent bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-line-strong")}>
            {on && <Check className="size-3 text-accent" />}
            {render ? render(o) : o}
          </button>
        );
      })}
    </div>
  );
}
