import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShellProvider } from '../../components/AppShellContext';
import { ReferenceBoardPage } from './ReferenceBoardPage';
import { estimateProjectStorageBytes } from './db';

vi.mock('./db', () => ({
  deleteProjectData: vi.fn().mockResolvedValue(undefined),
  estimateProjectStorageBytes: vi.fn().mockResolvedValue(2048),
}));

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
  vi.stubGlobal('window', {
    localStorage: storage,
    confirm: vi.fn().mockReturnValue(true),
    prompt: vi.fn().mockReturnValue('My Project'),
    crypto: { randomUUID: () => `test-${Math.random()}` },
  });
});

function renderPage() {
  return render(
    <AppShellProvider value={{ menuOpen: false, openMenu: vi.fn(), closeMenu: vi.fn() }}>
      <MemoryRouter initialEntries={['/tools/reference-board']}>
        <ReferenceBoardPage />
      </MemoryRouter>
    </AppShellProvider>
  );
}

describe('ReferenceBoardPage', () => {
  it('renders the page heading', () => {
    renderPage();
    expect(screen.getByText('Reference Board')).toBeInTheDocument();
  });

  it('shows empty state when no projects', () => {
    renderPage();
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument();
  });

  it('creates a project when prompted', () => {
    renderPage();
    const newBtn = screen.getAllByText(/New project/i)[0];
    fireEvent.click(newBtn);
    expect(window.prompt).toHaveBeenCalled();
  });

  it('shows "Projects" heading', () => {
    renderPage();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('shows project card after creating a project', () => {
    const storage = makeStorage();
    const projects = [
      {
        id: 'p1',
        name: 'Seascape',
        createdAt: 1000,
        updatedAt: 2000,
        viewport: { x: 0, y: 0, scale: 1 },
      },
    ];
    storage.setItem('artist-tools.reference-board.projects', JSON.stringify(projects));
    vi.stubGlobal('window', {
      localStorage: storage,
      confirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn().mockReturnValue('New'),
      crypto: { randomUUID: () => `test-${Math.random()}` },
    });

    renderPage();
    expect(screen.getByText('Seascape')).toBeInTheDocument();
  });

  it('shows icon action buttons on project card', () => {
    const storage = makeStorage();
    const projects = [
      {
        id: 'p1',
        name: 'Flowers',
        createdAt: 1000,
        updatedAt: 2000,
        viewport: { x: 0, y: 0, scale: 1 },
      },
    ];
    storage.setItem('artist-tools.reference-board.projects', JSON.stringify(projects));
    vi.stubGlobal('window', {
      localStorage: storage,
      confirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn().mockReturnValue('New'),
      crypto: { randomUUID: () => `test-${Math.random()}` },
    });

    renderPage();
    expect(screen.getByRole('button', { name: /rename flowers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete flowers/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pin flowers/i })).toBeInTheDocument();
  });

  it('shows project storage usage on the card', async () => {
    const storage = makeStorage();
    const projects = [
      {
        id: 'p1',
        name: 'Storage Test',
        createdAt: 1000,
        updatedAt: 2000,
        viewport: { x: 0, y: 0, scale: 1 },
      },
    ];
    storage.setItem('artist-tools.reference-board.projects', JSON.stringify(projects));
    vi.stubGlobal('window', {
      localStorage: storage,
      confirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn().mockReturnValue('New'),
      crypto: { randomUUID: () => `test-${Math.random()}` },
    });

    renderPage();

    expect(await screen.findByLabelText(/project storage/i)).toBeInTheDocument();
  });

  it('includes local project metadata in storage total', async () => {
    vi.mocked(estimateProjectStorageBytes).mockResolvedValue(0);

    const storage = makeStorage();
    const projects = [
      {
        id: 'p1',
        name: 'Storage Total',
        createdAt: 1000,
        updatedAt: 2000,
        thumbnailDataUrl: 'data:image/jpeg;base64,abc123',
        viewport: { x: 0, y: 0, scale: 1 },
      },
    ];
    storage.setItem('artist-tools.reference-board.projects', JSON.stringify(projects));
    vi.stubGlobal('window', {
      localStorage: storage,
      confirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn().mockReturnValue('New'),
      crypto: { randomUUID: () => `test-${Math.random()}` },
    });

    renderPage();

    const expectedBytes = new TextEncoder().encode(JSON.stringify(projects[0])).length;
    expect(await screen.findByLabelText(/project storage/i)).toHaveTextContent(`${expectedBytes} B`);
  });

  it('moves a pinned project to the top of the list', async () => {
    const storage = makeStorage();
    const projects = [
      {
        id: 'p1',
        name: 'Older Project',
        createdAt: 1000,
        updatedAt: 1000,
        viewport: { x: 0, y: 0, scale: 1 },
      },
      {
        id: 'p2',
        name: 'Newer Project',
        createdAt: 2000,
        updatedAt: 2000,
        viewport: { x: 0, y: 0, scale: 1 },
      },
    ];
    storage.setItem('artist-tools.reference-board.projects', JSON.stringify(projects));
    vi.stubGlobal('window', {
      localStorage: storage,
      confirm: vi.fn().mockReturnValue(true),
      prompt: vi.fn().mockReturnValue('New'),
      crypto: { randomUUID: () => `test-${Math.random()}` },
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /pin older project/i }));

    const projectNames = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(projectNames[0]).toBe('Older Project');
    expect(screen.getByRole('button', { name: /unpin older project/i })).toBeInTheDocument();
  });
});
