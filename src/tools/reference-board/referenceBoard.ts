import type { ProjectMeta, Viewport } from './types';

const STORAGE_KEY = 'artist-tools.reference-board.projects';
const DEFAULT_CANVAS_BACKGROUND_COLOR = '#1f1f1f';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== 'function') return null;
  return storage;
}

function readProjects(): ProjectMeta[] {
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

function writeProjects(projects: ProjectMeta[]): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function listProjects(): ProjectMeta[] {
  return readProjects().sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? -1 : 1;
    }

    return b.updatedAt - a.updatedAt;
  });
}

export function getProject(id: string): ProjectMeta | null {
  return readProjects().find((p) => p.id === id) ?? null;
}

export function createProject(name: string): ProjectMeta {
  const now = Date.now();
  const project: ProjectMeta = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    canvasBackgroundColor: DEFAULT_CANVAS_BACKGROUND_COLOR,
    viewport: { x: 0, y: 0, scale: 1 },
  };
  const projects = readProjects();
  writeProjects([...projects, project]);
  return project;
}

export function updateProject(id: string, patch: Partial<Omit<ProjectMeta, 'id' | 'createdAt'>>): ProjectMeta | null {
  const projects = readProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;
  const updated: ProjectMeta = {
    ...projects[index],
    ...patch,
    updatedAt: Date.now(),
  };
  projects[index] = updated;
  writeProjects(projects);
  return updated;
}

export function deleteProject(id: string): boolean {
  const projects = readProjects();
  const next = projects.filter((p) => p.id !== id);
  if (next.length === projects.length) return false;
  writeProjects(next);
  return true;
}

export function duplicateProject(id: string): ProjectMeta | null {
  const source = readProjects().find((p) => p.id === id);
  if (!source) return null;
  const now = Date.now();
  const copy: ProjectMeta = {
    id: crypto.randomUUID(),
    name: `${source.name} Copy`,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    canvasBackgroundColor: source.canvasBackgroundColor,
    viewport: { x: 0, y: 0, scale: 1 },
    ...(source.thumbnailDataUrl ? { thumbnailDataUrl: source.thumbnailDataUrl } : {}),
  };
  const projects = readProjects();
  writeProjects([...projects, copy]);
  return copy;
}

export function updateViewport(id: string, viewport: Viewport): void {
  updateProject(id, { viewport });
}

export function updateThumbnail(id: string, thumbnailDataUrl: string): void {
  updateProject(id, { thumbnailDataUrl });
}

export function bringToFront(layers: { id: string; zIndex: number }[], layerId: string): { id: string; zIndex: number }[] {
  const maxZ = Math.max(...layers.map((l) => l.zIndex));
  return layers.map((l) => l.id === layerId ? { ...l, zIndex: maxZ + 1 } : l);
}

export function sendToBack(layers: { id: string; zIndex: number }[], layerId: string): { id: string; zIndex: number }[] {
  const minZ = Math.min(...layers.map((l) => l.zIndex));
  return layers.map((l) => l.id === layerId ? { ...l, zIndex: minZ - 1 } : l);
}

export function bringForward(layers: { id: string; zIndex: number }[], layerId: string): { id: string; zIndex: number }[] {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return layers;
  const nextZ = layers
    .filter((l) => l.zIndex > layer.zIndex)
    .sort((a, b) => a.zIndex - b.zIndex)[0]?.zIndex;
  if (nextZ === undefined) return layers;
  return layers.map((l) => {
    if (l.id === layerId) return { ...l, zIndex: nextZ + 0.5 };
    return l;
  });
}

export function sendBackward(layers: { id: string; zIndex: number }[], layerId: string): { id: string; zIndex: number }[] {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return layers;
  const prevZ = layers
    .filter((l) => l.zIndex < layer.zIndex)
    .sort((a, b) => b.zIndex - a.zIndex)[0]?.zIndex;
  if (prevZ === undefined) return layers;
  return layers.map((l) => {
    if (l.id === layerId) return { ...l, zIndex: prevZ - 0.5 };
    return l;
  });
}
