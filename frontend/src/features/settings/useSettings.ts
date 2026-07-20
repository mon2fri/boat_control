/**
 * Settings hooks: TanStack Query glue for loading and saving application
 * settings, listing and editing saved filters, and listing preset sources.
 *
 * The endpoints are part of the Priority 1 follow-ups and depend on Worker A
 * shipping the server-side implementation. The hooks degrade gracefully when
 * the backend is unreachable (returns 404 / network error): the UI shows a
 * clear message instead of crashing, and the page remains usable in its
 * current read-only shape.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createConfig,
  createSavedFilter,
  deleteConfig,
  deleteSavedFilter,
  getConfig,
  listConfigs,
  listPresetSources,
  listSavedFilters,
  loadSettings,
  saveSettings,
  updateConfig,
  updateSavedFilter,
} from "../../api/endpoints";
import type { AppSettings, SavedFilter } from "../../api/domain";

const SETTINGS_KEY = ["settings"] as const;
const FILTERS_KEY = ["saved-filters"] as const;
const PRESETS_KEY = ["preset-sources"] as const;

function configListKey(type: string) {
  return ["configs", type] as const;
}
function configDetailKey(type: string, name: string) {
  return ["configs", type, name] as const;
}

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => loadSettings(),
    retry: false,
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (next: AppSettings) => saveSettings(next),
    onSuccess: (saved) => client.setQueryData(SETTINGS_KEY, saved),
  });
}

type ConfigType = "rules" | "filters" | "rows-and-columns";

export function useConfigs(configType: ConfigType) {
  return useQuery({
    queryKey: configListKey(configType),
    queryFn: () => listConfigs(configType),
    retry: false,
  });
}

export function useConfig(configType: ConfigType, name: string | null) {
  return useQuery({
    queryKey: configDetailKey(configType, name ?? ""),
    queryFn: () => getConfig(configType, name!),
    enabled: !!name,
    retry: false,
  });
}

export function useCreateConfig(configType: ConfigType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content }: { name: string; content: unknown }) =>
      createConfig(configType, name, content),
    onSuccess: () => client.invalidateQueries({ queryKey: configListKey(configType) }),
  });
}

export function useUpdateConfig(configType: ConfigType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, content, version }: { name: string; content: unknown; version: number }) =>
      updateConfig(configType, name, content, version),
    onSuccess: (_, vars) => {
      void client.invalidateQueries({ queryKey: configListKey(configType) });
      void client.invalidateQueries({ queryKey: configDetailKey(configType, vars.name) });
    },
  });
}

export function useDeleteConfig(configType: ConfigType) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteConfig(configType, name),
    onSuccess: () => client.invalidateQueries({ queryKey: configListKey(configType) }),
  });
}

export function useSavedFilters() {
  return useQuery({
    queryKey: FILTERS_KEY,
    queryFn: () => listSavedFilters(),
    retry: false,
  });
}

export function useCreateSavedFilter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (filter: Omit<SavedFilter, "id">) => createSavedFilter(filter),
    onSuccess: () => client.invalidateQueries({ queryKey: FILTERS_KEY }),
  });
}

export function useUpdateSavedFilter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (filter: SavedFilter) => updateSavedFilter(filter),
    onSuccess: () => client.invalidateQueries({ queryKey: FILTERS_KEY }),
  });
}

export function useDeleteSavedFilter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSavedFilter(id),
    onSuccess: () => client.invalidateQueries({ queryKey: FILTERS_KEY }),
  });
}

export function usePresetSources() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: () => listPresetSources(),
    retry: false,
  });
}
