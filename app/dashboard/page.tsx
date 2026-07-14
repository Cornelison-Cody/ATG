"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Hammer,
  KeyRound,
  Lightbulb,
  LoaderCircle,
  Menu,
  MessageSquareWarning,
  Monitor,
  Pencil,
  Settings,
  Smartphone,
  Trash2,
  X
} from "lucide-react";
import { InstructionsViewer } from "@/components/instructions-viewer";
import { buildGameAssetUrl } from "@/lib/game-asset-url.mjs";
import { PROJECT_NAME_MAX_LENGTH } from "@/lib/project-name-rules.mjs";
import styles from "./page.module.css";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "done" | "error" | "running";
  createdAt: string;
};

type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  path: string;
  codexThreadId: string | null;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  messageCount: number;
};

type ProjectDetail = Omit<ProjectSummary, "messageCount"> & {
  messages: ChatMessage[];
};

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "session"; sessionId: string }
  | { type: "final"; message: string }
  | { type: "error"; message: string };

type ChatRunFeedback = {
  state: "idle" | "connecting" | "running" | "done" | "error";
  label: string;
  details: string[];
  lastUpdateAt: string | null;
  startedAt: string | null;
};

type EditingTarget = "tv" | "phone";
type ChatMode = "build" | "plan";

const idleRunFeedback: ChatRunFeedback = {
  state: "idle",
  label: "Ready",
  details: [],
  lastUpdateAt: null,
  startedAt: null
};

const quietRunSteps = [
  "Reviewing the request and project files.",
  "Planning the safest edit path.",
  "Applying changes in the project sandbox.",
  "Checking the result for errors.",
  "Preparing the final response."
];

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectSettingsName, setProjectSettingsName] = useState("");
  const [input, setInput] = useState("");
  const [editingTarget, setEditingTarget] = useState<EditingTarget>("tv");
  const [chatMode, setChatMode] = useState<ChatMode>("plan");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountApiKey, setAccountApiKey] = useState("");
  const [isAccountKeyConfigured, setIsAccountKeyConfigured] = useState(false);
  const [isServerKeyConfigured, setIsServerKeyConfigured] = useState(false);
  const [isLoadingAccountSettings, setIsLoadingAccountSettings] = useState(false);
  const [isSavingAccountSettings, setIsSavingAccountSettings] = useState(false);
  const [accountSettingsMessage, setAccountSettingsMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingProjectSettings, setIsSavingProjectSettings] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectSummary | null>(null);
  const [runFeedback, setRunFeedback] = useState<ChatRunFeedback>(idleRunFeedback);
  const [error, setError] = useState("");
  const [projectSettingsMessage, setProjectSettingsMessage] = useState("");
  const decoderRef = useRef(new TextDecoder());

  const canCreate = useMemo(
    () => newProjectName.trim().length > 0 && !isCreating,
    [isCreating, newProjectName]
  );
  const canSubmit = useMemo(
    () => input.trim().length > 0 && !isRunning && Boolean(activeProject),
    [activeProject, input, isRunning]
  );
  const canSaveProjectSettings = useMemo(() => {
    const name = projectSettingsName.trim();
    return (
      Boolean(activeProject) &&
      name.length > 0 &&
      name.length <= PROJECT_NAME_MAX_LENGTH &&
      name !== activeProject?.name &&
      !isSavingProjectSettings
    );
  }, [activeProject, isSavingProjectSettings, projectSettingsName]);

  useEffect(() => {
    void loadProjects();
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (projectId) {
      void openProject(projectId, { updateUrl: false });
    }

    function handlePopState() {
      const nextProjectId = new URLSearchParams(window.location.search).get("project");
      if (nextProjectId) {
        void openProject(nextProjectId, { updateUrl: false });
        return;
      }

      setActiveProject(null);
      setMessages([]);
      setInput("");
      setError("");
      setRunFeedback(idleRunFeedback);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function loadProjects() {
    setIsLoadingProjects(true);
    setError("");

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load projects (${response.status})`);
      }

      const data = (await response.json()) as { projects: ProjectSummary[] };
      setProjects(data.projects);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load projects.");
    } finally {
      setIsLoadingProjects(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = newProjectName.trim();
    if (!name || isCreating) {
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = (await response.json()) as { project?: ProjectSummary; error?: string };

      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to create project (${response.status})`);
      }

      setNewProjectName("");
      setIsCreateModalOpen(false);
      setProjects((current) => [data.project as ProjectSummary, ...current]);
      await openProject(data.project.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create project.");
    } finally {
      setIsCreating(false);
    }
  }

  async function openProject(projectId: string, options: { updateUrl?: boolean } = {}) {
    const shouldUpdateUrl = options.updateUrl ?? true;
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
      const data = (await response.json()) as { project?: ProjectDetail; error?: string };

      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to open project (${response.status})`);
      }

      setActiveProject(data.project);
      setMessages(data.project.messages);
      setInput("");
      setChatMode("plan");
      if (shouldUpdateUrl) {
        window.history.pushState(null, "", `/dashboard?project=${encodeURIComponent(projectId)}`);
      }
    } catch (openError) {
      setActiveProject(null);
      setMessages([]);
      setError(openError instanceof Error ? openError.message : "Unable to open project.");
      if (shouldUpdateUrl) {
        window.history.pushState(null, "", "/dashboard");
      }
    }
  }

  function returnToProjects() {
    setIsProjectMenuOpen(false);
    setIsProjectSettingsOpen(false);
    setIsInstructionsOpen(false);
    setActiveProject(null);
    setMessages([]);
    setInput("");
    setRunFeedback(idleRunFeedback);
    window.history.pushState(null, "", "/dashboard");
  }

  function openProjectSettings() {
    if (!activeProject) {
      return;
    }

    setIsProjectMenuOpen(false);
    setProjectSettingsName(activeProject.name);
    setProjectSettingsMessage("");
    setIsProjectSettingsOpen(true);
  }

  async function saveProjectSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProject || isSavingProjectSettings) {
      return;
    }

    const name = projectSettingsName.trim();
    if (!name) {
      setProjectSettingsMessage("Project name is required.");
      return;
    }

    if (name.length > PROJECT_NAME_MAX_LENGTH) {
      setProjectSettingsMessage(`Project name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setIsSavingProjectSettings(true);
    setProjectSettingsMessage("");
    setError("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}`, {
        body: JSON.stringify({ name }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const data = (await response.json()) as { project?: ProjectSummary; error?: string };
      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to update project (${response.status})`);
      }

      setProjects((current) =>
        current.map((project) => (project.id === data.project?.id ? data.project : project))
      );
      setActiveProject((current) =>
        current && data.project && current.id === data.project.id
          ? { ...current, ...data.project, messages: current.messages }
          : current
      );
      setProjectSettingsName(data.project.name);
      setProjectSettingsMessage("Project details saved.");
    } catch (settingsError) {
      setProjectSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to save project details."
      );
    } finally {
      setIsSavingProjectSettings(false);
    }
  }

  async function openInstructions() {
    if (!activeProject) {
      return;
    }

    setIsProjectMenuOpen(false);
    setIsInstructionsOpen(true);
    setIsLoadingInstructions(true);
    setError("");

    try {
      const response = await fetch(`/api/game/${activeProject.id}/instructions`, { cache: "no-store" });
      const data = (await response.json()) as { instructions?: string; error?: string };
      if (!response.ok || typeof data.instructions !== "string") {
        throw new Error(data.error || `Failed to load instructions (${response.status})`);
      }
      setInstructions(data.instructions);
    } catch (instructionsError) {
      const message =
        instructionsError instanceof Error ? instructionsError.message : "Unable to load instructions.";
      setInstructions("");
      setError(message);
    } finally {
      setIsLoadingInstructions(false);
    }
  }

  async function saveInstructions() {
    if (!activeProject) {
      return;
    }

    setIsSavingInstructions(true);
    setError("");

    try {
      const response = await fetch(`/api/game/${activeProject.id}/instructions`, {
        body: JSON.stringify({ instructions }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const data = (await response.json()) as { instructions?: string; error?: string };
      if (!response.ok || typeof data.instructions !== "string") {
        throw new Error(data.error || `Failed to save instructions (${response.status})`);
      }
      setInstructions(data.instructions);
    } catch (instructionsError) {
      setError(instructionsError instanceof Error ? instructionsError.message : "Unable to save instructions.");
    } finally {
      setIsSavingInstructions(false);
    }
  }

  async function openAccountSettings() {
    setIsProjectMenuOpen(false);
    setIsAccountSettingsOpen(true);
    setAccountApiKey("");
    setAccountSettingsMessage("");
    setIsLoadingAccountSettings(true);

    try {
      const response = await fetch("/api/account/openai-key", { cache: "no-store" });
      const data = (await response.json()) as {
        configured?: boolean;
        error?: string;
        serverFallbackConfigured?: boolean;
      };
      if (!response.ok) {
        throw new Error(data.error || `Failed to load account settings (${response.status})`);
      }
      setIsAccountKeyConfigured(Boolean(data.configured));
      setIsServerKeyConfigured(Boolean(data.serverFallbackConfigured));
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to load account settings."
      );
    } finally {
      setIsLoadingAccountSettings(false);
    }
  }

  async function saveAccountApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountApiKey.trim() || isSavingAccountSettings) {
      return;
    }
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/openai-key", {
        body: JSON.stringify({ apiKey: accountApiKey }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = (await response.json()) as { configured?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to save API key (${response.status})`);
      }
      setIsAccountKeyConfigured(true);
      setAccountApiKey("");
      setAccountSettingsMessage("Your OpenAI API key is configured.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to save the API key."
      );
    } finally {
      setIsSavingAccountSettings(false);
    }
  }

  async function clearAccountApiKey() {
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/openai-key", { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to remove API key (${response.status})`);
      }
      setIsAccountKeyConfigured(false);
      setAccountApiKey("");
      setAccountSettingsMessage("Your saved OpenAI API key was removed.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to remove the API key."
      );
    } finally {
      setIsSavingAccountSettings(false);
    }
  }

  async function deleteProject() {
    if (!projectPendingDelete || isDeleting) {
      return;
    }

    const project = projectPendingDelete;
    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `Failed to delete project (${response.status})`);
      }

      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (activeProject?.id === project.id) {
        returnToProjects();
      }
      setProjectPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete project.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function submitChat(promptValue?: string) {
    const prompt = (promptValue ?? input).trim();
    if (!prompt || isRunning || !activeProject) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      status: "done",
      createdAt: new Date().toISOString()
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "Starting Codex...",
      status: "running",
      createdAt: new Date().toISOString()
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setIsRunning(true);
    setError("");
    const now = new Date().toISOString();
    setRunFeedback({
      state: "connecting",
      label: "Connecting to Codex",
      details: [
        chatMode === "plan"
          ? `Queued your ${editingTarget === "tv" ? "TV" : "phone"} planning request.`
          : `Queued your ${editingTarget === "tv" ? "TV" : "phone"} build request.`
      ],
      lastUpdateAt: now,
      startedAt: now
    });

    try {
      const response = await fetch("/api/chat/codex-sdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatMode, editingTarget, projectId: activeProject.id, message: prompt })
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed with ${response.status}`);
      }

      const reader = response.body.getReader();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoderRef.current.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            applyStreamEvent(JSON.parse(line) as StreamEvent, assistantId);
          }
        }
      }

      if (buffer.trim()) {
        applyStreamEvent(JSON.parse(buffer) as StreamEvent, assistantId);
      }

      await refreshOpenProject(activeProject.id);
      await loadProjects();
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : "Unknown chat failure.";
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: message, status: "error" } : item
        )
      );
      setError(message);
      setRunFeedback((current) => ({
        state: "error",
        label: "Codex stopped",
        details: appendRunDetail(current.details, message),
        lastUpdateAt: new Date().toISOString(),
        startedAt: current.startedAt
      }));
    } finally {
      setIsRunning(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitChat();
  }

  async function refreshOpenProject(projectId: string) {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { project: ProjectDetail };
    setActiveProject(data.project);
    setMessages(data.project.messages);
  }

  function applyStreamEvent(eventData: StreamEvent, assistantId: string) {
    if (eventData.type === "session") {
      setActiveProject((current) =>
        current ? { ...current, codexThreadId: eventData.sessionId } : current
      );
      setRunFeedback((current) => ({
        state: current.state === "connecting" ? "running" : current.state,
        label: current.state === "connecting" ? "Codex is working" : current.label,
        details: appendRunDetail(current.details, "Session connected."),
        lastUpdateAt: new Date().toISOString(),
        startedAt: current.startedAt
      }));
      return;
    }

    if (eventData.type === "status") {
      setRunFeedback((current) => ({
        state: "running",
        label: eventData.message,
        details: appendRunDetail(current.details, eventData.message),
        lastUpdateAt: new Date().toISOString(),
        startedAt: current.startedAt
      }));
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: eventData.message, status: "running" } : item
        )
      );
      return;
    }

    if (eventData.type === "final") {
      setRunFeedback((current) => ({
        state: "done",
        label: "Changes saved",
        details: appendRunDetail(current.details, "Codex finished updating the project."),
        lastUpdateAt: new Date().toISOString(),
        startedAt: current.startedAt
      }));
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: eventData.message, status: "done" } : item
        )
      );
      return;
    }

    setRunFeedback((current) => ({
      state: "error",
      label: "Codex stopped",
      details: appendRunDetail(current.details, eventData.message),
      lastUpdateAt: new Date().toISOString(),
      startedAt: current.startedAt
    }));
    setMessages((current) =>
      current.map((item) =>
        item.id === assistantId ? { ...item, content: eventData.message, status: "error" } : item
      )
    );
  }

  return (
    <main className={`${styles.shell} ${activeProject ? styles.editorShell : ""}`}>
      <section className={styles.header}>
        {!activeProject ? (
          <div>
            <h1 className={styles.appTitle}>Azure Tides Gaming</h1>
          </div>
        ) : null}
        {activeProject ? null : (
          <div className={styles.headerActions}>
            <button className={styles.settingsButton} onClick={openAccountSettings} type="button">
              <KeyRound aria-hidden="true" />
              Account Settings
            </button>
            <button className={styles.primaryButton} onClick={() => setIsCreateModalOpen(true)} type="button">
              New Game
            </button>
          </div>
        )}
      </section>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {activeProject ? (
        <ProjectChat
          canSubmit={canSubmit}
          chatMode={chatMode}
          editingTarget={editingTarget}
          input={input}
          isRunning={isRunning}
          messages={messages}
          onInputChange={setInput}
          onOpenAccountSettings={openAccountSettings}
          onOpenInstructions={openInstructions}
          onOpenProjectSettings={openProjectSettings}
          onModeChange={setChatMode}
          onQuickAnswer={(answer) => void submitChat(answer)}
          onReturnToProjects={returnToProjects}
          onTargetChange={setEditingTarget}
          onToggleProjectMenu={() => setIsProjectMenuOpen((current) => !current)}
          projectId={activeProject.id}
          isProjectMenuOpen={isProjectMenuOpen}
          projectName={activeProject.name}
          projectRevision={activeProject.updatedAt}
          onSubmit={handleSubmit}
          runFeedback={runFeedback}
        />
      ) : (
        <ProjectDashboard
          isLoadingProjects={isLoadingProjects}
          onDeleteProject={setProjectPendingDelete}
          onCreateProject={() => setIsCreateModalOpen(true)}
          onOpenProject={openProject}
          projects={projects}
        />
      )}

      {isCreateModalOpen ? (
        <CreateProjectModal
          canCreate={canCreate}
          isCreating={isCreating}
          newProjectName={newProjectName}
          onClose={() => {
            if (!isCreating) {
              setIsCreateModalOpen(false);
              setNewProjectName("");
            }
          }}
          onCreateProject={handleCreateProject}
          onNameChange={setNewProjectName}
        />
      ) : null}

      {isAccountSettingsOpen ? (
        <AccountSettingsModal
          apiKey={accountApiKey}
          configured={isAccountKeyConfigured}
          isLoading={isLoadingAccountSettings}
          isSaving={isSavingAccountSettings}
          message={accountSettingsMessage}
          onApiKeyChange={setAccountApiKey}
          onClear={clearAccountApiKey}
          onClose={() => {
            if (!isSavingAccountSettings) {
              setIsAccountSettingsOpen(false);
              setAccountApiKey("");
              setAccountSettingsMessage("");
            }
          }}
          onSave={saveAccountApiKey}
          serverFallbackConfigured={isServerKeyConfigured}
        />
      ) : null}

      {isProjectSettingsOpen && activeProject ? (
        <ProjectSettingsModal
          canSave={canSaveProjectSettings}
          isSaving={isSavingProjectSettings}
          message={projectSettingsMessage}
          name={projectSettingsName}
          onClose={() => {
            if (!isSavingProjectSettings) {
              setIsProjectSettingsOpen(false);
              setProjectSettingsMessage("");
              setProjectSettingsName("");
            }
          }}
          onNameChange={setProjectSettingsName}
          onSave={saveProjectSettings}
        />
      ) : null}

      {projectPendingDelete ? (
        <DeleteProjectModal
          isDeleting={isDeleting}
          onCancel={() => {
            if (!isDeleting) {
              setProjectPendingDelete(null);
            }
          }}
          onConfirm={deleteProject}
          project={projectPendingDelete}
        />
      ) : null}

      {isInstructionsOpen && activeProject ? (
        <InstructionsModal
          instructions={instructions}
          isLoading={isLoadingInstructions}
          isSaving={isSavingInstructions}
          onChange={setInstructions}
          onClose={() => setIsInstructionsOpen(false)}
          onSave={saveInstructions}
          projectId={activeProject.id}
        />
      ) : null}
    </main>
  );
}

function ProjectSettingsModal({
  canSave,
  isSaving,
  message,
  name,
  onClose,
  onNameChange,
  onSave
}: {
  canSave: boolean;
  isSaving: boolean;
  message: string;
  name: string;
  onClose: () => void;
  onNameChange: (value: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const trimmedLength = name.trim().length;
  const isOverLimit = trimmedLength > PROJECT_NAME_MAX_LENGTH;

  return (
    <div className={styles.modalOverlay} role="presentation">
      <form className={styles.modal} onSubmit={onSave}>
        <div className={styles.modalHeader}>
          <h2>Project Settings</h2>
          <button
            aria-label="Close project settings"
            className={styles.closeButton}
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={`${styles.modalBody} ${styles.projectSettingsBody}`}>
          <label htmlFor="project-name">Project name</label>
          <div className={styles.projectNameField}>
            <Settings aria-hidden="true" />
            <input
              autoComplete="off"
              disabled={isSaving}
              id="project-name"
              maxLength={PROJECT_NAME_MAX_LENGTH + 20}
              onChange={(event) => onNameChange(event.target.value)}
              type="text"
              value={name}
            />
          </div>
          <div className={styles.fieldMeta}>
            <span className={isOverLimit ? styles.fieldError : undefined}>
              {trimmedLength}/{PROJECT_NAME_MAX_LENGTH}
            </span>
          </div>
          {message ? <p className={styles.settingsMessage}>{message}</p> : null}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryButton} disabled={isSaving} onClick={onClose} type="button">
            Cancel
          </button>
          <button disabled={!canSave} type="submit">
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountSettingsModal({
  apiKey,
  configured,
  isLoading,
  isSaving,
  message,
  onApiKeyChange,
  onClear,
  onClose,
  onSave,
  serverFallbackConfigured
}: {
  apiKey: string;
  configured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  onApiKeyChange: (value: string) => void;
  onClear: () => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  serverFallbackConfigured: boolean;
}) {
  return (
    <div className={styles.modalOverlay} role="presentation">
      <form className={styles.modal} onSubmit={onSave}>
        <div className={styles.modalHeader}>
          <h2>Account Settings</h2>
          <button
            aria-label="Close account settings"
            className={styles.closeButton}
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={`${styles.modalBody} ${styles.accountSettingsBody}`}>
          <p>
            Add your OpenAI API key to run dashboard AI edits with the Codex SDK.
            The key is encrypted server-side and is never shown again.
          </p>
          <label htmlFor="openai-api-key">OpenAI API key</label>
          <input
            autoComplete="off"
            disabled={isLoading || isSaving}
            id="openai-api-key"
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder={configured ? "A personal key is configured" : "sk-..."}
            type="password"
            value={apiKey}
          />
          <p className={styles.settingsStatus}>
            {isLoading
              ? "Loading settings..."
              : configured
                ? "Personal API key configured."
                : serverFallbackConfigured
                  ? "Using the server API key until you add a personal key."
                  : "No API key configured. Local development can use your Codex login."}
          </p>
          {message ? <p className={styles.settingsMessage}>{message}</p> : null}
        </div>
        <div className={styles.modalFooter}>
          {configured ? (
            <button
              className={styles.dangerButton}
              disabled={isSaving}
              onClick={onClear}
              type="button"
            >
              Remove Key
            </button>
          ) : null}
          <button className={styles.secondaryButton} disabled={isSaving} onClick={onClose} type="button">
            Close
          </button>
          <button disabled={!apiKey.trim() || isLoading || isSaving} type="submit">
            {isSaving ? "Saving..." : configured ? "Replace Key" : "Save Key"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectDashboard({
  isLoadingProjects,
  onDeleteProject,
  onCreateProject,
  onOpenProject,
  projects
}: {
  isLoadingProjects: boolean;
  onCreateProject: () => void;
  onDeleteProject: (project: ProjectSummary) => void;
  onOpenProject: (projectId: string) => void;
  projects: ProjectSummary[];
}) {
  return (
    <section className={styles.dashboard}>
      <section className={styles.projectList} aria-label="Projects">
        {isLoadingProjects ? <p className={styles.emptyText}>Loading projects...</p> : null}
        {!isLoadingProjects && projects.length === 0 ? (
          <div className={styles.emptyText}>
            <p>No projects yet. Create one to open a sandboxed Codex session.</p>
            <button onClick={onCreateProject} type="button">
              New Game
            </button>
          </div>
        ) : null}
        {projects.map((project) => (
          <div className={styles.projectCardShell} key={project.id}>
            <a
              aria-label={`Open ${project.name} on TV`}
              className={styles.projectCard}
              href={`/tv/${project.id}`}
            >
              <div>
                <h2>{project.name}</h2>
                <span>{formatUpdatedAt(project.updatedAt)}</span>
              </div>
            </a>
            <button
              aria-label={`Edit ${project.name}`}
              className={styles.editButton}
              onClick={() => onOpenProject(project.id)}
              title="Edit project"
              type="button"
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              aria-label={`Delete ${project.name}`}
              className={styles.trashButton}
              onClick={() => onDeleteProject(project)}
              title="Delete project"
              type="button"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
        ))}
      </section>
    </section>
  );
}

function DeleteProjectModal({
  isDeleting,
  onCancel,
  onConfirm,
  project
}: {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  project: ProjectSummary;
}) {
  return (
    <div className={styles.modalOverlay} role="presentation">
      <section aria-labelledby="delete-project-title" className={`${styles.modal} ${styles.confirmModal}`}>
        <div className={styles.modalHeader}>
          <h2 id="delete-project-title">Delete Game</h2>
          <button
            aria-label="Close delete confirmation"
            className={styles.closeButton}
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.confirmText}>
            Delete <strong>{project.name}</strong> from ATG? Its folder will move to local trash.
          </p>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.secondaryButton} disabled={isDeleting} onClick={onCancel} type="button">
            Cancel
          </button>
          <button className={styles.dangerButton} disabled={isDeleting} onClick={onConfirm} type="button">
            {isDeleting ? "Deleting" : "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CreateProjectModal({
  canCreate,
  isCreating,
  newProjectName,
  onClose,
  onCreateProject,
  onNameChange
}: {
  canCreate: boolean;
  isCreating: boolean;
  newProjectName: string;
  onClose: () => void;
  onCreateProject: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
}) {
  return (
    <div className={styles.modalOverlay} role="presentation">
      <form className={styles.modal} onSubmit={onCreateProject}>
        <div className={styles.modalHeader}>
          <h2>Create Game</h2>
          <button
            aria-label="Close create project dialog"
            className={styles.closeButton}
            disabled={isCreating}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.createControls}>
            <input
              aria-label="Project name"
              autoFocus
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Project name"
              value={newProjectName}
            />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button disabled={!canCreate} type="submit">
            {isCreating ? "Creating" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InstructionsModal({
  instructions,
  isLoading,
  isSaving,
  onChange,
  onClose,
  onSave,
  projectId
}: {
  instructions: string;
  isLoading: boolean;
  isSaving: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  projectId: string;
}) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  return (
    <div className={styles.modalOverlay} role="presentation">
      <section aria-label="Game instructions" className={`${styles.modal} ${styles.instructionsModal}`}>
        <div className={styles.modalHeader}>
          <h2>Instructions</h2>
          <button
            aria-label="Close instructions dialog"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.instructionsToolbar} role="tablist" aria-label="Instructions mode">
          <button
            aria-selected={mode === "edit"}
            className={mode === "edit" ? styles.activeModeButton : undefined}
            onClick={() => setMode("edit")}
            role="tab"
            type="button"
          >
            Edit
          </button>
          <button
            aria-selected={mode === "preview"}
            className={mode === "preview" ? styles.activeModeButton : undefined}
            onClick={() => setMode("preview")}
            role="tab"
            type="button"
          >
            Preview
          </button>
        </div>
        <div className={styles.instructionsBody}>
          {isLoading ? (
            <p className={styles.emptyInstructions}>Loading instructions...</p>
          ) : mode === "edit" ? (
            <textarea
              aria-label="Game instructions Markdown"
              className={styles.instructionsEditor}
              onChange={(event) => onChange(event.target.value)}
              spellCheck
              value={instructions}
            />
          ) : (
            <InstructionsViewer
              assetBasePath={`/api/projects/${projectId}/game-assets`}
              markdown={instructions}
            />
          )}
        </div>
        <div className={styles.modalFooter}>
          <button disabled={isLoading || isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving" : "Save"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectChat({
  canSubmit,
  chatMode,
  editingTarget,
  input,
  isRunning,
  isProjectMenuOpen,
  messages,
  onInputChange,
  onModeChange,
  onOpenAccountSettings,
  onOpenInstructions,
  onOpenProjectSettings,
  onQuickAnswer,
  onReturnToProjects,
  onTargetChange,
  onToggleProjectMenu,
  onSubmit,
  projectId,
  projectName,
  projectRevision,
  runFeedback
}: {
  canSubmit: boolean;
  chatMode: ChatMode;
  editingTarget: EditingTarget;
  input: string;
  isRunning: boolean;
  isProjectMenuOpen: boolean;
  messages: ChatMessage[];
  onInputChange: (value: string) => void;
  onModeChange: (mode: ChatMode) => void;
  onOpenAccountSettings: () => void;
  onOpenInstructions: () => void;
  onOpenProjectSettings: () => void;
  onQuickAnswer: (answer: string) => void;
  onReturnToProjects: () => void;
  onTargetChange: (target: EditingTarget) => void;
  onToggleProjectMenu: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  projectId: string;
  projectName: string;
  projectRevision: string;
  runFeedback: ChatRunFeedback;
}) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const showFeedback = runFeedback.state !== "idle";
  const previewPath = buildGameAssetUrl(projectId, editingTarget, projectRevision);
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.status === "done");
  const quickAnswers =
    chatMode === "plan" && latestAssistantMessage ? extractPlanningChoices(latestAssistantMessage.content) : [];
  const planningQuestion =
    chatMode === "plan" && latestAssistantMessage ? extractPlanningQuestion(latestAssistantMessage.content) : "";
  const quickAnswersKey = quickAnswers.map((answer) => `${answer.label}:${answer.text}`).join("|");
  const hasConversation = messages.length > 0 || quickAnswers.length > 0;
  const targetName = editingTarget === "tv" ? "TV display" : "phone controller";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, quickAnswers.length, quickAnswersKey]);

  return (
    <section className={styles.editorWorkspace} aria-label="Project editor">
      <section
        className={`${styles.chatPanel} ${messages.length === 0 && !showFeedback ? styles.emptyChatPanel : ""}`}
        aria-label="Project chat"
      >
        <div className={styles.editorToolbar}>
          <div className={styles.targetToggle} role="tablist" aria-label="Editing target">
            <button
              aria-selected={editingTarget === "tv"}
              className={editingTarget === "tv" ? styles.activeTargetButton : undefined}
              onClick={() => onTargetChange("tv")}
              role="tab"
              type="button"
            >
              <Monitor aria-hidden="true" />
              TV
            </button>
            <button
              aria-selected={editingTarget === "phone"}
              className={editingTarget === "phone" ? styles.activeTargetButton : undefined}
              onClick={() => onTargetChange("phone")}
              role="tab"
              type="button"
            >
              <Smartphone aria-hidden="true" />
              Phone
            </button>
          </div>
          <div className={styles.modeToggle} role="tablist" aria-label="Chat mode">
            <button
              aria-selected={chatMode === "build"}
              className={chatMode === "build" ? styles.activeModeButton : undefined}
              disabled={isRunning}
              onClick={() => onModeChange("build")}
              role="tab"
              type="button"
            >
              <Hammer aria-hidden="true" />
              Build
            </button>
            <button
              aria-selected={chatMode === "plan"}
              className={chatMode === "plan" ? styles.activeModeButton : undefined}
              disabled={isRunning}
              onClick={() => onModeChange("plan")}
              role="tab"
              type="button"
            >
              <Lightbulb aria-hidden="true" />
              Plan
            </button>
          </div>
        </div>

        {hasConversation ? (
          <div className={styles.messages}>
            {messages.map((message) => {
              return (
                <div className={styles.messageGroup} key={message.id}>
                  <article
                    className={`${styles.message} ${styles[message.role]} ${
                      message.status === "error" ? styles.error : ""
                    }`}
                  >
                    <div className={styles.messageMeta}>
                      <span>
                        {message.role === "assistant" ? "Codex" : message.role === "user" ? "You" : "ATG"}
                      </span>
                      {message.status === "running" ? <span>Running</span> : null}
                    </div>
                    <p>{message.content}</p>
                  </article>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : null}

        {showFeedback ? <RunFeedback feedback={runFeedback} /> : null}

        {quickAnswers.length > 0 && !isRunning ? (
          <div className={styles.quickAnswers} aria-label="Planning answer choices">
            <div className={styles.planningQuestion}>
              <span>Codex asks</span>
              <p>{planningQuestion || "Choose the next planning direction."}</p>
            </div>
            {quickAnswers.map((answer) => (
              <button
                key={answer.label}
                onClick={() => onQuickAnswer(`${answer.label}. ${answer.text}`)}
                type="button"
              >
                <span>{answer.label}</span>
                {answer.text}
              </button>
            ))}
          </div>
        ) : null}

        <form className={styles.composer} onSubmit={onSubmit}>
          {chatMode === "build" ? (
            <div className={styles.composerMeta}>
              <span>Build target</span>
              <strong>{targetName}</strong>
            </div>
          ) : null}
          <textarea
            aria-label="Message Codex"
            disabled={isRunning}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={
              chatMode === "plan"
                ? "Ask Codex to help plan gameplay choices..."
                : `Ask Codex to update the ${targetName}...`
            }
            rows={4}
            value={input}
          />
          <button disabled={!canSubmit} type="submit">
            {isRunning ? "Running" : chatMode === "plan" ? "Plan" : `Build ${editingTarget === "tv" ? "TV" : "Phone"}`}
          </button>
        </form>
      </section>

      <aside className={styles.previewPanel} aria-label={`${editingTarget} UI preview`}>
        <div className={styles.previewHeader}>
          <div className={styles.previewTitleGroup}>
            <h2>{projectName}</h2>
            <span>{editingTarget === "tv" ? "TV Preview" : "Phone Preview"}</span>
          </div>
          <div className={styles.previewMenuActions}>
            <button
              aria-expanded={isProjectMenuOpen}
              aria-label="Open game menu"
              className={styles.menuButton}
              onClick={onToggleProjectMenu}
              type="button"
            >
              <Menu aria-hidden="true" />
            </button>
            {isProjectMenuOpen ? (
              <div className={styles.menu} role="menu">
                <a href={`/tv/${projectId}`} role="menuitem">
                  Open TV
                </a>
                <a href={`/join/${projectId}`} role="menuitem">
                  Open Phone
                </a>
                <button onClick={onOpenInstructions} role="menuitem" type="button">
                  Instructions
                </button>
                <button onClick={onOpenProjectSettings} role="menuitem" type="button">
                  Project Settings
                </button>
                <button onClick={onOpenAccountSettings} role="menuitem" type="button">
                  Account Settings
                </button>
                <button onClick={onReturnToProjects} role="menuitem" type="button">
                  Dashboard
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <ScaledPreviewFrame
          editingTarget={editingTarget}
          previewPath={previewPath}
          title={`${projectName} ${editingTarget} preview`}
        />
      </aside>
    </section>
  );
}

function extractPlanningChoices(content: string) {
  return content
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(?:[-*]\s*)?([A-D])[\).:-]\s+(.{1,180})\s*$/i);
      return match ? { label: match[1].toUpperCase(), text: match[2].trim() } : null;
    })
    .filter((choice): choice is { label: string; text: string } => Boolean(choice));
}

function extractPlanningQuestion(content: string) {
  const compactContent = content.replace(/\s+/g, " ").trim();
  const beforeChoices = compactContent.match(/^(.*?)(?=\s(?:[-*]\s*)?[A-D][).:-]\s+)/i)?.[1] ?? compactContent;

  return beforeChoices
    .replace(/^Question\s*[:\-]\s*/i, "")
    .replace(/^Codex asks\s*[:\-]\s*/i, "")
    .trim();
}

function ScaledPreviewFrame({
  editingTarget,
  previewPath,
  title
}: {
  editingTarget: EditingTarget;
  previewPath: string;
  title: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const virtualSize = editingTarget === "tv" ? { height: 720, width: 1280 } : { height: 844, width: 390 };

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    const currentFrame = frame;

    function updateScale() {
      const { height, width } = currentFrame.getBoundingClientRect();
      setScale(Math.min(width / virtualSize.width, height / virtualSize.height, 1));
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(currentFrame);
    return () => observer.disconnect();
  }, [virtualSize.height, virtualSize.width]);

  return (
    <div className={styles.scaledPreviewFrame} ref={frameRef}>
      <iframe
        key={previewPath}
        sandbox="allow-scripts"
        src={previewPath}
        style={{
          height: `${virtualSize.height}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          width: `${virtualSize.width}px`
        }}
        title={title}
      />
    </div>
  );
}

function RunFeedback({ feedback }: { feedback: ChatRunFeedback }) {
  const [now, setNow] = useState(() => Date.now());
  const Icon =
    feedback.state === "error"
      ? MessageSquareWarning
      : feedback.state === "done"
        ? CheckCircle2
        : LoaderCircle;
  const startedAt = feedback.startedAt ? new Date(feedback.startedAt).getTime() : null;
  const lastUpdateAt = feedback.lastUpdateAt ? new Date(feedback.lastUpdateAt).getTime() : null;
  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const quietSeconds = lastUpdateAt ? Math.max(0, Math.floor((now - lastUpdateAt) / 1000)) : 0;
  const quietStep = quietRunSteps[Math.min(quietRunSteps.length - 1, Math.floor(elapsedSeconds / 30))];
  const isActive = feedback.state === "running" || feedback.state === "connecting";

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  return (
    <details
      className={`${styles.runFeedback} ${styles[feedback.state]}`}
      open={feedback.state === "error" ? true : undefined}
    >
      <summary className={styles.runFeedbackHeader} aria-live="polite">
        <Icon aria-hidden="true" className={isActive ? styles.spin : undefined} />
        <span className={styles.runFeedbackLabel}>{feedback.label}</span>
        {startedAt ? (
          <span className={styles.runFeedbackMeta}>
            {formatDuration(elapsedSeconds)}
            {isActive && quietSeconds >= 10 ? ` · quiet ${formatDuration(quietSeconds)}` : ""}
          </span>
        ) : null}
        <span className={styles.runFeedbackAction}>
          Details
          <ChevronDown aria-hidden="true" />
        </span>
      </summary>
      <div className={styles.runFeedbackDetails}>
        {isActive ? <p className={styles.quietStep}>{quietStep}</p> : null}
        {feedback.details.length > 0 ? (
          <ol>
            {feedback.details.map((detail, index) => (
              <li key={`${detail}-${index}`}>{detail}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.quietStep}>No additional updates yet.</p>
        )}
      </div>
    </details>
  );
}

function appendRunDetail(details: string[], detail: string) {
  const trimmedDetail = detail.trim();
  if (!trimmedDetail || details.at(-1) === trimmedDetail) {
    return details;
  }

  return [...details, trimmedDetail].slice(-4);
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatUpdatedAt(value: string) {
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))}`;
}
