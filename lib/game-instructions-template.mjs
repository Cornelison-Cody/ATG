export function renderGameInstructionsTemplate(projectName) {
  return `# ${projectName}

## Goal

Welcome to ${projectName}. Write one or two sentences that tell players what they are trying to do.

Example: Score points by answering prompts, solving challenges, or beating the other team before the final round ends.

## Setup

1. Open the TV view on the shared screen.
2. Have each player open the phone join link.
3. Choose teams, player names, or any house rules before the first round starts.

## How to Play

Describe the round flow in plain language:

- What happens at the start of a round?
- What do players do on their phones?
- What does everyone watch on the TV?
- How are points earned?
- When does the game end?

Example: Each round shows a prompt on the TV. Players answer on their phones. Correct answers earn points, and the highest score after five rounds wins.

## Phone Controls

List the actions players can take from their phones, such as:

- Join the game
- Submit an answer
- Vote
- Buzz in
- Pick a category

## TV Display

Explain what the TV should show during play, such as the current prompt, timer, team scores, round results, or final winner.

## Scoring

Explain how points work. Include bonuses, penalties, ties, and how to win.

## Assets and Screenshots

Images stored in the game folder can be embedded here with Markdown, for example:

![Example game screen](example.png)
`;
}
