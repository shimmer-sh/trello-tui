# trello-tui

A terminal-based Trello board viewer with AI-powered issue analysis.

## Features

- Browse Trello boards and cards in your terminal
- Navigate between lists with Tab
- Fuzzy search cards
- View card details (labels, members, checklists, description)
- Move cards between lists
- **AI Analysis**: Press `a` to have Claude investigate an issue in your codebase and post findings to Trello

## Requirements

- [Bun](https://bun.sh) runtime
- Trello API credentials
- Claude CLI

## Installation

```bash
# Install globally
bun install -g github:shimmer-sh/trello-tui
```

## Updating

```bash
# Get the latest version
bun install -g github:shimmer-sh/trello-tui
```

## Setup

### 1. Get Trello credentials

1. Go to https://trello.com/power-ups/admin/
2. Create a new Power-Up (or select existing)
3. Copy your **API Key** and generate a **Token**

### 2. Set environment variables

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
export TRELLO_API_KEY='your-api-key'
export TRELLO_TOKEN='your-token'
```

### 3. Run in any project

```bash
cd your-project
trello-tui
```

On first run in a project, you'll select which Trello board to use. The selection is saved to `.shimmer.json` in the project directory.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑↓` | Navigate cards |
| `Tab` / `Shift+Tab` | Switch lists |
| `←→` | Switch panels |
| `Ctrl+F` | Search |
| `a` | AI analyze (details panel) |
| `m` | Move card (details panel) |
| `o` | Open in browser |
| `q` | Quit |

## AI Analysis

When viewing a card, press `a` to analyze. Claude will investigate the codebase in the current directory and post findings back to the Trello card description.

## License

MIT
