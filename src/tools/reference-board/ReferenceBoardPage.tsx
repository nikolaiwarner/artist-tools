import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Pin, PinOff, Pencil, Trash2, MoreHorizontal, Copy } from 'lucide-react';
import { AppMenuButton } from '../../components/AppMenuButton';
import { listProjects, createProject, updateProject, deleteProject, duplicateProject } from './referenceBoard';
import type { ProjectMeta } from './types';
import { deleteProjectData, duplicateProjectData, estimateProjectStorageBytes, buildProjectTextSearchIndex } from './db';
import { SYNC_APPLIED_EVENT } from '../../sync/syncData';

function estimateProjectMetaBytes(project: ProjectMeta): number {
  return new TextEncoder().encode(JSON.stringify(project)).length;
}

function formatStorage(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReferenceBoardPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
  const [projectStorage, setProjectStorage] = useState<Record<string, number>>({});
  const [projectTextIndex, setProjectTextIndex] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setProjects(listProjects());
  }, []);

  useEffect(() => {
    function onSyncApplied() {
      setProjects(listProjects());
    }
    window.addEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
    return () => window.removeEventListener(SYNC_APPLIED_EVENT, onSyncApplied);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadStorage() {
      if (projects.length === 0) {
        if (active) setProjectStorage({});
        return;
      }

      const entries = await Promise.all(projects.map(async (project) => {
        const indexedDbBytes = await estimateProjectStorageBytes(project.id);
        const metadataBytes = estimateProjectMetaBytes(project);
        return [project.id, indexedDbBytes + metadataBytes] as const;
      }));

      if (!active) return;
      setProjectStorage(Object.fromEntries(entries));
    }

    void loadStorage();

    return () => {
      active = false;
    };
  }, [projects]);

  useEffect(() => {
    let active = true;

    async function loadProjectTextIndex() {
      if (projects.length === 0) {
        if (active) setProjectTextIndex({});
        return;
      }

      const index = await buildProjectTextSearchIndex(projects.map((project) => project.id));
      if (!active) return;
      setProjectTextIndex(index);
    }

    void loadProjectTextIndex();

    return () => {
      active = false;
    };
  }, [projects]);

  useEffect(() => {
    function onDBChange() {
      void buildProjectTextSearchIndex(projects.map((project) => project.id)).then((index) => {
        setProjectTextIndex(index);
      });
    }

    window.addEventListener('artist-tools:reference-board-db-change', onDBChange);
    return () => window.removeEventListener('artist-tools:reference-board-db-change', onDBChange);
  }, [projects]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!openMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  function handleCreate() {
    const name = window.prompt('Project name:');
    if (name === null) return;
    const project = createProject(name);
    setProjects(listProjects());
    navigate(`/tools/reference-board/canvas/${project.id}`);
  }

  function handleOpen(id: string) {
    navigate(`/tools/reference-board/canvas/${id}`);
  }

  function handleRenameStart(project: ProjectMeta) {
    setRenamingId(project.id);
    setRenameValue(project.name);
  }

  function handleRenameCommit() {
    if (!renamingId) return;
    if (renameValue.trim()) {
      updateProject(renamingId, { name: renameValue.trim() });
      setProjects(listProjects());
    }
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleRenameCommit();
    if (e.key === 'Escape') setRenamingId(null);
  }

  function handleDelete(project: ProjectMeta) {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    deleteProject(project.id);
    void deleteProjectData(project.id);
    setProjects(listProjects());
  }

  function handleTogglePinned(project: ProjectMeta) {
    updateProject(project.id, { pinned: !project.pinned });
    setProjects(listProjects());
  }

  function handleDuplicate(project: ProjectMeta) {
    setOpenMenuId(null);
    const copy = duplicateProject(project.id);
    if (!copy) return;
    void duplicateProjectData(project.id, copy.id).then(() => {
      setProjects(listProjects());
    });
    setProjects(listProjects());
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProjects = normalizedSearch
    ? projects.filter((project) => {
      if (project.name.toLowerCase().includes(normalizedSearch)) return true;
      return (projectTextIndex[project.id] ?? '').toLowerCase().includes(normalizedSearch);
    })
    : projects;

  return (
    <section className="tool-layout">
      <div className="tool-hero">
        <div className="tool-hero-head">
          <AppMenuButton />
          <div className="tool-hero-copy">
            <h1>Reference Board</h1>
            <p>
              An infinite canvas for organizing reference images. Arrange, transform, and annotate
              images across multiple projects. Stored locally in your browser.
            </p>
          </div>
        </div>
      </div>

      <div className="refboard-projects-header">
        <h2 style={{ margin: 0 }}>Projects</h2>
        <div className="refboard-projects-controls">
          <label className="refboard-project-search" htmlFor="refboard-project-search-input">
            <span className="sr-only">Search projects</span>
            <input
              id="refboard-project-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search projects"
            />
          </label>
          <button className="refboard-new-btn" onClick={handleCreate}>
            + New project
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="refboard-empty">
          <p>No projects yet.</p>
          <button onClick={handleCreate}>Create your first project</button>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="refboard-empty">
          <p>No projects match your search.</p>
        </div>
      ) : (
        <div className="refboard-project-grid">
          {filteredProjects.map((project) => (
            <article key={project.id} className="refboard-project-card">
              {project.pinned ? (
                <span className="refboard-pin-overlay" title="Pinned project" aria-hidden="true">
                  <Pin size={12} />
                </span>
              ) : null}

              <button
                className="refboard-thumbnail-btn"
                onClick={() => handleOpen(project.id)}
                aria-label={`Open ${project.name}`}
              >
                {project.thumbnailDataUrl ? (
                  <img
                    src={project.thumbnailDataUrl}
                    alt={`Thumbnail for ${project.name}`}
                    className="refboard-thumbnail"
                  />
                ) : (
                  <div className="refboard-thumbnail-placeholder" aria-hidden="true" />
                )}
              </button>

              <div className="refboard-card-meta">
                {renamingId === project.id ? (
                  <input
                    ref={renameInputRef}
                    className="refboard-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameCommit}
                    onKeyDown={handleRenameKeyDown}
                    aria-label="Rename project"
                  />
                ) : (
                  <div className="refboard-project-heading">
                    <h3 className="refboard-project-name">{project.name}</h3>
                  </div>
                )}

                <p className="refboard-project-date">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </p>
                <p className="refboard-project-date refboard-project-storage" aria-label="Project storage" title="Project storage">
                  <Save size={12} aria-hidden="true" />
                  <span>
                    {projectStorage[project.id] !== undefined
                      ? formatStorage(projectStorage[project.id])
                      : '...'}
                  </span>
                </p>

                <div className="refboard-card-actions">
                  <button
                    onClick={() => handleTogglePinned(project)}
                    aria-label={`${project.pinned ? 'Unpin' : 'Pin'} ${project.name}`}
                    title={project.pinned ? 'Unpin project' : 'Pin project'}
                    className="refboard-icon-action"
                  >
                    {project.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
                  </button>
                  <div className="refboard-card-menu-wrap" ref={openMenuId === project.id ? menuRef : null}>
                    <button
                      className="refboard-icon-action"
                      aria-label={`Options for ${project.name}`}
                      title="Project options"
                      aria-haspopup="true"
                      aria-expanded={openMenuId === project.id}
                      onClick={() => setOpenMenuId(openMenuId === project.id ? null : project.id)}
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </button>
                    {openMenuId === project.id ? (
                      <div className="refboard-card-menu" role="menu">
                        <button
                          role="menuitem"
                          className="refboard-menu-item"
                          onClick={() => { handleRenameStart(project); setOpenMenuId(null); }}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Rename
                        </button>
                        <button
                          role="menuitem"
                          className="refboard-menu-item"
                          onClick={() => handleDuplicate(project)}
                          aria-label={`Duplicate ${project.name}`}
                        >
                          <Copy size={13} aria-hidden="true" />
                          Duplicate
                        </button>
                        <button
                          role="menuitem"
                          className="refboard-menu-item refboard-menu-item--danger"
                          onClick={() => { handleDelete(project); setOpenMenuId(null); }}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
