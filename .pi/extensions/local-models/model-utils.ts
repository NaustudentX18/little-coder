export const LOCAL_MODEL_PROVIDERS = new Set(["llamacpp", "ollama", "lmstudio"]);

export interface ModelLike {
  provider: string;
  id: string;
  name: string;
}

export function isLocalModel(model: Pick<ModelLike, "provider">): boolean {
  return LOCAL_MODEL_PROVIDERS.has(model.provider);
}

export function filterLocalModels<T extends Pick<ModelLike, "provider">>(models: T[]): T[] {
  return models.filter(isLocalModel);
}

export function sortLocalModels<T extends Pick<ModelLike, "provider" | "id">>(models: T[], current?: Pick<ModelLike, "provider" | "id">): T[] {
  return [...models].sort((a, b) => {
    const aCurrent = current && a.provider === current.provider && a.id === current.id ? 0 : 1;
    const bCurrent = current && b.provider === current.provider && b.id === current.id ? 0 : 1;
    if (aCurrent !== bCurrent) return aCurrent - bCurrent;
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.id.localeCompare(b.id);
  });
}

export function modelLabel(model: Pick<ModelLike, "provider" | "id" | "name">, current?: Pick<ModelLike, "provider" | "id">): string {
  const prefix = current && model.provider === current.provider && model.id === current.id ? "▶ " : "";
  const human = model.name && model.name !== model.id ? ` — ${model.name}` : "";
  return `${prefix}${model.provider}/${model.id}${human}`;
}

export function resolveLocalModel(
  models: Pick<ModelLike, "provider" | "id" | "name">[],
  query: string,
): Pick<ModelLike, "provider" | "id" | "name"> | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalized = normalize(trimmed);

  const exactProvider = models.find((m) => `${m.provider}/${m.id}` === trimmed);
  if (exactProvider) return exactProvider;

  const exactId = models.find((m) => m.id === trimmed);
  if (exactId) return exactId;

  const exactName = models.find((m) => m.name === trimmed);
  if (exactName) return exactName;

  const lower = trimmed.toLowerCase();
  return models.find((m) =>
    `${m.provider}/${m.id}`.toLowerCase().includes(lower) ||
    m.id.toLowerCase().includes(lower) ||
    m.name.toLowerCase().includes(lower) ||
    normalize(`${m.provider}/${m.id}`).includes(normalized) ||
    normalize(m.name).includes(normalized)
  );
}
