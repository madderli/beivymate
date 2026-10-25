import { useEffect, useState } from "react";

const prefix = "beivymate.ui.v1.";
export function readLocal<T>(
  key: string,
  initial: () => T,
  validate?: (value: unknown) => boolean,
): T {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (raw !== null) {
      const value = JSON.parse(raw);
      const fallback = initial();
      if (
        (validate === undefined || validate(value)) &&
        (Array.isArray(fallback)
          ? Array.isArray(value)
          : typeof value === typeof fallback && value !== null)
      )
        return value;
    }
  } catch {
    /* An unavailable or damaged cache falls back to the initial UI state. */
  }
  return initial();
}
function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
  } catch {
    window.dispatchEvent(new Event("beivymate-storage-error"));
  }
}
export function useLocalState<T>(
  key: string,
  initial: () => T,
  validate?: (value: unknown) => boolean,
) {
  const [value, setValue] = useState<T>(() =>
    readLocal(key, initial, validate),
  );
  useEffect(() => writeLocal(key, value), [key, value]);
  return [value, setValue] as const;
}
