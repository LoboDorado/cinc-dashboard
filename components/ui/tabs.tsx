"use client";

import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string };

/**
 * Generalizes components/command-snippet.tsx's proven WAI-ARIA tabs pattern
 * (roving tabindex, arrow/Home/End keys, aria-selected, matching
 * id/aria-controls) from its one fixed 2-option case to any number of tabs
 * with independent content. Controlled: pass `activeId`/`onChange` from
 * local state, or from `useTabParam` below for URL-persisted selection.
 */
export function Tabs({
  id,
  tabs,
  activeId,
  onChange,
  label,
  className,
}: {
  id: string;
  tabs: readonly TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist, e.g. "Node sections". */
  label: string;
  className?: string;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === activeId);
    const n = tabs.length;
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? n - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    const nextId = tabs[next].id;
    onChange(nextId);
    tabRefs.current[nextId]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={cn("flex border-b border-border", className)}>
      {tabs.map((t) => {
        const selected = t.id === activeId;
        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${id}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={onKeyDown}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              selected
                ? "border-primary font-medium text-text"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wraps one tab's content. Uses the native `hidden` attribute rather than
 * conditional rendering: it removes a hidden panel from both the
 * accessibility tree and the tab order for free, while keeping its children
 * mounted -- so a panel that owns its own one-time lazy fetch never refires
 * just because the user flipped away and back.
 */
export function TabPanel({
  id,
  tabId,
  activeId,
  children,
}: {
  id: string;
  tabId: string;
  activeId: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${tabId}`}
      aria-labelledby={`${id}-tab-${tabId}`}
      hidden={activeId !== tabId}
      className="py-3"
    >
      {children}
    </div>
  );
}

/**
 * Reads/writes the active tab from a `param` query param, mirroring
 * components/ui/use-sort.ts's read-from-URL/write-via-replace pattern: a
 * direct link into a specific tab is meaningful and worth sharing, so this
 * is a URL param rather than plain state. The param is dropped when it
 * equals `def`, keeping default links clean. `ids` guards against a stale
 * or tampered param naming a tab that no longer exists.
 */
export function useTabParam(
  param: string,
  def: string,
  ids: readonly string[],
): [string, (id: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get(param);
  const active = raw && ids.includes(raw) ? raw : def;

  const setActive = useCallback(
    (id: string) => {
      const qs = new URLSearchParams(params.toString());
      if (id === def) qs.delete(param);
      else qs.set(param, id);
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, params, param, def],
  );

  return [active, setActive];
}
