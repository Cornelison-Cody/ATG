export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "done" | "error";
  createdAt: string;
};

export type ProjectCollaborator = {
  principalName: string;
  invitedAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  path: string;
  codexThreadId: string | null;
  ownerUserId?: string;
  ownerName?: string;
  collaborators: ProjectCollaborator[];
  visibility: "private" | "public";
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // Azure uses this immutable generation as the publish pointer for game files.
  // Projects without one continue to read their original blob layout.
  gameGeneration?: string;
  messages: ChatMessage[];
};

export type ProjectDatabase = {
  projects: ProjectRecord[];
};

export type PublicProject = Omit<ProjectRecord, "messages"> & {
  accessRole?: "owner" | "collaborator";
  messageCount: number;
};
