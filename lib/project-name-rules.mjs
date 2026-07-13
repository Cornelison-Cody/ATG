export const PROJECT_NAME_MAX_LENGTH = 80;

export function validateProjectName(value) {
  if (typeof value !== "string") {
    return { ok: false, error: "Project name must be a string." };
  }

  const name = value.trim();
  if (!name) {
    return { ok: false, error: "Project name is required." };
  }

  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Project name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`
    };
  }

  return { ok: true, name };
}

export function validateProjectDetailsPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Project details must be an object." };
  }

  const supportedFields = new Set(["name"]);
  const unsupportedFields = Object.keys(value).filter((field) => !supportedFields.has(field));
  if (unsupportedFields.length > 0) {
    return { ok: false, error: `Unsupported project detail field: ${unsupportedFields[0]}.` };
  }

  return validateProjectName(value.name);
}
