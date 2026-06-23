# Agent Notes

## Ticket Workflow

- When starting work, inspect the current branch and working tree before changing files.
- Prefer a ticket branch based on `origin/main` unless the user asks to continue from another branch.
- Keep ticket changes scoped. Do not stage unrelated or generated changes unless they are intentionally part of the ticket.
- Run the relevant checks before publishing. For this repo, use `npm run check`.
- When implementation and verification are complete, move the ticket to `In review` in the `TV Platform` GitHub project.
- Open a pull request against `main` that is ready for review, not a draft.
- Include the ticket reference in the PR body so GitHub links or closes the issue.

## Ticket Creation

- When creating a GitHub ticket for this repo, add it to the `TV Platform` project.
- New tickets should start with the `Backlog` status.
