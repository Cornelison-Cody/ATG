export type ConversionIdentity = {
  id: string;
  slug: string;
  path: string;
  name?: string;
  ownerUserId: string | null;
  ownerName: string | null;
  collaborators: { principalName: string; invitedAt: string }[];
  visibility: "private" | "public";
  tvUrl: string;
  phoneUrl: string;
  assets: { path: string; [key: string]: unknown }[];
  instructions: string;
  savedState: unknown;
  activeSession: null;
};
export function captureConversionIdentity(project: Record<string, unknown>, options?: { assets?: Record<string, unknown>[]; instructions?: string; savedState?: unknown }): ConversionIdentity;
export function acceptConversionIdentity(identity: ConversionIdentity, candidate: Record<string, unknown>, revision: string): Record<string, unknown>;
export function assertIdentityPreserved(identity: ConversionIdentity, project: Record<string, unknown>): true;
