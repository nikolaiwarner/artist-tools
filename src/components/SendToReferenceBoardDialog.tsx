import type { ProjectMeta } from '../tools/reference-board/types';

type SendToReferenceBoardDialogProps = {
  projects: ProjectMeta[];
  selectedProjectId: string | null;
  newProjectName: string;
  onSelectProject: (projectId: string) => void;
  onNewProjectNameChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
};

export function SendToReferenceBoardDialog(props: SendToReferenceBoardDialogProps) {
  return (
    <div
      className="poster-send-backdrop"
      role="presentation"
      onClick={props.onCancel}
    >
      <div
        className="poster-send-dialog"
        role="dialog"
        aria-label="Send to Reference Board"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="poster-send-title">Send to Reference Board</h3>

        {props.projects.length > 0 && (
          <ul className="poster-send-project-list" aria-label="Reference Board projects">
            {props.projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  className="poster-send-project-btn"
                  aria-pressed={props.selectedProjectId === project.id}
                  onClick={() => props.onSelectProject(project.id)}
                >
                  {project.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="poster-send-new-project">
          <label htmlFor="poster-new-project-name" className="poster-send-label">New project name</label>
          <div className="poster-send-new-project-row">
            <input
              id="poster-new-project-name"
              type="text"
              className="poster-send-input"
              value={props.newProjectName}
              onChange={(event) => props.onNewProjectNameChange(event.target.value)}
              placeholder="Project name"
            />
          </div>
        </div>

        <div className="poster-send-actions">
          <button
            type="button"
            className="poster-send-cancel-btn"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="poster-send-confirm-btn"
            disabled={!props.canConfirm}
            onClick={props.onConfirm}
          >
            Send image
          </button>
        </div>
      </div>
    </div>
  );
}
