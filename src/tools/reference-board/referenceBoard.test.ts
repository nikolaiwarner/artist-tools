import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  duplicateProject,
  bringToFront,
  sendToBack,
  bringForward,
  sendBackward,
} from './referenceBoard';

const makeStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
};

beforeEach(() => {
  const storage = makeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

describe('createProject', () => {
  it('creates a project with the given name', () => {
    const p = createProject('Seascape');
    expect(p.name).toBe('Seascape');
    expect(p.id).toBeTruthy();
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.viewport).toEqual({ x: 0, y: 0, scale: 1 });
    expect(p.canvasBackgroundColor).toBe('#1f1f1f');
  });

  it('trims whitespace from name', () => {
    const p = createProject('  Flowers  ');
    expect(p.name).toBe('Flowers');
  });

  it('uses "Untitled" for empty name', () => {
    const p = createProject('');
    expect(p.name).toBe('Untitled');
  });

  it('persists project to storage', () => {
    createProject('Test');
    expect(listProjects()).toHaveLength(1);
  });
});

describe('listProjects', () => {
  it('returns empty array when no projects', () => {
    expect(listProjects()).toEqual([]);
  });

  it('returns projects sorted by updatedAt descending', () => {
    const a = createProject('A');
    vi.setSystemTime(Date.now() + 1000);
    const b = createProject('B');
    const list = listProjects();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it('returns pinned projects before newer unpinned projects', () => {
    const first = createProject('First');
    vi.setSystemTime(Date.now() + 1000);
    const second = createProject('Second');

    updateProject(first.id, { pinned: true });
    updateProject(second.id, { name: 'Second updated' });

    const list = listProjects();
    expect(list[0].id).toBe(first.id);
    expect(list[1].id).toBe(second.id);
  });
});

describe('getProject', () => {
  it('returns the project by id', () => {
    const p = createProject('Ref Board');
    expect(getProject(p.id)?.id).toBe(p.id);
  });

  it('returns null for unknown id', () => {
    expect(getProject('nonexistent')).toBeNull();
  });
});

describe('updateProject', () => {
  it('updates project name', () => {
    const p = createProject('Old');
    updateProject(p.id, { name: 'New' });
    expect(getProject(p.id)?.name).toBe('New');
  });

  it('returns null for unknown id', () => {
    expect(updateProject('nope', { name: 'x' })).toBeNull();
  });
});

describe('deleteProject', () => {
  it('removes the project', () => {
    const p = createProject('Temp');
    deleteProject(p.id);
    expect(getProject(p.id)).toBeNull();
  });

  it('returns false for unknown id', () => {
    expect(deleteProject('nope')).toBe(false);
  });
});

describe('duplicateProject', () => {
  it('returns null for unknown id', () => {
    expect(duplicateProject('nope')).toBeNull();
  });

  it('creates a new project with "Copy" suffix', () => {
    const original = createProject('Landscape');
    const copy = duplicateProject(original.id);
    expect(copy).not.toBeNull();
    expect(copy!.name).toBe('Landscape Copy');
  });

  it('assigns a new unique id', () => {
    const original = createProject('Flowers');
    const copy = duplicateProject(original.id);
    expect(copy!.id).not.toBe(original.id);
  });

  it('copies canvasBackgroundColor', () => {
    const original = createProject('Seascape');
    updateProject(original.id, { canvasBackgroundColor: '#abcdef' });
    const copy = duplicateProject(original.id);
    expect(copy!.canvasBackgroundColor).toBe('#abcdef');
  });

  it('does not copy pinned status or thumbnail', () => {
    const original = createProject('Pinned');
    updateProject(original.id, { pinned: true });
    const copy = duplicateProject(original.id);
    expect(copy!.pinned).toBe(false);
  });

  it('copies the thumbnail', () => {
    const original = createProject('With Thumb');
    updateProject(original.id, { thumbnailDataUrl: 'data:image/png;base64,thumb' });
    const copy = duplicateProject(original.id);
    expect(copy!.thumbnailDataUrl).toBe('data:image/png;base64,thumb');
  });

  it('persists the duplicate to storage', () => {
    const original = createProject('Original');
    duplicateProject(original.id);
    expect(listProjects()).toHaveLength(2);
  });
});

describe('layer ordering helpers', () => {
  const layers = [
    { id: 'a', zIndex: 1 },
    { id: 'b', zIndex: 2 },
    { id: 'c', zIndex: 3 },
  ];

  it('bringToFront gives highest zIndex', () => {
    const result = bringToFront(layers, 'a');
    const a = result.find((l) => l.id === 'a')!;
    expect(a.zIndex).toBeGreaterThan(3);
  });

  it('sendToBack gives lowest zIndex', () => {
    const result = sendToBack(layers, 'c');
    const c = result.find((l) => l.id === 'c')!;
    expect(c.zIndex).toBeLessThan(1);
  });

  it('bringForward increments above next layer', () => {
    const result = bringForward(layers, 'a');
    const a = result.find((l) => l.id === 'a')!;
    expect(a.zIndex).toBeGreaterThan(2);
  });

  it('sendBackward decrements below prev layer', () => {
    const result = sendBackward(layers, 'c');
    const c = result.find((l) => l.id === 'c')!;
    expect(c.zIndex).toBeLessThan(2);
  });

  it('bringForward is no-op at top', () => {
    const result = bringForward(layers, 'c');
    const c = result.find((l) => l.id === 'c')!;
    expect(c.zIndex).toBe(3);
  });

  it('sendBackward is no-op at bottom', () => {
    const result = sendBackward(layers, 'a');
    const a = result.find((l) => l.id === 'a')!;
    expect(a.zIndex).toBe(1);
  });
});
