export class UserSettingsError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function hasUserApiKey(userId: string): Promise<boolean>;
export function getUserApiKey(userId: string): Promise<string>;
export function saveUserApiKey(userId: string, apiKey: unknown): Promise<void>;
export function deleteUserApiKey(userId: string): Promise<void>;
export function normalizeApiKey(apiKey: unknown): string;
export function encryptApiKey(apiKey: string, userId: string, key?: Buffer): string;
export function decryptApiKey(value: string, userId: string, key?: Buffer): string;
