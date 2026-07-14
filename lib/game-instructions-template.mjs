export function renderGameInstructionsTemplate(projectName) {
  return `# ${projectName}

## Goal

Welcome to ${projectName}. Explain the game objective and what players are trying to accomplish.

## Setup

Describe what the TV shows, what players need on their phones, and how to get ready to play.

## How to Play

Add the core turn flow, player actions, scoring rules, win conditions, and any timing or round structure.

## Phone Controls

Explain the actions players can take from their phones.

## Assets

Images stored in the game folder can be embedded here with Markdown.
`;
}
