import { useState } from 'react';
import { listProjects } from '../tools/reference-board/referenceBoard';
import {
  appendCanvasImageToProject,
  resolveReferenceBoardDestination,
} from '../tools/reference-board/sendToReferenceBoard';
import type { ProjectMeta } from '../tools/reference-board/types';

export interface UseSendToReferenceBoardDialogState {
  showDialog: boolean;
  dialogProjects: ProjectMeta[];
  selectedProjectId: string | null;
  newProjectName: string;
  sendStatus: string | null;
  sendError: string | null;
  sendingToBoard: boolean;
}

export interface UseSendToReferenceBoardDialogHandlers {
  openDialog: () => void;
  closeDialog: () => void;
  selectProject: (projectId: string) => void;
  updateNewProjectName: (value: string) => void;
  performSend: (stageCanvas: HTMLCanvasElement, createId: () => string) => Promise<void>;
}

export function useSendToReferenceBoardDialog(): {
  state: UseSendToReferenceBoardDialogState;
  handlers: UseSendToReferenceBoardDialogHandlers;
} {
  const [showDialog, setShowDialog] = useState(false);
  const [dialogProjects, setDialogProjects] = useState<ProjectMeta[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendingToBoard, setSendingToBoard] = useState(false);

  const openDialog = () => {
    const projects = listProjects();
    setDialogProjects(projects);
    setSelectedProjectId(projects.length > 0 ? projects[0].id : null);
    setNewProjectName('');
    setSendStatus(null);
    setSendError(null);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
  };

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setNewProjectName('');
  };

  const updateNewProjectName = (value: string) => {
    setNewProjectName(value);
    if (value.trim()) {
      setSelectedProjectId(null);
    }
  };

  const performSend = async (stageCanvas: HTMLCanvasElement, createId: () => string) => {
    if (!stageCanvas) {
      closeDialog();
      setSendStatus(null);
      setSendError('No study image is ready yet.');
      return;
    }

    const destinationProject = resolveReferenceBoardDestination({
      projects: dialogProjects,
      selectedProjectId,
      newProjectName,
    });
    if (!destinationProject) return;

    closeDialog();
    setSendingToBoard(true);
    setSendStatus(null);
    setSendError(null);

    try {
      const result = await appendCanvasImageToProject({
        project: destinationProject,
        stageCanvas,
        createId,
      });
      setSendStatus(`Sent to ${result.project.name}.`);
    } catch {
      setSendStatus(null);
      setSendError('Unable to send image to Reference Board. Try again.');
    } finally {
      setSendingToBoard(false);
    }
  };

  return {
    state: {
      showDialog,
      dialogProjects,
      selectedProjectId,
      newProjectName,
      sendStatus,
      sendError,
      sendingToBoard,
    },
    handlers: {
      openDialog,
      closeDialog,
      selectProject,
      updateNewProjectName,
      performSend,
    },
  };
}
