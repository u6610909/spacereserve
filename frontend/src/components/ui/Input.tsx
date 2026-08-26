import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';

interface FieldWrapperProps {
  label?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrapperProps>(
  ({ label, hint, className = '', id, ...props }, ref) => (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-700">{label}</span>}
      <input
        ref={ref}
        id={id}
        {...props}
        className={`rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  ),
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrapperProps>(
  ({ label, hint, className = '', children, ...props }, ref) => (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-700">{label}</span>}
      <select
        ref={ref}
        {...props}
        className={`rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${className}`}
      >
        {children}
      </select>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  ),
);
Select.displayName = 'Select';
