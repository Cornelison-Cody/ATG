export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_VISIBILITIES = ["private", "public"];

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

  const supportedFields = new Set(["name", "visibility"]);
  const unsupportedFields = Object.keys(value).filter((field) => !supportedFields.has(field));
  if (unsupportedFields.length > 0) {
    return { ok: false, error: `Unsupported project detail field: ${unsupportedFields[0]}.` };
  }

  if (!("name" in value) && !("visibility" in value)) {
    return { ok: false, error: "Project details must include a name or visibility." };
  }

  const result = { ok: true };
  if ("name" in value) {
    const nameValidation = validateProjectName(value.name);
    if (!nameValidation.ok) {
      return nameValidation;
    }
    result.name = nameValidation.name;
  }

  if ("visibility" in value && !PROJECT_VISIBILITIES.includes(value.visibility)) {
    return { ok: false, error: "Project visibility must be public or private." };
  }

  if ("visibility" in value) {
    result.visibility = value.visibility;
  }

  return result;
}
