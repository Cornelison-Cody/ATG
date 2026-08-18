"use client";

import { CSSProperties, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  Copy,
  File,
  Globe2,
  Hammer,
  KeyRound,
  Lightbulb,
  LoaderCircle,
  Lock,
  Menu,
  MessageSquareWarning,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Settings,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  X
} from "lucide-react";
import { InstructionsViewer } from "@/components/instructions-viewer";
import { EngineDiagnostics } from "@/components/engine-diagnostics";
import { buildGameAssetUrl } from "@/lib/game-asset-url.mjs";
import { getUpgradeGameAvailability, UPGRADE_GAME_PROMPT } from "@/lib/upgrade-game.mjs";
import type { GameEngineMetadata } from "@/lib/game-engine-metadata.mjs";
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
  ownerUserId?: string;
  ownerName?: string;
  collaborators: ProjectCollaborator[];
  accessRole?: "owner" | "collaborator";
  visibility: "private" | "public";
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  messageCount: number;
  engine?: GameEngineMetadata;
};

type ProjectDetail = Omit<ProjectSummary, "messageCount"> & {
  messages: ChatMessage[];
};

type ProjectCollaborator = {
  principalName: string;
  invitedAt: string;
};

type GameAssetSummary = {
  contentType: string;
  name: string;
  path: string;
  size: number;
  updatedAt: string;
};
type MediaJob = { id: string; kind: string; prompt: string; status: string; progress?: { message: string }[]; result?: { asset?: { path?: string }; provenance?: Record<string, unknown> } | null; visualKind?: string };

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
type BuildTarget = EditingTarget | "both";
type ChatMode = "build" | "plan";
type HiddenEditorPanel = "editor" | "preview" | null;
type ChatSubmitOptions = {
  chatMode?: ChatMode;
  editingTarget?: BuildTarget;
  conversionId?: string;
};
type ConversionStatus = "queued" | "running" | "review" | "failed" | "cancelled" | "accepted";
type ConversionValidation = {
  blockingErrors: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  checks: { code: string; passed: boolean; message: string }[];
};
type RuntimeUpgradeOption = { runtimeVersion: string; compatible: boolean; warnings?: string[]; blockingErrors?: string[] };
type RuntimeUpgradeValidation = { blockingErrors: string[]; checks: { code: string; passed: boolean; message: string }[]; warnings: string[] };
type RuntimeUpgradeRecord = { id: string; status: "preview" | "accepted" | "cancelled"; candidate: RuntimeUpgradeOption; previewRevision: string; validation?: RuntimeUpgradeValidation | null };

const EDITOR_SPLIT_STORAGE_KEY = "atg.dashboard.editorSplitRatio";
const EDITOR_HIDDEN_PANEL_STORAGE_KEY = "atg.dashboard.hiddenEditorPanel";
const EDITOR_SPLIT_DESKTOP_QUERY = "(min-width: 981px)";
const EDITOR_PANEL_MIN_WIDTH = 420;
const PREVIEW_PANEL_MIN_WIDTH = 360;
const EDITOR_SPLIT_CHROME_WIDTH = 28;

type AccountUsageBudget = {
  budget: {
    consumedPercent: number | null;
    monthlyBudgetUsd: number | null;
    remainingBudgetUsd: number | null;
  };
  lastUpdatedAt: string | null;
  period: {
    key: string;
    resetAt: string;
    startAt: string;
    timezone: "UTC";
  };
  pricing: {
    sourceUrl: string;
    version: string;
  };
  totals: {
    cachedInputTokens: number;
    estimatedRecords: number;
    estimatedSpendUsd: number;
    inputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    recordCount: number;
    unpricedRecords: number;
  };
  managedCredit: {
    monthlyCreditUsd: number;
    remainingCreditUsd: number;
    reservationUsd: number;
    reservedUsd: number;
    spentUsd: number;
    period: {
      resetAt: string;
    };
  };
  valuesAreEstimated: boolean;
};

type AccountAiBilling = {
  mode: "managed" | "byok";
  byok: {
    configured: boolean;
  };
  managed: {
    enabled: boolean;
    eligible: boolean;
    keyConfigured: boolean;
    monthlyCreditUsd: number;
    remainingCreditUsd: number;
    reservationUsd: number;
    resetAt: string;
  };
};

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
  const [projectSettingsVisibility, setProjectSettingsVisibility] = useState<ProjectSummary["visibility"]>("private");
  const [collaboratorInput, setCollaboratorInput] = useState("");
  const [input, setInput] = useState("");
  const [editingTarget, setEditingTarget] = useState<EditingTarget>("tv");
  const [chatMode, setChatMode] = useState<ChatMode>("plan");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [accountApiKey, setAccountApiKey] = useState("");
  const [isAccountKeyConfigured, setIsAccountKeyConfigured] = useState(false);
  const [accountUsageBudget, setAccountUsageBudget] = useState<AccountUsageBudget | null>(null);
  const [accountAiBilling, setAccountAiBilling] = useState<AccountAiBilling | null>(null);
  const [monthlyBudgetInput, setMonthlyBudgetInput] = useState("");
  const [isLoadingAccountSettings, setIsLoadingAccountSettings] = useState(false);
  const [isSavingAccountSettings, setIsSavingAccountSettings] = useState(false);
  const [isTestingAccountKey, setIsTestingAccountKey] = useState(false);
  const [accountSettingsMessage, setAccountSettingsMessage] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isLoadingInstructions, setIsLoadingInstructions] = useState(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [assets, setAssets] = useState<GameAssetSummary[]>([]);
  const [assetsMessage, setAssetsMessage] = useState("");
  const [isMediaOpen, setIsMediaOpen] = useState(false);
  const [mediaJobs, setMediaJobs] = useState<MediaJob[]>([]);
  const [mediaPrompt, setMediaPrompt] = useState("");
  const [mediaKind, setMediaKind] = useState("character");
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [deletingAssetPath, setDeletingAssetPath] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingProjectSettings, setIsSavingProjectSettings] = useState(false);
  const [isUpdatingCollaborators, setIsUpdatingCollaborators] = useState(false);
  const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
  const [isUpgradeGameOpen, setIsUpgradeGameOpen] = useState(false);
  const [isRuntimeUpgradeOpen, setIsRuntimeUpgradeOpen] = useState(false);
  const [runtimeUpgradeOptions, setRuntimeUpgradeOptions] = useState<RuntimeUpgradeOption[]>([]);
  const [runtimeUpgrade, setRuntimeUpgrade] = useState<RuntimeUpgradeRecord | null>(null);
  const [runtimeUpgradeWarningsAcknowledged, setRuntimeUpgradeWarningsAcknowledged] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeConversionId, setActiveConversionId] = useState<string | null>(null);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus | null>(null);
  const [conversionRevision, setConversionRevision] = useState<string | null>(null);
  const [conversionValidation, setConversionValidation] = useState<ConversionValidation | null>(null);
  const [conversionWarningsAcknowledged, setConversionWarningsAcknowledged] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectSummary | null>(null);
  const [runFeedback, setRunFeedback] = useState<ChatRunFeedback>(idleRunFeedback);
  const [error, setError] = useState("");
  const [projectSettingsMessage, setProjectSettingsMessage] = useState("");
  const decoderRef = useRef(new TextDecoder());
  const canManageActiveProject = activeProject?.accessRole === "owner";
  const upgradeGameAvailability = getUpgradeGameAvailability({
    engine: activeProject?.engine,
    accessRole: activeProject?.accessRole,
    isRunning
  });

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
      (name !== activeProject?.name ||
        (canManageActiveProject && projectSettingsVisibility !== activeProject?.visibility)) &&
      !isSavingProjectSettings
    );
  }, [activeProject, canManageActiveProject, isSavingProjectSettings, projectSettingsName, projectSettingsVisibility]);

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
    setIsAssetsOpen(false);
    setIsUpgradeGameOpen(false);
    setActiveProject(null);
    setMessages([]);
    setInput("");
    setRunFeedback(idleRunFeedback);
    window.history.pushState(null, "", "/dashboard");
  }

  function openUpgradeGame() {
    if (!activeProject || !upgradeGameAvailability.available) return;
    setIsProjectMenuOpen(false);
    setIsUpgradeGameOpen(true);
  }

  async function openRuntimeUpgrade() {
    if (!activeProject || activeProject.engine?.type !== "pixi" || isRunning) return;
    setIsProjectMenuOpen(false);
    const response = await fetch(`/api/projects/${activeProject.id}/runtime-upgrades`, { cache: "no-store" });
    const data = await response.json() as { options?: RuntimeUpgradeOption[]; upgrades?: RuntimeUpgradeRecord[]; error?: string };
    if (!response.ok) { setError(data.error || "Unable to load runtime upgrades."); return; }
    setRuntimeUpgradeOptions(data.options || []);
    setRuntimeUpgrade(data.upgrades?.find((item) => item.status === "preview") || null);
    setRuntimeUpgradeWarningsAcknowledged(false);
    setIsRuntimeUpgradeOpen(true);
  }

  async function startRuntimeUpgrade(runtimeVersion: string) {
    if (!activeProject) return;
    const response = await fetch(`/api/projects/${activeProject.id}/runtime-upgrades`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runtimeVersion }) });
    const data = await response.json() as { upgrade?: RuntimeUpgradeRecord; error?: string };
    if (!response.ok || !data.upgrade) { setError(data.error || "Unable to start runtime upgrade."); return; }
    setRuntimeUpgrade(data.upgrade); setRuntimeUpgradeWarningsAcknowledged(false);
  }

  async function updateRuntimeUpgrade(action: "accept" | "cancel" | "validate") {
    if (!activeProject || !runtimeUpgrade) return;
    const response = await fetch(`/api/projects/${activeProject.id}/runtime-upgrades/${runtimeUpgrade.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, acknowledgeWarnings: runtimeUpgradeWarningsAcknowledged }) });
    const data = await response.json() as { upgrade?: RuntimeUpgradeRecord; error?: string };
    if (!response.ok || !data.upgrade) { setError(data.error || "Unable to update runtime upgrade."); return; }
    setRuntimeUpgrade(data.upgrade); if (action === "accept") { setIsRuntimeUpgradeOpen(false); await refreshOpenProject(activeProject.id); }
  }

  async function startUpgradeGame() {
    if (!activeProject || !upgradeGameAvailability.available) return;
    setIsUpgradeGameOpen(false);
    try {
      const response = await fetch(`/api/projects/${activeProject.id}/conversions`, {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = (await response.json()) as { conversion?: { id: string }; error?: string };
      if (!response.ok || !data.conversion) throw new Error(data.error || `Unable to start conversion (${response.status})`);
      setActiveConversionId(data.conversion.id);
      setConversionStatus("queued");
      setConversionRevision(null);
      setConversionValidation(null);
      setConversionWarningsAcknowledged(false);
      setChatMode("build");
      setEditingTarget("tv");
      setInput("");
      void submitChat(UPGRADE_GAME_PROMPT, { chatMode: "build", editingTarget: "both", conversionId: data.conversion.id });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to start conversion.");
    }
  }

  function openProjectSettings() {
    if (!activeProject) {
      return;
    }

    setIsProjectMenuOpen(false);
    setProjectSettingsName(activeProject.name);
    setProjectSettingsVisibility(activeProject.visibility);
    setCollaboratorInput("");
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
        body: JSON.stringify({
          name,
          ...(canManageActiveProject ? { visibility: projectSettingsVisibility } : {})
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const data = (await response.json()) as { project?: ProjectSummary; error?: string };
      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to update project (${response.status})`);
      }

      applyProjectSummary(data.project);
      setProjectSettingsName(data.project.name);
      setProjectSettingsVisibility(data.project.visibility);
      setProjectSettingsMessage("Project details saved.");
    } catch (settingsError) {
      setProjectSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to save project details."
      );
    } finally {
      setIsSavingProjectSettings(false);
    }
  }

  async function addCollaborator() {
    if (!activeProject || !canManageActiveProject || isUpdatingCollaborators) {
      return;
    }

    setIsUpdatingCollaborators(true);
    setProjectSettingsMessage("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/collaborators`, {
        body: JSON.stringify({ principalName: collaboratorInput }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = (await response.json()) as { project?: ProjectSummary; error?: string };
      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to add collaborator (${response.status})`);
      }

      applyProjectSummary(data.project);
      setCollaboratorInput("");
      setProjectSettingsMessage("Collaborator added.");
    } catch (collaboratorError) {
      setProjectSettingsMessage(
        collaboratorError instanceof Error ? collaboratorError.message : "Unable to add collaborator."
      );
    } finally {
      setIsUpdatingCollaborators(false);
    }
  }

  async function removeCollaborator(principalName: string) {
    if (!activeProject || !canManageActiveProject || isUpdatingCollaborators) {
      return;
    }

    setIsUpdatingCollaborators(true);
    setProjectSettingsMessage("");

    try {
      const response = await fetch(`/api/projects/${activeProject.id}/collaborators`, {
        body: JSON.stringify({ principalName }),
        headers: { "Content-Type": "application/json" },
        method: "DELETE"
      });
      const data = (await response.json()) as { project?: ProjectSummary; error?: string };
      if (!response.ok || !data.project) {
        throw new Error(data.error || `Failed to remove collaborator (${response.status})`);
      }

      applyProjectSummary(data.project);
      setProjectSettingsMessage("Collaborator removed.");
    } catch (collaboratorError) {
      setProjectSettingsMessage(
        collaboratorError instanceof Error ? collaboratorError.message : "Unable to remove collaborator."
      );
    } finally {
      setIsUpdatingCollaborators(false);
    }
  }

  function applyProjectSummary(project: ProjectSummary) {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
    setActiveProject((current) =>
      current && current.id === project.id ? { ...current, ...project, messages: current.messages } : current
    );
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

  async function loadAssets(projectId: string) {
    setIsLoadingAssets(true);
    setAssetsMessage("");

    try {
      const response = await fetch(`/api/projects/${projectId}/assets`, { cache: "no-store" });
      const data = (await response.json()) as { assets?: GameAssetSummary[]; error?: string };
      if (!response.ok || !Array.isArray(data.assets)) {
        throw new Error(data.error || `Failed to load assets (${response.status})`);
      }
      setAssets(data.assets);
    } catch (assetError) {
      setAssets([]);
      setAssetsMessage(assetError instanceof Error ? assetError.message : "Unable to load assets.");
    } finally {
      setIsLoadingAssets(false);
    }
  }

  async function openAssets() {
    if (!activeProject) {
      return;
    }

    setIsProjectMenuOpen(false);
    setIsAssetsOpen(true);
    await loadAssets(activeProject.id);
  }

  async function openMedia() {
    if (!activeProject) return;
    setIsAssetsOpen(false); setIsMediaOpen(true); setMediaPrompt("");
    const response = await fetch(`/api/projects/${activeProject.id}/media-jobs`, { cache: "no-store" });
    if (response.ok) setMediaJobs(((await response.json()) as { jobs: MediaJob[] }).jobs);
  }

  async function startMedia() {
    if (!activeProject || !mediaPrompt.trim()) return;
    const response = await fetch(`/api/projects/${activeProject.id}/media-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: mediaKind, prompt: mediaPrompt }) });
    const data = await response.json() as { job?: MediaJob; error?: string };
    if (!response.ok || !data.job) { setError(data.error || "Unable to start media generation."); return; }
    setMediaJobs((current) => [data.job!, ...current]); setMediaPrompt("");
  }

  async function updateMediaJob(jobId: string, action: "accept" | "discard" | "retry") {
    if (!activeProject) return;
    const response = await fetch(`/api/projects/${activeProject.id}/media-jobs/${jobId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await response.json() as { job?: MediaJob; error?: string };
    if (!response.ok || !data.job) { setError(data.error || "Unable to update media job."); return; }
    setMediaJobs((current) => current.map((job) => job.id === jobId ? data.job! : job));
    if (action === "accept") await loadAssets(activeProject.id);
  }

  async function uploadAsset(file: File) {
    if (!activeProject || isUploadingAsset) {
      return;
    }

    setIsUploadingAsset(true);
    setAssetsMessage("");
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${activeProject.id}/assets`, {
        body: formData,
        method: "POST"
      });
      const data = (await response.json()) as { asset?: GameAssetSummary; error?: string };
      if (!response.ok || !data.asset) {
        throw new Error(data.error || `Failed to upload asset (${response.status})`);
      }

      setAssets((current) => [data.asset as GameAssetSummary, ...current.filter((item) => item.path !== data.asset?.path)]);
      const relativePath = `./${data.asset.path}`;
      setInput((current) => {
        const trimmed = current.trimEnd();
        return trimmed ? `${trimmed}\nUse asset ${relativePath}` : `Use asset ${relativePath}`;
      });
      setAssetsMessage(`Uploaded ${data.asset.name}.`);
      setActiveProject((current) =>
        current && current.id === activeProject.id ? { ...current, updatedAt: new Date().toISOString() } : current
      );
    } catch (assetError) {
      const message = assetError instanceof Error ? assetError.message : "Unable to upload asset.";
      setAssetsMessage(message);
      setError(message);
    } finally {
      setIsUploadingAsset(false);
    }
  }

  async function deleteAsset(assetPath: string) {
    if (!activeProject || deletingAssetPath) {
      return;
    }

    setDeletingAssetPath(assetPath);
    setAssetsMessage("");

    try {
      const response = await fetch(
        `/api/projects/${activeProject.id}/assets?path=${encodeURIComponent(assetPath)}`,
        { method: "DELETE" }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to delete asset (${response.status})`);
      }
      setAssets((current) => current.filter((item) => item.path !== assetPath));
      setAssetsMessage("Asset deleted.");
      setActiveProject((current) =>
        current && current.id === activeProject.id ? { ...current, updatedAt: new Date().toISOString() } : current
      );
    } catch (assetError) {
      setAssetsMessage(assetError instanceof Error ? assetError.message : "Unable to delete asset.");
    } finally {
      setDeletingAssetPath("");
    }
  }

  async function openAccountSettings() {
    setIsProjectMenuOpen(false);
    setIsAccountSettingsOpen(true);
    setAccountApiKey("");
    setAccountSettingsMessage("");
    setAccountUsageBudget(null);
    setAccountAiBilling(null);
    setMonthlyBudgetInput("");
    setIsLoadingAccountSettings(true);

    try {
      const [keyResponse, usageResponse] = await Promise.all([
        fetch("/api/account/openai-key", { cache: "no-store" }),
        fetch("/api/account/usage-budget", { cache: "no-store" })
      ]);
      const data = (await keyResponse.json()) as {
        configured?: boolean;
        error?: string;
        aiBilling?: AccountAiBilling;
      };
      const usageData = (await usageResponse.json()) as AccountUsageBudget & { error?: string };
      if (!keyResponse.ok) {
        throw new Error(data.error || `Failed to load account settings (${keyResponse.status})`);
      }
      if (!usageResponse.ok) {
        throw new Error(usageData.error || `Failed to load usage settings (${usageResponse.status})`);
      }
      setIsAccountKeyConfigured(Boolean(data.configured));
      setAccountAiBilling(data.aiBilling || null);
      setAccountUsageBudget(usageData);
      setMonthlyBudgetInput(
        usageData.budget.monthlyBudgetUsd == null ? "" : String(usageData.budget.monthlyBudgetUsd)
      );
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to load account settings."
      );
    } finally {
      setIsLoadingAccountSettings(false);
    }
  }

  async function saveAiBillingMode(mode: AccountAiBilling["mode"]) {
    if (isSavingAccountSettings) {
      return;
    }
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/ai-billing", {
        body: JSON.stringify({ mode }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = (await response.json()) as AccountAiBilling & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to update billing mode (${response.status})`);
      }
      setAccountAiBilling(data);
      setAccountSettingsMessage(mode === "managed" ? "ATG-managed AI selected." : "Personal API key mode selected.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to update AI billing mode."
      );
    } finally {
      setIsSavingAccountSettings(false);
    }
  }

  async function saveMonthlyBudget() {
    if (isSavingAccountSettings) {
      return;
    }
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/usage-budget", {
        body: JSON.stringify({ monthlyBudgetUsd: monthlyBudgetInput }),
        headers: { "Content-Type": "application/json" },
        method: "PUT"
      });
      const data = (await response.json()) as AccountUsageBudget & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to save monthly budget (${response.status})`);
      }
      setAccountUsageBudget(data);
      setMonthlyBudgetInput(
        data.budget.monthlyBudgetUsd == null ? "" : String(data.budget.monthlyBudgetUsd)
      );
      setAccountSettingsMessage("Monthly AI budget saved.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to save the monthly budget."
      );
    } finally {
      setIsSavingAccountSettings(false);
    }
  }

  async function clearMonthlyBudget() {
    if (isSavingAccountSettings) {
      return;
    }
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/usage-budget", { method: "DELETE" });
      const data = (await response.json()) as AccountUsageBudget & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to remove monthly budget (${response.status})`);
      }
      setAccountUsageBudget(data);
      setMonthlyBudgetInput("");
      setAccountSettingsMessage("Monthly AI budget removed.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to remove the monthly budget."
      );
    } finally {
      setIsSavingAccountSettings(false);
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
      const data = (await response.json()) as { aiBilling?: AccountAiBilling; configured?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to save API key (${response.status})`);
      }
      setIsAccountKeyConfigured(true);
      if (data.aiBilling) {
        setAccountAiBilling(data.aiBilling);
      } else {
        setAccountAiBilling((current) => current
          ? { ...current, byok: { ...current.byok, configured: true } }
          : current);
      }
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

  async function testAccountApiKey() {
    if (isTestingAccountKey || isSavingAccountSettings) {
      return;
    }

    setIsTestingAccountKey(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/openai-key", {
        body: JSON.stringify({ apiKey: accountApiKey.trim() || undefined }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Validation failed (${response.status})`);
      }
      setAccountSettingsMessage(data.message || "OpenAI API key validated.");
    } catch (settingsError) {
      setAccountSettingsMessage(
        settingsError instanceof Error ? settingsError.message : "Unable to validate the API key."
      );
    } finally {
      setIsTestingAccountKey(false);
    }
  }

  async function clearAccountApiKey() {
    setIsSavingAccountSettings(true);
    setAccountSettingsMessage("");
    try {
      const response = await fetch("/api/account/openai-key", { method: "DELETE" });
      const data = (await response.json()) as { aiBilling?: AccountAiBilling; error?: string };
      if (!response.ok) {
        throw new Error(data.error || `Failed to remove API key (${response.status})`);
      }
      setIsAccountKeyConfigured(false);
      if (data.aiBilling) {
        setAccountAiBilling(data.aiBilling);
      } else {
        setAccountAiBilling((current) => current
          ? { ...current, byok: { ...current.byok, configured: false } }
          : current);
      }
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

  async function submitChat(promptValue?: string, options: ChatSubmitOptions = {}) {
    const prompt = (promptValue ?? input).trim();
    if (!prompt || isRunning || !activeProject) {
      return;
    }
    const effectiveChatMode = options.chatMode ?? chatMode;
    const effectiveEditingTarget: BuildTarget = options.editingTarget ?? editingTarget;
    const effectiveTargetName =
      effectiveEditingTarget === "both" ? "full plan" : effectiveEditingTarget === "tv" ? "TV" : "phone";

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
        effectiveChatMode === "plan"
          ? `Queued your ${effectiveTargetName} planning request.`
          : `Queued your ${effectiveTargetName} build request.`
      ],
      lastUpdateAt: now,
      startedAt: now
    });

    try {
      const response = await fetch("/api/chat/codex-sdk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatMode: effectiveChatMode,
          editingTarget: effectiveEditingTarget,
          projectId: activeProject.id,
          message: prompt,
          ...(options.conversionId ? { conversionId: options.conversionId } : {})
        })
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
      if (options.conversionId) {
        await refreshConversion(activeProject.id, options.conversionId);
      }
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

  async function refreshConversion(projectId: string, conversionId: string) {
    const response = await fetch(`/api/projects/${projectId}/conversions/${conversionId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { conversion?: { status: ConversionStatus; candidate?: { candidateRevision?: string }; validation?: ConversionValidation | null } };
    if (data.conversion) {
      setConversionStatus(data.conversion.status);
      setConversionRevision(data.conversion.candidate?.candidateRevision || null);
      setConversionValidation(data.conversion.validation || null);
    }
  }

  async function updateConversion(action: "accept" | "cancel" | "retry" | "validate") {
    if (!activeProject || !activeConversionId) return;
    const response = await fetch(`/api/projects/${activeProject.id}/conversions/${activeConversionId}`, {
      body: JSON.stringify({ action, acknowledgeWarnings: conversionWarningsAcknowledged }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const data = (await response.json()) as { conversion?: { status: ConversionStatus; candidate?: { candidateRevision?: string }; validation?: ConversionValidation | null }; error?: string };
    if (!response.ok || !data.conversion) {
      setError(data.error || "Unable to update conversion.");
      return;
    }
    setConversionStatus(data.conversion.status);
    setConversionRevision(data.conversion.candidate?.candidateRevision || null);
    setConversionValidation(data.conversion.validation || null);
    if (action === "accept") await refreshOpenProject(activeProject.id);
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
          isUploadingAsset={isUploadingAsset}
          onInputChange={setInput}
          onOpenAccountSettings={openAccountSettings}
          onOpenAssets={openAssets}
          onOpenInstructions={openInstructions}
          onOpenProjectSettings={openProjectSettings}
          onOpenUpgradeGame={openUpgradeGame}
          onOpenRuntimeUpgrade={openRuntimeUpgrade}
          onModeChange={setChatMode}
          onQuickAnswer={(answer, options) => {
            if (options?.chatMode) {
              setChatMode(options.chatMode);
            }
            if (options?.editingTarget === "tv" || options?.editingTarget === "phone") {
              setEditingTarget(options.editingTarget);
            }
            void submitChat(answer, options);
          }}
          onReturnToProjects={returnToProjects}
          onUploadAsset={uploadAsset}
          onTargetChange={setEditingTarget}
          onToggleProjectMenu={() => setIsProjectMenuOpen((current) => !current)}
          projectId={activeProject.id}
          isProjectMenuOpen={isProjectMenuOpen}
          projectName={activeProject.name}
          projectRevision={activeProject.updatedAt}
          canUpgradeGame={upgradeGameAvailability.available}
          canUpgradeRuntime={activeProject.engine?.type === "pixi" && !isRunning}
          activeRuntimeUpgrade={runtimeUpgrade}
          onUpdateRuntimeUpgrade={updateRuntimeUpgrade}
          onSubmit={handleSubmit}
          runFeedback={runFeedback}
          activeConversionId={activeConversionId}
          conversionStatus={conversionStatus}
          conversionRevision={conversionRevision}
          conversionValidation={conversionValidation}
          conversionWarningsAcknowledged={conversionWarningsAcknowledged}
          onConversionWarningsAcknowledged={setConversionWarningsAcknowledged}
          onUpdateConversion={updateConversion}
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
          isTesting={isTestingAccountKey}
          message={accountSettingsMessage}
          monthlyBudgetInput={monthlyBudgetInput}
          aiBilling={accountAiBilling}
          onApiKeyChange={setAccountApiKey}
          onBillingModeChange={saveAiBillingMode}
          onBudgetChange={setMonthlyBudgetInput}
          onBudgetClear={clearMonthlyBudget}
          onBudgetSave={saveMonthlyBudget}
          onClear={clearAccountApiKey}
          onClose={() => {
            if (!isSavingAccountSettings && !isTestingAccountKey) {
              setIsAccountSettingsOpen(false);
              setAccountApiKey("");
              setAccountSettingsMessage("");
              setAccountUsageBudget(null);
              setAccountAiBilling(null);
              setMonthlyBudgetInput("");
            }
          }}
          onSave={saveAccountApiKey}
          onTest={testAccountApiKey}
          usageBudget={accountUsageBudget}
        />
      ) : null}

      {isProjectSettingsOpen && activeProject ? (
        <ProjectSettingsModal
          canManage={canManageActiveProject}
          canSave={canSaveProjectSettings}
          collaboratorInput={collaboratorInput}
          collaborators={activeProject.collaborators}
          isSaving={isSavingProjectSettings}
          isUpdatingCollaborators={isUpdatingCollaborators}
          message={projectSettingsMessage}
          name={projectSettingsName}
          onAddCollaborator={addCollaborator}
          onClose={() => {
            if (!isSavingProjectSettings) {
              setIsProjectSettingsOpen(false);
              setProjectSettingsMessage("");
              setProjectSettingsName("");
              setProjectSettingsVisibility("private");
              setCollaboratorInput("");
            }
          }}
          onCollaboratorInputChange={setCollaboratorInput}
          onNameChange={setProjectSettingsName}
          onRemoveCollaborator={removeCollaborator}
          onSave={saveProjectSettings}
          onVisibilityChange={setProjectSettingsVisibility}
          visibility={projectSettingsVisibility}
        />
      ) : null}

      {isUpgradeGameOpen && activeProject ? (
        <UpgradeGameModal
          isRunning={isRunning}
          onCancel={() => setIsUpgradeGameOpen(false)}
          onStart={startUpgradeGame}
          reason={upgradeGameAvailability.reason}
        />
      ) : null}
      {isRuntimeUpgradeOpen && activeProject ? <RuntimeUpgradeModal options={runtimeUpgradeOptions} upgrade={runtimeUpgrade} acknowledged={runtimeUpgradeWarningsAcknowledged} onAcknowledge={setRuntimeUpgradeWarningsAcknowledged} onCancel={() => setIsRuntimeUpgradeOpen(false)} onStart={startRuntimeUpgrade} onUpdate={updateRuntimeUpgrade} /> : null}

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

      {isAssetsOpen && activeProject ? (
        <AssetsModal
          assets={assets}
          deletingAssetPath={deletingAssetPath}
          isLoading={isLoadingAssets}
          message={assetsMessage}
          onClose={() => setIsAssetsOpen(false)}
          onDelete={deleteAsset}
          onGenerate={openMedia}
          projectId={activeProject.id}
        />
      ) : null}
      {isMediaOpen && activeProject ? <MediaGenerationModal jobs={mediaJobs} kind={mediaKind} onKindChange={setMediaKind} onPromptChange={setMediaPrompt} prompt={mediaPrompt} onStart={startMedia} onUpdate={updateMediaJob} onClose={() => setIsMediaOpen(false)} /> : null}
    </main>
  );
}

function ProjectSettingsModal({
  canManage,
  canSave,
  collaboratorInput,
  collaborators,
  isSaving,
  isUpdatingCollaborators,
  message,
  name,
  onAddCollaborator,
  onClose,
  onCollaboratorInputChange,
  onNameChange,
  onRemoveCollaborator,
  onSave,
  onVisibilityChange,
  visibility
}: {
  canManage: boolean;
  canSave: boolean;
  collaboratorInput: string;
  collaborators: ProjectCollaborator[];
  isSaving: boolean;
  isUpdatingCollaborators: boolean;
  message: string;
  name: string;
  onAddCollaborator: () => void;
  onClose: () => void;
  onCollaboratorInputChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onRemoveCollaborator: (principalName: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onVisibilityChange: (value: ProjectSummary["visibility"]) => void;
  visibility: ProjectSummary["visibility"];
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
          {canManage ? (
            <>
              <fieldset className={styles.visibilityField} disabled={isSaving}>
                <legend>Project visibility</legend>
                <div className={styles.visibilityToggle}>
                  <button
                    aria-pressed={visibility === "private"}
                    className={visibility === "private" ? styles.activeVisibility : undefined}
                    onClick={() => onVisibilityChange("private")}
                    type="button"
                  >
                    <Lock aria-hidden="true" />
                    <span>Private</span>
                  </button>
                  <button
                    aria-pressed={visibility === "public"}
                    className={visibility === "public" ? styles.activeVisibility : undefined}
                    onClick={() => onVisibilityChange("public")}
                    type="button"
                  >
                    <Globe2 aria-hidden="true" />
                    <span>Public</span>
                  </button>
                </div>
              </fieldset>
              <section className={styles.collaboratorsSection} aria-label="Project collaborators">
                <div>
                  <h3>Collaborators</h3>
                  <p>Invite editors by email or login.</p>
                </div>
                <div className={styles.collaboratorForm}>
                  <div className={styles.projectNameField}>
                    <UserPlus aria-hidden="true" />
                    <input
                      autoComplete="off"
                      disabled={isUpdatingCollaborators}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onAddCollaborator();
                        }
                      }}
                      onChange={(event) => onCollaboratorInputChange(event.target.value)}
                      placeholder="person@example.com"
                      type="text"
                      value={collaboratorInput}
                    />
                  </div>
                  <button
                    disabled={!collaboratorInput.trim() || isUpdatingCollaborators}
                    onClick={onAddCollaborator}
                    type="button"
                  >
                    {isUpdatingCollaborators ? "Updating" : "Invite"}
                  </button>
                </div>
                {collaborators.length > 0 ? (
                  <ul className={styles.collaboratorList}>
                    {collaborators.map((collaborator) => (
                      <li key={collaborator.principalName}>
                        <span>{collaborator.principalName}</span>
                        <button
                          disabled={isUpdatingCollaborators}
                          onClick={() => onRemoveCollaborator(collaborator.principalName)}
                          type="button"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.emptyCollaborators}>No collaborators yet.</p>
                )}
              </section>
            </>
          ) : null}
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

function UpgradeGameModal({
  isRunning,
  onCancel,
  onStart,
  reason
}: {
  isRunning: boolean;
  onCancel: () => void;
  onStart: () => void;
  reason: string;
}) {
  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section aria-labelledby="upgrade-game-title" aria-modal="true" className={styles.modal} role="dialog">
        <div className={styles.modalHeader}>
          <h2 id="upgrade-game-title">Upgrade Game</h2>
          <button aria-label="Close upgrade game dialog" onClick={onCancel} type="button">
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.modalBody}>
          <p>
            ATG will prepare a best-effort engine conversion without asking a questionnaire. Phone controls
            stay DOM-based, and your current published legacy game remains unchanged until you explicitly accept
            a conversion candidate.
          </p>
          {reason ? <p className={styles.errorText}>{reason}</p> : null}
        </div>
        <div className={styles.modalActions}>
          <button onClick={onCancel} type="button">Cancel</button>
          <button disabled={isRunning || Boolean(reason)} onClick={onStart} type="button">
            Start Upgrade
          </button>
        </div>
      </section>
    </div>
  );
}

function RuntimeUpgradeModal({ options, upgrade, acknowledged, onAcknowledge, onCancel, onStart, onUpdate }: { options: RuntimeUpgradeOption[]; upgrade: RuntimeUpgradeRecord | null; acknowledged: boolean; onAcknowledge: (value: boolean) => void; onCancel: () => void; onStart: (version: string) => void; onUpdate: (action: "accept" | "cancel" | "validate") => void }) {
  const [selected, setSelected] = useState(options[0]?.runtimeVersion || "");
  const candidate = upgrade?.candidate;
  const validation = upgrade?.validation;
  const requiresAcknowledgment = Boolean(candidate?.warnings?.length || validation?.warnings?.length);
  const canAccept = Boolean(validation && !validation.blockingErrors.length && (!requiresAcknowledgment || acknowledged));
  return <div className={styles.modalBackdrop} role="presentation"><section aria-modal="true" className={styles.modal} role="dialog"><div className={styles.modalHeader}><h2>Runtime Upgrade</h2><button aria-label="Close runtime upgrade dialog" onClick={onCancel} type="button"><X aria-hidden="true" /></button></div><div className={styles.modalBody}><p>Preview a newer registered runtime in isolation. The pinned project runtime changes only when you accept.</p>{upgrade ? <><p><strong>Previewing {candidate?.runtimeVersion}</strong></p><button onClick={() => onUpdate("validate")} type="button">Validate candidate</button>{validation ? <div aria-live="polite"><p><strong>{validation.blockingErrors.length ? "Validation found blocking issues" : "Validation completed"}</strong></p>{validation.checks.map((check) => <p key={check.code}>{check.passed ? "✓" : "✕"} {check.message}</p>)}{validation.warnings.map((warning) => <p key={warning}>Warning: {warning}</p>)}</div> : <p>Run validation before accepting this runtime.</p>}{candidate?.warnings?.map((warning) => <p key={warning}>{warning}</p>)}{requiresAcknowledgment ? <label><input checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} type="checkbox" /> I acknowledge the warnings</label> : null}</> : <select aria-label="Runtime version" onChange={(event) => setSelected(event.target.value)} value={selected}>{options.map((option) => <option disabled={!option.compatible} key={option.runtimeVersion} value={option.runtimeVersion}>{option.runtimeVersion}{option.compatible ? "" : " (incompatible)"}</option>)}</select>}</div><div className={styles.modalActions}><button onClick={onCancel} type="button">Close</button>{upgrade ? <><button onClick={() => onUpdate("cancel")} type="button">Cancel Preview</button><button disabled={!canAccept} onClick={() => onUpdate("accept")} type="button">Accept Runtime</button></> : <button disabled={!selected} onClick={() => onStart(selected)} type="button">Start Preview</button>}</div></section></div>;
}

function AccountSettingsModal({
  aiBilling,
  apiKey,
  configured,
  isLoading,
  isSaving,
  isTesting,
  message,
  monthlyBudgetInput,
  onApiKeyChange,
  onBillingModeChange,
  onBudgetChange,
  onBudgetClear,
  onBudgetSave,
  onClear,
  onClose,
  onSave,
  onTest,
  usageBudget
}: {
  aiBilling: AccountAiBilling | null;
  apiKey: string;
  configured: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  message: string;
  monthlyBudgetInput: string;
  onApiKeyChange: (value: string) => void;
  onBillingModeChange: (mode: AccountAiBilling["mode"]) => void;
  onBudgetChange: (value: string) => void;
  onBudgetClear: () => void;
  onBudgetSave: () => void;
  onClear: () => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
  usageBudget: AccountUsageBudget | null;
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeAccountTab, setActiveAccountTab] = useState<"api-key" | "usage">("api-key");
  const isBusy = isLoading || isSaving || isTesting;
  const budgetConfigured = usageBudget?.budget.monthlyBudgetUsd != null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (activeAccountTab === "api-key") {
      onSave(event);
      return;
    }
    event.preventDefault();
    if (!isBusy && monthlyBudgetInput.trim()) {
      onBudgetSave();
    }
  }

  return (
    <div className={styles.modalOverlay} role="presentation">
      <form className={`${styles.modal} ${styles.accountSettingsModal}`} onSubmit={handleSubmit}>
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
        <div className={styles.accountSettingsTabs} role="tablist" aria-label="Account settings sections">
          <button
            aria-selected={activeAccountTab === "api-key"}
            className={activeAccountTab === "api-key" ? styles.activeAccountTab : undefined}
            onClick={() => setActiveAccountTab("api-key")}
            role="tab"
            type="button"
          >
            <KeyRound aria-hidden="true" />
            API Key
          </button>
          <button
            aria-selected={activeAccountTab === "usage"}
            className={activeAccountTab === "usage" ? styles.activeAccountTab : undefined}
            onClick={() => setActiveAccountTab("usage")}
            role="tab"
            type="button"
          >
            <BadgeDollarSign aria-hidden="true" />
            Usage
          </button>
        </div>
        <div className={`${styles.modalBody} ${styles.accountSettingsBody}`}>
          {activeAccountTab === "api-key" ? (
            <section className={styles.accountTabPanel} role="tabpanel">
              <p>
                Choose who pays for dashboard AI edits. ATG-managed AI is recommended for the closed beta;
                BYOK always remains available when you configure a personal key.
              </p>
              <fieldset className={styles.billingModeField} disabled={isBusy || !aiBilling}>
                <legend>AI billing mode</legend>
                <div className={styles.billingModeGrid}>
                  <button
                    aria-pressed={aiBilling?.mode === "managed"}
                    className={aiBilling?.mode === "managed" ? styles.activeBillingMode : undefined}
                    disabled={!aiBilling?.managed.eligible}
                    onClick={() => onBillingModeChange("managed")}
                    type="button"
                  >
                    <span>ATG-managed AI</span>
                    <small>
                      Recommended beta credit. {aiBilling?.managed.enabled && aiBilling.managed.keyConfigured
                        ? `${formatCurrency(aiBilling.managed.remainingCreditUsd)} remaining this month.`
                        : "Temporarily unavailable until managed AI is configured."}
                    </small>
                  </button>
                  <button
                    aria-pressed={aiBilling?.mode === "byok"}
                    className={aiBilling?.mode === "byok" ? styles.activeBillingMode : undefined}
                    disabled={!configured}
                    onClick={() => onBillingModeChange("byok")}
                    type="button"
                  >
                    <span>Use my OpenAI API key</span>
                    <small>
                      You pay OpenAI directly. {configured ? "Personal key configured." : "Save a personal key to enable BYOK."}
                    </small>
                  </button>
                </div>
              </fieldset>
              <p>
                Add your OpenAI API key for BYOK mode. The key is encrypted server-side and is never shown again.
              </p>
              <button
                className={styles.inlineLinkButton}
                onClick={() => setIsGuideOpen((current) => !current)}
                type="button"
              >
                Learn how to create an OpenAI API key
              </button>
              {isGuideOpen ? (
                <section className={styles.byokGuide} aria-label="OpenAI API key guide">
                  <ol>
                    <li>
                      Create or choose a dedicated OpenAI project for Azure Tides Gaming in the{" "}
                      <a href="https://platform.openai.com/settings/organization/projects" rel="noreferrer" target="_blank">
                        OpenAI project settings
                      </a>
                      .
                    </li>
                    <li>
                      Confirm billing and usage in the{" "}
                      <a href="https://platform.openai.com/usage" rel="noreferrer" target="_blank">
                        OpenAI Usage Dashboard
                      </a>
                      . Project budgets are alerts for tracking, not hard spending limits.
                    </li>
                    <li>
                      Create a project API key from the{" "}
                      <a href="https://platform.openai.com/api-keys" rel="noreferrer" target="_blank">
                        OpenAI API keys page
                      </a>
                      . Use a normal project key for ATG, not an organization Admin API key.
                    </li>
                    <li>
                      Restrict the key where practical, then paste it here. ATG encrypts it server-side,
                      never displays it again, and uses it only for your AI editing jobs.
                    </li>
                    <li>
                      Save and test the key. If it is invalid, revoked, unauthorized, or rate-limited,
                      ATG shows a redacted validation message.
                    </li>
                  </ol>
                  <p>
                    Rotate a key by creating a replacement in OpenAI, saving it here, testing it, and revoking
                    the old key in OpenAI. Remove it here any time to return to ATG-managed AI.
                  </p>
                </section>
              ) : null}
              <label htmlFor="openai-api-key">OpenAI API key</label>
              <input
                autoComplete="off"
                disabled={isBusy}
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
                    : "No personal API key configured. Use ATG-managed AI or save a key to enable BYOK."}
              </p>
            </section>
          ) : (
            <section className={styles.accountTabPanel} role="tabpanel" aria-label="API usage and budget">
            {isLoading || !usageBudget ? (
              <p className={styles.settingsStatus}>Loading usage totals...</p>
            ) : (
              <>
                <div className={styles.usageSummaryGrid}>
                  <div>
                    <span>ATG credit</span>
                    <strong>{formatCurrency(usageBudget.managedCredit.monthlyCreditUsd)}</strong>
                  </div>
                  <div>
                    <span>ATG remaining</span>
                    <strong>{formatCurrency(usageBudget.managedCredit.remainingCreditUsd)}</strong>
                  </div>
                  <div>
                    <span>ATG reserved</span>
                    <strong>{formatCurrency(usageBudget.managedCredit.reservedUsd)}</strong>
                  </div>
                  <div>
                    <span>ATG reset</span>
                    <strong>{formatDate(usageBudget.managedCredit.period.resetAt)}</strong>
                  </div>
                  <div>
                    <span>Estimated spend</span>
                    <strong>{formatCurrency(usageBudget.totals.estimatedSpendUsd)}</strong>
                  </div>
                  <div>
                    <span>Monthly budget</span>
                    <strong>
                      {usageBudget.budget.monthlyBudgetUsd == null
                        ? "Not set"
                        : formatCurrency(usageBudget.budget.monthlyBudgetUsd)}
                    </strong>
                  </div>
                  <div>
                    <span>Remaining</span>
                    <strong>
                      {usageBudget.budget.remainingBudgetUsd == null
                        ? "Not set"
                        : formatCurrency(usageBudget.budget.remainingBudgetUsd)}
                    </strong>
                  </div>
                  <div>
                    <span>Period reset</span>
                    <strong>{formatDate(usageBudget.period.resetAt)}</strong>
                  </div>
                </div>
                {budgetConfigured && usageBudget.budget.consumedPercent != null ? (
                  <div className={styles.budgetMeter} aria-label="Budget consumed">
                    <span style={{ width: `${Math.min(100, usageBudget.budget.consumedPercent)}%` }} />
                  </div>
                ) : null}
                <dl className={styles.tokenTotals}>
                  <div>
                    <dt>Input</dt>
                    <dd>{formatInteger(usageBudget.totals.inputTokens)}</dd>
                  </div>
                  <div>
                    <dt>Cached input</dt>
                    <dd>{formatInteger(usageBudget.totals.cachedInputTokens)}</dd>
                  </div>
                  <div>
                    <dt>Reasoning</dt>
                    <dd>{formatInteger(usageBudget.totals.reasoningOutputTokens)}</dd>
                  </div>
                  <div>
                    <dt>Output</dt>
                    <dd>{formatInteger(usageBudget.totals.outputTokens)}</dd>
                  </div>
                </dl>
                <div className={styles.budgetControls}>
                  <label htmlFor="monthly-ai-budget">Monthly ATG budget</label>
                  <div>
                    <input
                      disabled={isBusy}
                      id="monthly-ai-budget"
                      min="0"
                      onChange={(event) => onBudgetChange(event.target.value)}
                      placeholder="Optional USD budget"
                      step="0.01"
                      type="number"
                      value={monthlyBudgetInput}
                    />
                    <button
                      className={styles.secondaryInlineButton}
                      disabled={isBusy || !monthlyBudgetInput.trim()}
                      onClick={onBudgetSave}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      className={styles.secondaryInlineButton}
                      disabled={isBusy || !budgetConfigured}
                      onClick={onBudgetClear}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <p className={styles.settingsStatus}>
                  ATG-local totals cover AI edits made through ATG during {usageBudget.period.key}.
                  Values are estimates and may not match your complete OpenAI account spend.
                </p>
                {usageBudget.totals.unpricedRecords > 0 ? (
                  <p className={styles.settingsStatus}>
                    {usageBudget.totals.unpricedRecords} usage record{usageBudget.totals.unpricedRecords === 1 ? "" : "s"} use
                    unknown model pricing, so token totals are shown without an invented cost.
                  </p>
                ) : null}
                <a className={styles.settingsLink} href="https://platform.openai.com/usage" rel="noreferrer" target="_blank">
                  Open authoritative OpenAI usage
                </a>
                <p className={styles.usageMeta}>
                  {usageBudget.lastUpdatedAt ? `Last updated ${formatDateTime(usageBudget.lastUpdatedAt)}.` : "No ATG usage recorded yet."}
                  {" "}Pricing version {usageBudget.pricing.version}.
                </p>
              </>
            )}
            </section>
          )}
          {message ? <p className={styles.settingsMessage}>{message}</p> : null}
        </div>
        <div className={styles.modalFooter}>
          {activeAccountTab === "api-key" && configured ? (
            <button
              className={styles.dangerButton}
              disabled={isBusy}
              onClick={onClear}
              type="button"
            >
              Remove Key
            </button>
          ) : null}
          <button className={styles.secondaryButton} disabled={isBusy} onClick={onClose} type="button">
            Close
          </button>
          {activeAccountTab === "api-key" ? (
            <>
              <button
                className={styles.secondaryButton}
                disabled={isBusy || (!apiKey.trim() && !configured)}
                onClick={onTest}
                type="button"
              >
                {isTesting ? "Testing..." : "Test Key"}
              </button>
              <button disabled={!apiKey.trim() || isBusy} type="submit">
                {isSaving ? "Saving..." : configured ? "Replace Key" : "Save Key"}
              </button>
            </>
          ) : null}
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
  const [isMobileGuideExpanded, setIsMobileGuideExpanded] = useState(false);
  const hasProjects = projects.length > 0;

  return (
    <section className={`${styles.dashboard} ${hasProjects ? styles.dashboardHasProjects : ""}`}>
      <section className={styles.dashboardGuide} aria-labelledby="dashboard-guide-title">
        <div className={styles.dashboardGuideIntro}>
          <h2 id="dashboard-guide-title">Start With a Game Idea</h2>
          {hasProjects ? (
            <button
              aria-controls="dashboard-guide-steps"
              aria-expanded={isMobileGuideExpanded}
              className={styles.dashboardGuideToggle}
              onClick={() => setIsMobileGuideExpanded((current) => !current)}
              type="button"
            >
              {isMobileGuideExpanded ? "Hide" : "Show"}
            </button>
          ) : null}
          <p>
            Create a game, use Plan mode to shape the rules, then switch to Build mode to update the TV
            display and phone controller.
          </p>
        </div>
        <ol
          aria-label="Game creation steps"
          className={isMobileGuideExpanded || !hasProjects ? styles.dashboardGuideStepsExpanded : undefined}
          id="dashboard-guide-steps"
        >
          <li>Create or open a game.</li>
          <li>Plan rounds, scoring, and player actions.</li>
          <li>Build the TV screen and phone controls.</li>
          <li>Open TV and Phone links when you are ready to play.</li>
        </ol>
      </section>
      <section className={styles.projectList} aria-label="Projects">
        {isLoadingProjects ? <p className={styles.emptyText}>Loading projects...</p> : null}
        {!isLoadingProjects && projects.length === 0 ? (
          <div className={styles.emptyText}>
            <p>No games yet. Create one to open a Codex game-building session.</p>
            <p className={styles.emptyHint}>
              Start with a name like Trivia Night, Guess the Song, or Team Challenge. Codex can help you
              plan the rules before it builds anything.
            </p>
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
              <span className={styles.visibilityBadge}>
                {project.visibility === "public" ? (
                  <Globe2 aria-hidden="true" />
                ) : (
                  <Lock aria-hidden="true" />
                )}
                {project.accessRole === "collaborator"
                  ? "Shared"
                  : project.visibility === "public"
                    ? "Public"
                    : "Private"}
              </span>
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
            {project.accessRole === "owner" ? (
              <button
                aria-label={`Delete ${project.name}`}
                className={styles.trashButton}
                onClick={() => onDeleteProject(project)}
                title="Delete project"
                type="button"
              >
                <Trash2 aria-hidden="true" />
              </button>
            ) : null}
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
            <p className={styles.fieldHelp}>
              Name the kind of game you want to make. You can change this later.
            </p>
            <div className={styles.exampleNames} aria-label="Example game names">
              <span>Trivia Night</span>
              <span>Guess the Song</span>
              <span>Team Challenge</span>
            </div>
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
          <h2>Game Instructions</h2>
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
          <p className={styles.instructionsHelp}>
            This is the player-facing rule sheet. Keep it updated with the goal, setup, controls, and scoring.
          </p>
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

function AssetsModal({
  assets,
  deletingAssetPath,
  isLoading,
  message,
  onClose,
  onDelete,
  onGenerate,
  projectId
}: {
  assets: GameAssetSummary[];
  deletingAssetPath: string;
  isLoading: boolean;
  message: string;
  onClose: () => void;
  onDelete: (assetPath: string) => void;
  onGenerate: () => void;
  projectId: string;
}) {
  return (
    <div className={styles.modalOverlay} role="presentation">
      <section aria-label="Game assets" className={`${styles.modal} ${styles.assetsModal}`}>
        <div className={styles.modalHeader}>
          <div>
            <h2>Game Assets</h2>
            <p>Uploaded images and audio available to this game.</p>
          </div>
          <button onClick={onGenerate} type="button">Generate Media</button>
          <button
            aria-label="Close assets dialog"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className={styles.assetsBody}>
          {isLoading ? <p className={styles.emptyInstructions}>Loading assets...</p> : null}
          {!isLoading && assets.length === 0 ? (
            <p className={styles.emptyInstructions}>No assets uploaded yet.</p>
          ) : null}
          {!isLoading && assets.length > 0 ? (
            <ul className={styles.assetList}>
              {assets.map((asset) => {
                const url = `/api/projects/${projectId}/game-assets/${asset.path}`;
                const relativePath = `./${asset.path}`;
                return (
                  <li className={styles.assetItem} key={asset.path}>
                    <div className={styles.assetPreview}>
                      {asset.contentType.startsWith("image/") ? (
                        <img alt="" src={url} />
                      ) : asset.contentType.startsWith("audio/") ? (
                        <audio controls src={url} />
                      ) : asset.contentType.startsWith("video/") ? (
                        <video controls preload="metadata" src={url} />
                      ) : asset.contentType.startsWith("font/") ? (
                        <span aria-label="Font asset preview">Aa</span>
                      ) : (
                        <File aria-hidden="true" />
                      )}
                    </div>
                    <div className={styles.assetDetails}>
                      <strong>{asset.name}</strong>
                      <code>{relativePath}</code>
                      <span>
                        {asset.contentType || "application/octet-stream"} - {formatAssetSize(asset.size)}
                      </span>
                    </div>
                    <div className={styles.assetActions}>
                      <button
                        aria-label={`Copy path for ${asset.name}`}
                        onClick={() => void navigator.clipboard?.writeText(relativePath)}
                        type="button"
                      >
                        <Copy aria-hidden="true" />
                      </button>
                      <button
                        aria-label={`Delete ${asset.name}`}
                        disabled={deletingAssetPath === asset.path}
                        onClick={() => onDelete(asset.path)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {message ? <p className={styles.settingsMessage}>{message}</p> : null}
        </div>
      </section>
    </div>
  );
}

function MediaGenerationModal({ jobs, kind, onKindChange, onPromptChange, prompt, onStart, onUpdate, onClose }: { jobs: MediaJob[]; kind: string; onKindChange: (value: string) => void; onPromptChange: (value: string) => void; prompt: string; onStart: () => void; onUpdate: (id: string, action: "accept" | "discard" | "retry") => void; onClose: () => void }) {
  return <div className={styles.modalOverlay} role="presentation"><section aria-labelledby="media-generation-title" aria-modal="true" className={styles.modal} role="dialog"><div className={styles.modalHeader}><h2 id="media-generation-title">Generate Media</h2><button aria-label="Close media generation dialog" onClick={onClose} type="button"><X aria-hidden="true" /></button></div><div className={styles.modalBody}><label>Type<select aria-label="Media type" onChange={(event) => onKindChange(event.target.value)} value={kind}><option value="character">Character</option><option value="object">Object</option><option value="sprite-variation">Sprite variation</option><option value="animation-sheet">Animation sheet</option><option value="image">Image</option><option value="sound-effect">Sound effect</option></select></label><label>Prompt<textarea aria-label="Media prompt" onChange={(event) => onPromptChange(event.target.value)} value={prompt} /></label><button disabled={!prompt.trim()} onClick={onStart} type="button">Start Preview</button><div aria-live="polite">{jobs.map((job) => <article key={job.id}><strong>{job.visualKind || job.kind}</strong><span>{job.status}</span>{job.status === "completed" ? <><button onClick={() => onUpdate(job.id, "accept")} type="button">Accept</button><button onClick={() => onUpdate(job.id, "discard")} type="button">Discard</button></> : null}{["failed", "discarded"].includes(job.status) ? <button onClick={() => onUpdate(job.id, "retry")} type="button">Retry</button> : null}</article>)}</div></div></section></div>;
}

function ProjectChat({
  activeRuntimeUpgrade,
  canUpgradeRuntime,
  canUpgradeGame,
  canSubmit,
  chatMode,
  editingTarget,
  input,
  isUploadingAsset,
  isRunning,
  isProjectMenuOpen,
  messages,
  onInputChange,
  onModeChange,
  onOpenAccountSettings,
  onOpenAssets,
  onOpenInstructions,
  onOpenProjectSettings,
  onOpenUpgradeGame,
  onOpenRuntimeUpgrade,
  onQuickAnswer,
  onReturnToProjects,
  onTargetChange,
  onToggleProjectMenu,
  onUploadAsset,
  onSubmit,
  projectId,
  projectName,
  projectRevision,
  runFeedback,
  activeConversionId,
  conversionStatus,
  conversionRevision,
  conversionValidation,
  conversionWarningsAcknowledged,
  onConversionWarningsAcknowledged,
  onUpdateConversion,
  onUpdateRuntimeUpgrade
}: {
  activeRuntimeUpgrade: RuntimeUpgradeRecord | null;
  canUpgradeRuntime: boolean;
  canUpgradeGame: boolean;
  canSubmit: boolean;
  chatMode: ChatMode;
  editingTarget: EditingTarget;
  input: string;
  isUploadingAsset: boolean;
  isRunning: boolean;
  isProjectMenuOpen: boolean;
  messages: ChatMessage[];
  onInputChange: (value: string) => void;
  onModeChange: (mode: ChatMode) => void;
  onOpenAccountSettings: () => void;
  onOpenAssets: () => void;
  onOpenInstructions: () => void;
  onOpenProjectSettings: () => void;
  onOpenUpgradeGame: () => void;
  onOpenRuntimeUpgrade: () => void;
  onQuickAnswer: (answer: string, options?: ChatSubmitOptions) => void;
  onReturnToProjects: () => void;
  onTargetChange: (target: EditingTarget) => void;
  onToggleProjectMenu: () => void;
  onUploadAsset: (file: File) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  projectId: string;
  projectName: string;
  projectRevision: string;
  runFeedback: ChatRunFeedback;
  activeConversionId: string | null;
  conversionStatus: ConversionStatus | null;
  conversionRevision: string | null;
  conversionValidation: ConversionValidation | null;
  conversionWarningsAcknowledged: boolean;
  onConversionWarningsAcknowledged: (acknowledged: boolean) => void;
  onUpdateConversion: (action: "accept" | "cancel" | "retry" | "validate") => void;
  onUpdateRuntimeUpgrade: (action: "accept" | "cancel" | "validate") => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const [editorSplitRatio, setEditorSplitRatio] = useState<number | null>(null);
  const [hiddenEditorPanel, setHiddenEditorPanel] = useState<HiddenEditorPanel>(null);
  const [isDesktopSplit, setIsDesktopSplit] = useState(false);
  const [isResizingEditor, setIsResizingEditor] = useState(false);
  const showFeedback = runFeedback.state !== "idle";
  const publishedPreviewPath = `${buildGameAssetUrl(projectId, editingTarget, projectRevision)}&atgEditorPreview=1`;
  const previewPath = activeRuntimeUpgrade?.status === "preview"
    ? `${publishedPreviewPath}&runtimeUpgrade=${encodeURIComponent(activeRuntimeUpgrade.id)}&revision=${encodeURIComponent(activeRuntimeUpgrade.previewRevision)}`
    : activeConversionId && conversionStatus === "review" && conversionRevision
    ? `${publishedPreviewPath}&conversion=${encodeURIComponent(activeConversionId)}&revision=${encodeURIComponent(conversionRevision)}`
    : publishedPreviewPath;
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
  const buildHandoffAnswer = quickAnswers.find((answer) => Boolean(getPlanningQuickAction(answer.text).options?.chatMode));
  const planningAnswers = buildHandoffAnswer ? [buildHandoffAnswer] : quickAnswers;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, planningAnswers.length, quickAnswersKey]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(EDITOR_SPLIT_DESKTOP_QUERY);
    const updateDesktopSplit = () => setIsDesktopSplit(mediaQuery.matches);
    updateDesktopSplit();
    mediaQuery.addEventListener("change", updateDesktopSplit);

    const storedRatio = Number.parseFloat(window.localStorage.getItem(EDITOR_SPLIT_STORAGE_KEY) ?? "");
    if (Number.isFinite(storedRatio)) {
      setEditorSplitRatio(Math.min(0.82, Math.max(0.34, storedRatio)));
    }

    const storedHiddenPanel = window.localStorage.getItem(EDITOR_HIDDEN_PANEL_STORAGE_KEY);
    if (storedHiddenPanel === "editor" || storedHiddenPanel === "preview") {
      setHiddenEditorPanel(storedHiddenPanel);
    }

    return () => mediaQuery.removeEventListener("change", updateDesktopSplit);
  }, []);

  useEffect(() => {
    if (editorSplitRatio === null) return;
    window.localStorage.setItem(EDITOR_SPLIT_STORAGE_KEY, editorSplitRatio.toFixed(4));
  }, [editorSplitRatio]);

  useEffect(() => {
    if (hiddenEditorPanel) {
      window.localStorage.setItem(EDITOR_HIDDEN_PANEL_STORAGE_KEY, hiddenEditorPanel);
      return;
    }

    window.localStorage.removeItem(EDITOR_HIDDEN_PANEL_STORAGE_KEY);
  }, [hiddenEditorPanel]);

  useEffect(() => {
    if (!isResizingEditor) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingEditor]);

  const updateEditorSplit = (clientX: number) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const rect = workspace.getBoundingClientRect();
    const availablePanelWidth = rect.width - EDITOR_SPLIT_CHROME_WIDTH;
    if (availablePanelWidth < EDITOR_PANEL_MIN_WIDTH + PREVIEW_PANEL_MIN_WIDTH) return;

    const nextEditorWidth = Math.min(
      availablePanelWidth - PREVIEW_PANEL_MIN_WIDTH,
      Math.max(EDITOR_PANEL_MIN_WIDTH, clientX - rect.left - 8)
    );

    setEditorSplitRatio(nextEditorWidth / availablePanelWidth);
  };

  const startEditorResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isDesktopSplit || hiddenEditorPanel !== null) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateEditorSplit(event.clientX);
    setIsResizingEditor(true);
  };

  useEffect(() => {
    if (!isResizingEditor) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => updateEditorSplit(event.clientX);
    const handlePointerUp = () => setIsResizingEditor(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingEditor]);

  const workspaceStyle =
    editorSplitRatio === null
      ? undefined
      : ({
          "--editor-panel-ratio": editorSplitRatio.toFixed(4)
        } as CSSProperties & Record<"--editor-panel-ratio", string>);
  const activeHiddenPanel = isDesktopSplit ? hiddenEditorPanel : null;
  const workspaceClassName = [
    styles.editorWorkspace,
    isResizingEditor ? styles.resizingEditorWorkspace : "",
    activeHiddenPanel === "editor" ? styles.editorPanelHidden : "",
    activeHiddenPanel === "preview" ? styles.previewPanelHidden : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={workspaceClassName}
      aria-label="Project editor"
      ref={workspaceRef}
      style={workspaceStyle}
    >
      {activeHiddenPanel === "editor" ? (
        <button className={styles.panelRestoreRail} onClick={() => setHiddenEditorPanel(null)} type="button">
          <PanelLeftOpen aria-hidden="true" />
          Show editor
        </button>
      ) : (
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
            <div className={styles.editorToolbarActions}>
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
              <button
                aria-label="Hide editor pane"
                className={styles.panelVisibilityButton}
                onClick={() => setHiddenEditorPanel("editor")}
                type="button"
              >
                <PanelLeftClose aria-hidden="true" />
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

          {activeConversionId && conversionStatus ? (
            <div className={styles.settingsMessage} role="status">
              <strong>Upgrade Game: </strong>{conversionStatus === "review" ? "Candidate ready for review." : conversionStatus}
              {conversionStatus === "review" ? (
                <>
                  <button onClick={() => onUpdateConversion("cancel")} type="button">Cancel Upgrade</button>{" "}
                  <button onClick={() => onUpdateConversion("validate")} type="button">{conversionValidation ? "Revalidate" : "Validate Candidate"}</button>{" "}
                  {conversionValidation?.warnings.length ? (
                    <label>
                      <input checked={conversionWarningsAcknowledged} onChange={(event) => onConversionWarningsAcknowledged(event.target.checked)} type="checkbox" /> Acknowledge warnings
                    </label>
                  ) : null}{" "}
                  <button
                    disabled={!conversionValidation || conversionValidation.blockingErrors.length > 0 || (Boolean(conversionValidation.warnings.length) && !conversionWarningsAcknowledged)}
                    onClick={() => onUpdateConversion("accept")}
                    type="button"
                  >Accept Upgrade</button>
                  {conversionValidation?.blockingErrors.map((finding) => <p className={styles.errorText} key={finding.code}>{finding.message}</p>)}
                  {conversionValidation?.warnings.map((finding) => <p key={finding.code}>{finding.message}</p>)}
                </>
              ) : null}
              {conversionStatus === "failed" ? <button onClick={() => onUpdateConversion("retry")} type="button">Retry Upgrade</button> : null}
            </div>
          ) : null}

          {planningAnswers.length > 0 && !isRunning ? (
            <div className={styles.quickAnswers} aria-label="Planning answer choices">
              <div className={styles.planningQuestion}>
                <span>{buildHandoffAnswer ? "Next step" : "Codex asks"}</span>
                <p>{planningQuestion || "Choose the next planning direction."}</p>
              </div>
              {planningAnswers.map((answer) => (
                <button
                  key={answer.label}
                  onClick={() => {
                    const action = getPlanningQuickAction(answer.text);
                    onQuickAnswer(action.prompt ?? `${answer.label}. ${answer.text}`, action.options);
                  }}
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
            <p className={styles.composerTip}>
              {chatMode === "plan"
                ? "Plan mode is for rules, rounds, scoring, and player flow. It will help you decide what to build next."
                : `Build mode changes the ${targetName}. Use the TV target for the shared screen and Phone for player controls.`}
            </p>
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
            <input
              accept="image/gif,image/jpeg,image/png,image/svg+xml,image/webp,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/flac,video/mp4,video/webm,font/woff,font/woff2,.atlas,.fnt,.json,.m4a,.flac,.mp4,.webm,.m4v,.woff,.woff2,.ttf,.otf,.mp3,.ogg,.wav"
              className={styles.assetUploadInput}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onUploadAsset(file);
                }
                event.currentTarget.value = "";
              }}
              ref={assetInputRef}
              type="file"
            />
            <button
              aria-label="Upload game asset"
              className={styles.assetUploadButton}
              disabled={isRunning || isUploadingAsset}
              onClick={() => assetInputRef.current?.click()}
              type="button"
            >
              <Upload aria-hidden="true" />
              {isUploadingAsset ? "Uploading" : "Asset"}
            </button>
            <button disabled={!canSubmit} type="submit">
              {isRunning
                ? "Running"
                : chatMode === "plan"
                  ? "Plan"
                  : `Build ${editingTarget === "tv" ? "TV" : "Phone"}`}
            </button>
          </form>
        </section>
      )}

      {activeHiddenPanel === null ? (
        <button
          aria-label="Resize editor and preview panes"
          className={styles.editorResizeHandle}
          onPointerDown={startEditorResize}
          type="button"
        />
      ) : null}

      {activeHiddenPanel === "preview" ? (
        <div className={styles.collapsedPreviewRail}>
          <ProjectMenu
            className={styles.collapsedPreviewMenuActions}
            isOpen={isProjectMenuOpen}
            onOpenAccountSettings={onOpenAccountSettings}
            onOpenAssets={onOpenAssets}
            onOpenInstructions={onOpenInstructions}
            onOpenProjectSettings={onOpenProjectSettings}
                onOpenUpgradeGame={onOpenUpgradeGame}
                onOpenRuntimeUpgrade={onOpenRuntimeUpgrade}
                canUpgradeGame={canUpgradeGame}
                canUpgradeRuntime={canUpgradeRuntime}
                onUpdateRuntimeUpgrade={onUpdateRuntimeUpgrade}
            onReturnToProjects={onReturnToProjects}
            onToggle={onToggleProjectMenu}
            projectId={projectId}
          />
          <button className={styles.panelRestoreRail} onClick={() => setHiddenEditorPanel(null)} type="button">
            <PanelRightOpen aria-hidden="true" />
            Show preview
          </button>
        </div>
      ) : (
        <aside className={styles.previewPanel} aria-label={`${editingTarget} UI preview`}>
          <div className={styles.previewHeader}>
            <div className={styles.previewTitleGroup}>
              <h2>{projectName}</h2>
              <span>{editingTarget === "tv" ? "TV Preview" : "Phone Preview"}</span>
            </div>
            <div className={styles.previewMenuActions}>
              <button
                aria-label="Hide preview pane"
                className={styles.panelVisibilityButton}
                onClick={() => setHiddenEditorPanel("preview")}
                type="button"
              >
                <PanelRightClose aria-hidden="true" />
              </button>
              <ProjectMenu
                isOpen={isProjectMenuOpen}
                onOpenAccountSettings={onOpenAccountSettings}
                onOpenAssets={onOpenAssets}
                onOpenInstructions={onOpenInstructions}
                onOpenProjectSettings={onOpenProjectSettings}
                onOpenUpgradeGame={onOpenUpgradeGame}
                onOpenRuntimeUpgrade={onOpenRuntimeUpgrade}
                canUpgradeGame={canUpgradeGame}
                canUpgradeRuntime={canUpgradeRuntime}
                onUpdateRuntimeUpgrade={onUpdateRuntimeUpgrade}
                onReturnToProjects={onReturnToProjects}
                onToggle={onToggleProjectMenu}
                projectId={projectId}
              />
            </div>
          </div>
          <ScaledPreviewFrame
            editingTarget={editingTarget}
            previewPath={previewPath}
            title={`${projectName} ${editingTarget} preview`}
          />
        </aside>
      )}
    </section>
  );
}

function ProjectMenu({
  canUpgradeRuntime,
  canUpgradeGame,
  className,
  isOpen,
  onOpenAccountSettings,
  onOpenAssets,
  onOpenInstructions,
  onOpenProjectSettings,
  onOpenUpgradeGame,
  onOpenRuntimeUpgrade,
  onUpdateRuntimeUpgrade,
  onReturnToProjects,
  onToggle,
  projectId
}: {
  canUpgradeGame: boolean;
  canUpgradeRuntime: boolean;
  className?: string;
  isOpen: boolean;
  onOpenAccountSettings: () => void;
  onOpenAssets: () => void;
  onOpenInstructions: () => void;
  onOpenProjectSettings: () => void;
  onOpenUpgradeGame: () => void;
  onOpenRuntimeUpgrade: () => void;
  onUpdateRuntimeUpgrade: (action: "accept" | "cancel" | "validate") => void;
  onReturnToProjects: () => void;
  onToggle: () => void;
  projectId: string;
}) {
  return (
    <div className={className}>
      <button
        aria-expanded={isOpen}
        aria-label="Open game menu"
        className={styles.menuButton}
        onClick={onToggle}
        type="button"
      >
        <Menu aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className={styles.menu} role="menu">
          <a href={`/tv/${projectId}`} role="menuitem">
            Open TV
          </a>
          <a href={`/join/${projectId}`} role="menuitem">
            Open Phone
          </a>
          <button onClick={onOpenInstructions} role="menuitem" type="button">
            Game Instructions
          </button>
          <a href="/engine-guide" role="menuitem">
            Engine Creator Guide
          </a>
          <button onClick={onOpenAssets} role="menuitem" type="button">
            Game Assets
          </button>
          <button onClick={onOpenProjectSettings} role="menuitem" type="button">
            Project Settings
          </button>
          <button
            disabled={!canUpgradeGame}
            onClick={onOpenUpgradeGame}
            role="menuitem"
            title={canUpgradeGame ? undefined : "Upgrade Game is available for editable legacy projects only."}
            type="button"
          >
            Upgrade Game
          </button>
          <button disabled={!canUpgradeRuntime} onClick={onOpenRuntimeUpgrade} role="menuitem" type="button">
            Runtime Upgrade
          </button>
          <button disabled={!canUpgradeRuntime} onClick={() => onUpdateRuntimeUpgrade("cancel")} role="menuitem" type="button">
            Cancel Runtime Preview
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

function formatAssetSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB"];
  let value = size;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function extractPlanningQuestion(content: string) {
  if (/Ready to build\?/i.test(content)) {
    return "Ready to build?";
  }

  const questionLine = content.match(/^\s*Question\s*[:\-]\s*(.+)$/im);
  if (questionLine) {
    return questionLine[1].trim();
  }

  const compactContent = content.replace(/\s+/g, " ").trim();
  const beforeChoices = compactContent.match(/^(.*?)(?=\s(?:[-*]\s*)?[A-D][).:-]\s+)/i)?.[1] ?? compactContent;

  return beforeChoices
    .replace(/^Question\s*[:\-]\s*/i, "")
    .replace(/^Codex asks\s*[:\-]\s*/i, "")
    .trim();
}

function getPlanningQuickAction(text: string): { prompt?: string; options?: ChatSubmitOptions } {
  const normalized = text.trim().toLowerCase();
  if (/^(implement|build)\s+(the\s+)?(proposed\s+)?plan\b/.test(normalized)) {
    return {
      prompt: "Implement the proposed plan across every affected part of the game.",
      options: { chatMode: "build", editingTarget: "both" }
    };
  }
  return {};
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
        ref={iframeRef}
        sandbox="allow-scripts"
        src={previewPath}
        style={{
          height: `${virtualSize.height}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          width: `${virtualSize.width}px`
        }}
        title={title}
      />
      {editingTarget === "tv" ? <EngineDiagnostics frameRef={iframeRef} /> : null}
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
    minimumFractionDigits: 2,
    style: "currency"
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
