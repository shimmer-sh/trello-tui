import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

export interface ShimmerConfig {
  boardId?: string
  boardName?: string
}

const CONFIG_FILENAME = ".shimmer.json"

// Get config file path in current working directory
function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILENAME)
}

// Load config from file
export function loadConfig(): ShimmerConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    return JSON.parse(content) as ShimmerConfig
  } catch {
    return {}
  }
}

// Save config to file
export function saveConfig(config: ShimmerConfig): void {
  const configPath = getConfigPath()
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n")
}

// Check if board is configured
export function isBoardConfigured(): boolean {
  const config = loadConfig()
  return !!config.boardId
}

// Get configured board ID
export function getBoardId(): string | undefined {
  const config = loadConfig()
  return config.boardId
}

// Set board in config
export function setBoard(boardId: string, boardName: string): void {
  const config = loadConfig()
  config.boardId = boardId
  config.boardName = boardName
  saveConfig(config)
}
