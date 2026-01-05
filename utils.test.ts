import { describe, test, expect } from "bun:test"
import {
  fuzzyMatch,
  getFilteredCards,
  labelColors,
  colors,
  formatMembers,
  getChecklistProgress,
  getLabelColor,
  truncateText,
  isValidTrelloId,
  formatDueDate,
  wrapIndex,
} from "./utils"
import type { NormalizedCard, TrelloList } from "./trello"

describe("fuzzyMatch", () => {
  test("returns true for empty query", () => {
    expect(fuzzyMatch("", "any text")).toBe(true)
  })

  test("returns true for exact match", () => {
    expect(fuzzyMatch("hello", "hello")).toBe(true)
  })

  test("returns true for substring match", () => {
    expect(fuzzyMatch("test", "this is a test string")).toBe(true)
  })

  test("returns true for fuzzy match with characters in order", () => {
    expect(fuzzyMatch("hlo", "hello")).toBe(true)
    expect(fuzzyMatch("hw", "hello world")).toBe(true)
    expect(fuzzyMatch("fb", "Fix bug")).toBe(true)
  })

  test("is case insensitive", () => {
    expect(fuzzyMatch("HELLO", "hello")).toBe(true)
    expect(fuzzyMatch("hello", "HELLO")).toBe(true)
    expect(fuzzyMatch("HeLLo", "hElLO")).toBe(true)
  })

  test("returns false when characters are not in order", () => {
    expect(fuzzyMatch("ba", "ab")).toBe(false)
    expect(fuzzyMatch("zyx", "xyz")).toBe(false)
  })

  test("returns false when characters are missing", () => {
    expect(fuzzyMatch("xyz", "hello")).toBe(false)
    expect(fuzzyMatch("abc", "ab")).toBe(false)
  })

  test("handles special characters", () => {
    expect(fuzzyMatch("a-b", "a-b-c")).toBe(true)
    expect(fuzzyMatch("a_b", "a_b_c")).toBe(true)
    expect(fuzzyMatch("a.b", "a.b.c")).toBe(true)
  })

  test("handles unicode characters", () => {
    expect(fuzzyMatch("héllo", "héllo world")).toBe(true)
    expect(fuzzyMatch("日本", "日本語")).toBe(true)
  })

  test("handles empty text", () => {
    expect(fuzzyMatch("a", "")).toBe(false)
    expect(fuzzyMatch("", "")).toBe(true)
  })

  test("real-world examples", () => {
    // Card names from Trello
    expect(fuzzyMatch("auth", "Implement authentication system")).toBe(true)
    expect(fuzzyMatch("bug", "Fix critical bug in payment flow")).toBe(true)
    expect(fuzzyMatch("icf", "Implement card filtering")).toBe(true)
  })
})

describe("getFilteredCards", () => {
  const mockLists: TrelloList[] = [
    { id: "list1", name: "To Do", idBoard: "board1" },
    { id: "list2", name: "In Progress", idBoard: "board1" },
    { id: "list3", name: "Done", idBoard: "board1" },
  ]

  const mockCards: NormalizedCard[] = [
    {
      id: "card1",
      name: "Fix authentication bug",
      description: "",
      listId: "list1",
      labels: [],
      url: "",
      members: [],
      checklists: [],
    },
    {
      id: "card2",
      name: "Implement search",
      description: "",
      listId: "list1",
      labels: [],
      url: "",
      members: [],
      checklists: [],
    },
    {
      id: "card3",
      name: "Review PR",
      description: "",
      listId: "list2",
      labels: [],
      url: "",
      members: [],
      checklists: [],
    },
    {
      id: "card4",
      name: "Deploy to production",
      description: "",
      listId: "list3",
      labels: [],
      url: "",
      members: [],
      checklists: [],
    },
  ]

  test("filters cards by list", () => {
    const result = getFilteredCards(mockCards, mockLists, 0, "")
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe("card1")
    expect(result[1]!.id).toBe("card2")
  })

  test("filters cards by different lists", () => {
    expect(getFilteredCards(mockCards, mockLists, 0, "")).toHaveLength(2)
    expect(getFilteredCards(mockCards, mockLists, 1, "")).toHaveLength(1)
    expect(getFilteredCards(mockCards, mockLists, 2, "")).toHaveLength(1)
  })

  test("applies search query filter", () => {
    const result = getFilteredCards(mockCards, mockLists, 0, "auth")
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe("card1")
  })

  test("combines list and search filters", () => {
    // Search for "p" in list1 - only "Implement search" matches
    const result = getFilteredCards(mockCards, mockLists, 0, "imp")
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe("Implement search")
  })

  test("returns empty array for invalid list index", () => {
    expect(getFilteredCards(mockCards, mockLists, 99, "")).toEqual([])
    expect(getFilteredCards(mockCards, mockLists, -1, "")).toEqual([])
  })

  test("returns empty array for empty lists", () => {
    expect(getFilteredCards(mockCards, [], 0, "")).toEqual([])
  })

  test("returns empty array when no cards match", () => {
    expect(getFilteredCards(mockCards, mockLists, 0, "xyz123")).toEqual([])
  })
})

describe("labelColors", () => {
  test("contains expected Trello colors", () => {
    expect(labelColors.green).toBe("#61bd4f")
    expect(labelColors.yellow).toBe("#f2d600")
    expect(labelColors.orange).toBe("#ff9f1a")
    expect(labelColors.red).toBe("#eb5a46")
    expect(labelColors.purple).toBe("#c377e0")
    expect(labelColors.blue).toBe("#0079bf")
    expect(labelColors.sky).toBe("#00c2e0")
    expect(labelColors.lime).toBe("#51e898")
    expect(labelColors.pink).toBe("#ff78cb")
    expect(labelColors.black).toBe("#344563")
  })

  test("all colors are valid hex codes", () => {
    for (const [name, color] of Object.entries(labelColors)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe("colors", () => {
  test("contains theme colors", () => {
    expect(colors.bg).toBeDefined()
    expect(colors.text).toBeDefined()
    expect(colors.textDim).toBeDefined()
    expect(colors.border).toBeDefined()
    expect(colors.borderFocus).toBeDefined()
    expect(colors.yellow).toBeDefined()
    expect(colors.green).toBeDefined()
    expect(colors.blue).toBeDefined()
  })

  test("all colors are valid hex codes", () => {
    for (const [name, color] of Object.entries(colors)) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe("formatMembers", () => {
  test("formats single member", () => {
    expect(formatMembers([{ username: "john" }])).toBe("@john")
  })

  test("formats multiple members", () => {
    expect(formatMembers([{ username: "john" }, { username: "jane" }])).toBe("@john @jane")
  })

  test("handles empty array", () => {
    expect(formatMembers([])).toBe("")
  })
})

describe("getChecklistProgress", () => {
  test("calculates progress for mixed items", () => {
    const items = [
      { state: "complete" as const },
      { state: "incomplete" as const },
      { state: "complete" as const },
    ]
    expect(getChecklistProgress(items)).toEqual({ done: 2, total: 3 })
  })

  test("handles all complete items", () => {
    const items = [{ state: "complete" as const }, { state: "complete" as const }]
    expect(getChecklistProgress(items)).toEqual({ done: 2, total: 2 })
  })

  test("handles all incomplete items", () => {
    const items = [{ state: "incomplete" as const }, { state: "incomplete" as const }]
    expect(getChecklistProgress(items)).toEqual({ done: 0, total: 2 })
  })

  test("handles empty array", () => {
    expect(getChecklistProgress([])).toEqual({ done: 0, total: 0 })
  })
})

describe("getLabelColor", () => {
  test("returns correct color for valid label", () => {
    expect(getLabelColor("red")).toBe("#eb5a46")
    expect(getLabelColor("blue")).toBe("#0079bf")
  })

  test("returns fallback for unknown color", () => {
    expect(getLabelColor("unknown")).toBe(colors.textDim)
    expect(getLabelColor("invalid", "#000000")).toBe("#000000")
  })
})

describe("truncateText", () => {
  test("returns original text if shorter than max", () => {
    expect(truncateText("hello", 10)).toBe("hello")
  })

  test("returns original text if exactly max length", () => {
    expect(truncateText("hello", 5)).toBe("hello")
  })

  test("truncates text longer than max", () => {
    expect(truncateText("hello world", 8)).toBe("hello...")
  })

  test("uses custom suffix", () => {
    expect(truncateText("hello world", 8, "…")).toBe("hello w…")
  })

  test("handles empty string", () => {
    expect(truncateText("", 5)).toBe("")
  })

  test("handles max length of 0", () => {
    expect(truncateText("hello", 3)).toBe("...")
  })
})

describe("isValidTrelloId", () => {
  test("returns true for valid 24-char hex IDs", () => {
    expect(isValidTrelloId("507f1f77bcf86cd799439011")).toBe(true)
    expect(isValidTrelloId("5d5a0a71f8a4b30017f4a123")).toBe(true)
  })

  test("is case insensitive", () => {
    expect(isValidTrelloId("507F1F77BCF86CD799439011")).toBe(true)
    expect(isValidTrelloId("507f1f77BCF86cd799439011")).toBe(true)
  })

  test("returns false for too short IDs", () => {
    expect(isValidTrelloId("507f1f77")).toBe(false)
  })

  test("returns false for too long IDs", () => {
    expect(isValidTrelloId("507f1f77bcf86cd799439011extra")).toBe(false)
  })

  test("returns false for non-hex characters", () => {
    expect(isValidTrelloId("507f1f77bcf86cd79943901g")).toBe(false)
    expect(isValidTrelloId("507f1f77bcf86cd79943901!")).toBe(false)
  })

  test("returns false for empty string", () => {
    expect(isValidTrelloId("")).toBe(false)
  })

  test("returns false for null/undefined", () => {
    expect(isValidTrelloId(null as unknown as string)).toBe(false)
    expect(isValidTrelloId(undefined as unknown as string)).toBe(false)
  })
})

describe("formatDueDate", () => {
  test("formats valid ISO date string", () => {
    const result = formatDueDate("2024-12-31T00:00:00.000Z")
    expect(result).toBeDefined()
    expect(typeof result).toBe("string")
  })

  test("returns undefined for undefined input", () => {
    expect(formatDueDate(undefined)).toBeUndefined()
  })

  test("returns undefined for empty string", () => {
    expect(formatDueDate("")).toBeUndefined()
  })

  test("handles different date formats", () => {
    expect(formatDueDate("2024-01-15")).toBeDefined()
    expect(formatDueDate("2024-06-30T12:30:00Z")).toBeDefined()
  })
})

describe("wrapIndex", () => {
  test("increments within bounds", () => {
    expect(wrapIndex(0, 1, 5)).toBe(1)
    expect(wrapIndex(2, 1, 5)).toBe(3)
  })

  test("decrements within bounds", () => {
    expect(wrapIndex(3, -1, 5)).toBe(2)
    expect(wrapIndex(1, -1, 5)).toBe(0)
  })

  test("wraps around at end", () => {
    expect(wrapIndex(4, 1, 5)).toBe(0)
    expect(wrapIndex(0, -1, 5)).toBe(4)
  })

  test("handles multiple wraps", () => {
    expect(wrapIndex(0, 6, 5)).toBe(1)
    expect(wrapIndex(0, -6, 5)).toBe(4)
  })

  test("returns 0 for empty array", () => {
    expect(wrapIndex(0, 1, 0)).toBe(0)
    expect(wrapIndex(5, -1, 0)).toBe(0)
  })

  test("handles single element array", () => {
    expect(wrapIndex(0, 1, 1)).toBe(0)
    expect(wrapIndex(0, -1, 1)).toBe(0)
  })
})
