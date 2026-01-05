import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from "bun:test"

// Store original env values
const originalEnv = { ...process.env }

describe("TrelloClient", () => {
  beforeEach(() => {
    // Reset environment for each test
    process.env.TRELLO_API_KEY = "test-api-key"
    process.env.TRELLO_TOKEN = "test-token"
  })

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv }
    mock.restore()
  })

  describe("constructor", () => {
    test("throws error when TRELLO_API_KEY is missing", async () => {
      delete process.env.TRELLO_API_KEY
      process.env.TRELLO_TOKEN = "test-token"

      // Clear module cache to force re-evaluation
      const modulePath = require.resolve("./trello.ts")
      delete require.cache[modulePath]

      expect(() => {
        const { TrelloClient } = require("./trello.ts")
        new TrelloClient()
      }).toThrow("Missing Trello credentials")
    })

    test("throws error when TRELLO_TOKEN is missing", async () => {
      process.env.TRELLO_API_KEY = "test-api-key"
      delete process.env.TRELLO_TOKEN

      const modulePath = require.resolve("./trello.ts")
      delete require.cache[modulePath]

      expect(() => {
        const { TrelloClient } = require("./trello.ts")
        new TrelloClient()
      }).toThrow("Missing Trello credentials")
    })

    test("creates client successfully with valid credentials", async () => {
      process.env.TRELLO_API_KEY = "test-api-key"
      process.env.TRELLO_TOKEN = "test-token"

      const modulePath = require.resolve("./trello.ts")
      delete require.cache[modulePath]

      const { TrelloClient } = require("./trello.ts")
      const client = new TrelloClient()
      expect(client).toBeDefined()
    })
  })

  describe("getBoards", () => {
    test("fetches boards and returns them", async () => {
      const mockBoards = [
        { id: "board1", name: "Project Alpha" },
        { id: "board2", name: "Project Beta" },
      ]

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockBoards),
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      const boards = await client.getBoards()

      expect(boards).toEqual(mockBoards)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const calledUrl = mockFetch.mock.calls[0]![0] as string
      expect(calledUrl).toContain("/members/me/boards")
      expect(calledUrl).toContain("key=test-api-key")
      expect(calledUrl).toContain("token=test-token")
    })

    test("throws error on API failure", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()

      expect(client.getBoards()).rejects.toThrow("Trello API error: 401 Unauthorized")
    })
  })

  describe("getLists", () => {
    test("fetches lists for a board", async () => {
      const mockLists = [
        { id: "list1", name: "To Do", idBoard: "board1" },
        { id: "list2", name: "In Progress", idBoard: "board1" },
        { id: "list3", name: "Done", idBoard: "board1" },
      ]

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockLists),
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      const lists = await client.getLists("board1")

      expect(lists).toEqual(mockLists)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const calledUrl = mockFetch.mock.calls[0]![0] as string
      expect(calledUrl).toContain("/boards/board1/lists")
    })
  })

  describe("getCards", () => {
    test("fetches and normalizes cards for a board", async () => {
      const mockCards = [
        {
          id: "card1",
          name: "Fix bug",
          desc: "There's a bug to fix",
          idList: "list1",
          labels: [{ id: "label1", name: "Bug", color: "red" }],
          due: "2024-12-31T00:00:00.000Z",
          url: "https://trello.com/c/card1",
          members: [{ id: "member1", fullName: "John Doe", username: "johndoe", initials: "JD" }],
          checklists: [
            {
              id: "checklist1",
              name: "Tasks",
              checkItems: [
                { id: "item1", name: "Task 1", state: "complete" },
                { id: "item2", name: "Task 2", state: "incomplete" },
              ],
            },
          ],
        },
      ]

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCards),
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      const cards = await client.getCards("board1")

      expect(cards).toHaveLength(1)
      expect(cards[0]).toEqual({
        id: "card1",
        name: "Fix bug",
        description: "There's a bug to fix",
        listId: "list1",
        labels: [{ id: "label1", name: "Bug", color: "red" }],
        dueDate: new Date("2024-12-31T00:00:00.000Z").toLocaleDateString(),
        url: "https://trello.com/c/card1",
        members: [{ id: "member1", fullName: "John Doe", username: "johndoe", initials: "JD" }],
        checklists: [
          {
            id: "checklist1",
            name: "Tasks",
            checkItems: [
              { id: "item1", name: "Task 1", state: "complete" },
              { id: "item2", name: "Task 2", state: "incomplete" },
            ],
          },
        ],
      })

      const calledUrl = mockFetch.mock.calls[0]![0] as string
      expect(calledUrl).toContain("/boards/board1/cards")
    })

    test("fetches cards for a specific list", async () => {
      const mockCards: unknown[] = []

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCards),
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      await client.getCards("board1", "list1")

      const calledUrl = mockFetch.mock.calls[0]![0] as string
      expect(calledUrl).toContain("/lists/list1/cards")
    })

    test("handles cards with missing optional fields", async () => {
      const mockCards = [
        {
          id: "card2",
          name: "Simple card",
          desc: "",
          idList: "list1",
          labels: [],
          url: "https://trello.com/c/card2",
          // No due, members, or checklists
        },
      ]

      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCards),
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      const cards = await client.getCards("board1")

      expect(cards[0]).toEqual({
        id: "card2",
        name: "Simple card",
        description: "",
        listId: "list1",
        labels: [],
        dueDate: undefined,
        url: "https://trello.com/c/card2",
        members: [],
        checklists: [],
      })
    })
  })

  describe("moveCard", () => {
    test("moves card to a different list", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      await client.moveCard("card1", "list2")

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [calledUrl, options] = mockFetch.mock.calls[0]! as [string, RequestInit]
      expect(calledUrl).toContain("/cards/card1")
      expect(calledUrl).toContain("idList=list2")
      expect(options.method).toBe("PUT")
    })

    test("throws error when move fails", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()

      expect(client.moveCard("invalid-card", "list2")).rejects.toThrow(
        "Failed to move card: 404 Not Found"
      )
    })
  })

  describe("updateCardDescription", () => {
    test("updates card description", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()
      await client.updateCardDescription("card1", "New description")

      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [calledUrl, options] = mockFetch.mock.calls[0]! as [string, RequestInit]
      expect(calledUrl).toContain("/cards/card1")
      expect(options.method).toBe("PUT")
      expect(options.headers).toEqual({ "Content-Type": "application/json" })
      expect(JSON.parse(options.body as string)).toEqual({ desc: "New description" })
    })

    test("throws error when update fails", async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const { TrelloClient } = await import("./trello.ts")
      const client = new TrelloClient()

      expect(client.updateCardDescription("card1", "New description")).rejects.toThrow(
        "Failed to update card: 500 Internal Server Error"
      )
    })
  })
})

describe("createTrelloClient", () => {
  beforeEach(() => {
    process.env.TRELLO_API_KEY = "test-api-key"
    process.env.TRELLO_TOKEN = "test-token"
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test("creates a new TrelloClient instance", async () => {
    const { createTrelloClient, TrelloClient } = await import("./trello.ts")
    const client = createTrelloClient()
    expect(client).toBeInstanceOf(TrelloClient)
  })
})
