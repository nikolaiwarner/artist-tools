import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Pin, PinOff, Pencil, Trash2 } from 'lucide-react';
import { AppMenuButton } from '../../components/AppMenuButton';
import { listProjects, createProject, updateProject, deleteProject } from './referenceBoard';
import type { ProjectMeta } from './types';
import { deleteProjectData, estimateProjectStorageBytes } from './db';

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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setProjects(listProjects());
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
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

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
        <button className="refboard-new-btn" onClick={handleCreate}>
          + New project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="refboard-empty">
          <p>No projects yet.</p>
          <button onClick={handleCreate}>Create your first project</button>
        </div>
      ) : (
        <div className="refboard-project-grid">
          {projects.map((project) => (
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
                  <button
                    onClick={() => handleRenameStart(project)}
                    aria-label={`Rename ${project.name}`}
                    title="Rename project"
                    className="refboard-icon-action"
                  >
                    <Pencil size={14} aria-hidden="true" />
                  </button>
                  <button
                    className="refboard-delete-btn"
                    onClick={() => handleDelete(project)}
                    aria-label={`Delete ${project.name}`}
                    title="Delete project"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
