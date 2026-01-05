import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test"
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs"
import { join } from "path"

// Test file path
const TEST_CONFIG_PATH = join(process.cwd(), ".shimmer.json")

describe("Config Module", () => {
  // Clean up before and after each test
  beforeEach(() => {
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH)
      }
    } catch {
      // Ignore errors
    }
  })

  afterEach(() => {
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH)
      }
    } catch {
      // Ignore errors
    }
  })

  describe("loadConfig", () => {
    test("returns empty object when config file does not exist", async () => {
      const { loadConfig } = await import("./config.ts")
      const config = loadConfig()
      expect(config).toEqual({})
    })

    test("returns parsed config when file exists", async () => {
      const testConfig = { boardId: "test-board-123", boardName: "Test Board" }
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify(testConfig))

      const { loadConfig } = await import("./config.ts")
      const config = loadConfig()
      expect(config).toEqual(testConfig)
    })

    test("returns empty object when config file contains invalid JSON", async () => {
      writeFileSync(TEST_CONFIG_PATH, "{ invalid json }")

      const { loadConfig } = await import("./config.ts")
      const config = loadConfig()
      expect(config).toEqual({})
    })

    test("returns empty object when config file is empty", async () => {
      writeFileSync(TEST_CONFIG_PATH, "")

      const { loadConfig } = await import("./config.ts")
      const config = loadConfig()
      expect(config).toEqual({})
    })
  })

  describe("saveConfig", () => {
    test("writes config to file with proper formatting", async () => {
      const { saveConfig } = await import("./config.ts")
      const testConfig = { boardId: "board-456", boardName: "My Board" }

      saveConfig(testConfig)

      expect(existsSync(TEST_CONFIG_PATH)).toBe(true)
      const content = readFileSync(TEST_CONFIG_PATH, "utf-8")
      expect(JSON.parse(content)).toEqual(testConfig)
      // Check formatting (2-space indent, trailing newline)
      expect(content).toBe(JSON.stringify(testConfig, null, 2) + "\n")
    })

    test("overwrites existing config file", async () => {
      const { saveConfig, loadConfig } = await import("./config.ts")

      saveConfig({ boardId: "first-board", boardName: "First" })
      saveConfig({ boardId: "second-board", boardName: "Second" })

      const config = loadConfig()
      expect(config.boardId).toBe("second-board")
      expect(config.boardName).toBe("Second")
    })
  })

  describe("isBoardConfigured", () => {
    test("returns false when config file does not exist", async () => {
      const { isBoardConfigured } = await import("./config.ts")
      expect(isBoardConfigured()).toBe(false)
    })

    test("returns false when boardId is not set", async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ boardName: "Board without ID" }))

      const { isBoardConfigured } = await import("./config.ts")
      expect(isBoardConfigured()).toBe(false)
    })

    test("returns true when boardId is set", async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ boardId: "valid-board-id" }))

      const { isBoardConfigured } = await import("./config.ts")
      expect(isBoardConfigured()).toBe(true)
    })

    test("returns false when boardId is empty string", async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ boardId: "" }))

      const { isBoardConfigured } = await import("./config.ts")
      expect(isBoardConfigured()).toBe(false)
    })
  })

  describe("getBoardId", () => {
    test("returns undefined when config file does not exist", async () => {
      const { getBoardId } = await import("./config.ts")
      expect(getBoardId()).toBeUndefined()
    })

    test("returns undefined when boardId is not in config", async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ boardName: "Some Board" }))

      const { getBoardId } = await import("./config.ts")
      expect(getBoardId()).toBeUndefined()
    })

    test("returns boardId when it exists in config", async () => {
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ boardId: "my-board-id" }))

      const { getBoardId } = await import("./config.ts")
      expect(getBoardId()).toBe("my-board-id")
    })
  })

  describe("setBoard", () => {
    test("sets boardId and boardName in config", async () => {
      const { setBoard, loadConfig } = await import("./config.ts")

      setBoard("new-board-id", "New Board Name")

      const config = loadConfig()
      expect(config.boardId).toBe("new-board-id")
      expect(config.boardName).toBe("New Board Name")
    })

    test("preserves existing config properties", async () => {
      // First create a config with some existing data
      writeFileSync(
        TEST_CONFIG_PATH,
        JSON.stringify({ boardId: "old-id", boardName: "Old Name" })
      )

      const { setBoard, loadConfig } = await import("./config.ts")

      setBoard("updated-id", "Updated Name")

      const config = loadConfig()
      expect(config.boardId).toBe("updated-id")
      expect(config.boardName).toBe("Updated Name")
    })

    test("creates config file if it does not exist", async () => {
      expect(existsSync(TEST_CONFIG_PATH)).toBe(false)

      const { setBoard } = await import("./config.ts")
      setBoard("brand-new-board", "Brand New Board")

      expect(existsSync(TEST_CONFIG_PATH)).toBe(true)
    })
  })
})

describe("Config Integration Tests", () => {
  beforeEach(() => {
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH)
      }
    } catch {
      // Ignore errors
    }
  })

  afterEach(() => {
    try {
      if (existsSync(TEST_CONFIG_PATH)) {
        unlinkSync(TEST_CONFIG_PATH)
      }
    } catch {
      // Ignore errors
    }
  })

  test("full workflow: set board, check configured, get board id", async () => {
    const { setBoard, isBoardConfigured, getBoardId } = await import("./config.ts")

    // Initially not configured
    expect(isBoardConfigured()).toBe(false)
    expect(getBoardId()).toBeUndefined()

    // Set board
    setBoard("workflow-board-id", "Workflow Board")

    // Now configured
    expect(isBoardConfigured()).toBe(true)
    expect(getBoardId()).toBe("workflow-board-id")
  })

  test("handles switching between boards", async () => {
    const { setBoard, getBoardId, loadConfig } = await import("./config.ts")

    setBoard("board-1", "First Board")
    expect(getBoardId()).toBe("board-1")
    expect(loadConfig().boardName).toBe("First Board")

    setBoard("board-2", "Second Board")
    expect(getBoardId()).toBe("board-2")
    expect(loadConfig().boardName).toBe("Second Board")
  })
})
