"use client";

import { useId } from "react";

export type FacetOption = { value: string; label: string };

/**
 * One discrete-value filter for a list, styled like components/scope-picker.tsx's
 * native select. Unlike ScopePicker (one fixed instance per page), several of
 * these render side by side, so the id is generated per instance rather than
 * hardcoded.
 */
export function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  /** Both the visible label and the "All ..." option's text, e.g. "Platform". */
  label: string;
  /** "" means no constraint ("All"). */
  value: string;
  options: FacetOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <option value="">All {label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
