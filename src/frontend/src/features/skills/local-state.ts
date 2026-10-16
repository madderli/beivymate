import { useEffect, useState } from "react";
import {
  configuredModels,
  modelServices,
  tierModels,
  backupModels,
  defaultModelId,
  setDefaultModelId,
  failover,
} from "./skill-state";

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

const cached = readLocal("models", () => ({
  models: configuredModels,
  services: modelServices,
  tiers: tierModels,
  backups: backupModels,
  defaultId: defaultModelId,
  failover,
}));
if (
  Array.isArray(cached.models) &&
  Array.isArray(cached.services) &&
  cached.models.every(
    (m) => m && typeof m.id === "string" && Array.isArray(m.capabilities),
  ) &&
  cached.services.every((s) => s && typeof s.id === "string") &&
  cached.tiers &&
  cached.backups &&
  cached.failover &&
  Array.isArray(cached.failover.triggers)
) {
  configuredModels.splice(0, configuredModels.length, ...cached.models);
  modelServices.splice(0, modelServices.length, ...cached.services);
  Object.assign(tierModels, cached.tiers);
  Object.assign(backupModels, cached.backups);
  Object.assign(failover, cached.failover);
  setDefaultModelId(cached.defaultId);
}
export function persistModels() {
  writeLocal("models", {
    models: configuredModels,
    services: modelServices,
    tiers: tierModels,
    backups: backupModels,
    defaultId: defaultModelId,
    failover,
  });
}
