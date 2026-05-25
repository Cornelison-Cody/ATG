"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Menu, Trash2, X } from "lucide-react";
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

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [input, setInput] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const decoderRef = useRef(new TextDecoder());

  const canCreate = useMemo(
    () => newProjectName.trim().length > 0 && !isCreating,
    [isCreating, newProjectName]
  );
  const canSubmit = useMemo(
    () => input.trim().length > 0 && !isRunning && Boolean(activeProject),
    [activeProject, input, isRunning]
  );

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
    setActiveProject(null);
    setMessages([]);
    setInput("");
    window.history.pushState(null, "", "/dashboard");
  }

  async function deleteProject(project: ProjectSummary) {
    const confirmed = window.confirm(`Delete "${project.name}" from ATG? Its folder will move to local trash.`);
    if (!confirmed) {
      return;
    }

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
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete project.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = input.trim();
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeProject.id, message: prompt })
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
    } finally {
      setIsRunning(false);
    }
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
      return;
    }

    if (eventData.type === "status") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: eventData.message, status: "running" } : item
        )
      );
      return;
    }

    if (eventData.type === "final") {
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId ? { ...item, content: eventData.message, status: "done" } : item
        )
      );
      return;
    }

    setMessages((current) =>
      current.map((item) =>
        item.id === assistantId ? { ...item, content: eventData.message, status: "error" } : item
      )
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.header}>
        <div>
          <h1 className={activeProject ? undefined : styles.appTitle}>
            {activeProject ? activeProject.name : "Azure Tides Gaming"}
          </h1>
        </div>
        {activeProject ? (
          <div className={styles.headerActions}>
            <button
              aria-expanded={isProjectMenuOpen}
              aria-label="Open game menu"
              className={styles.menuButton}
              onClick={() => setIsProjectMenuOpen((current) => !current)}
              type="button"
            >
              <Menu aria-hidden="true" />
            </button>
            {isProjectMenuOpen ? (
              <div className={styles.menu} role="menu">
                <a href={`/tv/${activeProject.id}`} role="menuitem">
                  Open TV
                </a>
                <a href={`/join/${activeProject.id}`} role="menuitem">
                  Open Phone
                </a>
                <button onClick={returnToProjects} role="menuitem" type="button">
                  Go Home
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <button className={styles.primaryButton} onClick={() => setIsCreateModalOpen(true)} type="button">
            New Game
          </button>
        )}
      </section>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {activeProject ? (
        <ProjectChat
          canSubmit={canSubmit}
          input={input}
          isRunning={isRunning}
          messages={messages}
          onInputChange={setInput}
          onSubmit={handleSubmit}
        />
      ) : (
        <ProjectDashboard
          isLoadingProjects={isLoadingProjects}
          onDeleteProject={deleteProject}
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
    </main>
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
            <article
              aria-label={`Open ${project.name}`}
              className={styles.projectCard}
              onClick={() => onOpenProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenProject(project.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div>
                <h2>{project.name}</h2>
                <span>{formatUpdatedAt(project.updatedAt)}</span>
              </div>
            </article>
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

function ProjectChat({
  canSubmit,
  input,
  isRunning,
  messages,
  onInputChange,
  onSubmit
}: {
  canSubmit: boolean;
  input: string;
  isRunning: boolean;
  messages: ChatMessage[];
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <section className={styles.chatPanel} aria-label="Project chat">
      <div className={styles.messages}>
        {messages.map((message) => (
          <article
            className={`${styles.message} ${styles[message.role]} ${
              message.status === "error" ? styles.error : ""
            }`}
            key={message.id}
          >
            <div className={styles.messageMeta}>
              <span>{message.role === "assistant" ? "Codex" : message.role === "user" ? "You" : "ATG"}</span>
              {message.status === "running" ? <span>Running</span> : null}
            </div>
            <p>{message.content}</p>
          </article>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <textarea
          aria-label="Message Codex"
          disabled={isRunning}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask Codex to update this project..."
          rows={4}
          value={input}
        />
        <button disabled={!canSubmit} type="submit">
          {isRunning ? "Running" : "Send"}
        </button>
      </form>
    </section>
  );
}

function formatUpdatedAt(value: string) {
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value))}`;
}
