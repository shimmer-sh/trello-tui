// Utility functions for trello-tui

import type { NormalizedCard, TrelloList } from "./trello"

/**
 * Fuzzy match - checks if all query characters appear in text in order
 * @param query - The search query
 * @param text - The text to search in
 * @returns true if all query characters appear in text in order
 */
export function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  let qi = 0
  for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[qi]) qi++
  }
  return qi === lowerQuery.length
}

/**
 * Filter cards by list and search query
 * @param cards - All available cards
 * @param lists - All available lists
 * @param currentListIndex - Index of the currently selected list
 * @param searchQuery - The search query to filter by
 * @returns Filtered cards
 */
export function getFilteredCards(
  cards: NormalizedCard[],
  lists: TrelloList[],
  currentListIndex: number,
  searchQuery: string
): NormalizedCard[] {
  const currentList = lists[currentListIndex]
  if (!currentList) return []
  return cards
    .filter(card => card.listId === currentList.id)
    .filter(card => fuzzyMatch(searchQuery, card.name))
}

/**
 * Label color mapping for Trello label colors
 */
export const labelColors: Record<string, string> = {
  green: "#61bd4f",
  yellow: "#f2d600",
  orange: "#ff9f1a",
  red: "#eb5a46",
  purple: "#c377e0",
  blue: "#0079bf",
  sky: "#00c2e0",
  lime: "#51e898",
  pink: "#ff78cb",
  black: "#344563",
}

/**
 * Theme colors for the TUI
 */
export const colors = {
  bg: "#1e1e2e",
  text: "#cdd6f4",
  textDim: "#6c7086",
  border: "#45475a",
  borderFocus: "#f9e2af",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  blue: "#89b4fa",
}

/**
 * Format members as @username strings
 * @param members - Array of member objects
 * @returns Formatted string of @usernames
 */
export function formatMembers(members: { username: string }[]): string {
  return members.map(m => `@${m.username}`).join(" ")
}

/**
 * Calculate checklist progress
 * @param checkItems - Array of checklist items
 * @returns Object with done count and total count
 */
export function getChecklistProgress(
  checkItems: { state: "complete" | "incomplete" }[]
): { done: number; total: number } {
  const done = checkItems.filter(i => i.state === "complete").length
  const total = checkItems.length
  return { done, total }
}

/**
 * Get color for a Trello label
 * @param color - The Trello color name
 * @param fallback - Fallback color if not found
 * @returns Hex color string
 */
export function getLabelColor(color: string, fallback: string = colors.textDim): string {
  return labelColors[color] || fallback
}

/**
 * Truncate text to a maximum length
 * @param text - The text to truncate
 * @param maxLength - Maximum length
 * @param suffix - Suffix to add if truncated (default: "...")
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number, suffix: string = "..."): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}

/**
 * Validate that a string is a valid Trello ID (alphanumeric, typically 24 chars)
 * @param id - The ID to validate
 * @returns true if the ID appears valid
 */
export function isValidTrelloId(id: string): boolean {
  if (!id || typeof id !== "string") return false
  // Trello IDs are typically 24 character alphanumeric strings
  return /^[a-f0-9]{24}$/i.test(id)
}

/**
 * Parse a date string and format it for display
 * @param dateString - ISO date string or undefined
 * @returns Formatted date string or undefined
 */
export function formatDueDate(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return undefined
  }
}

/**
 * Wrap navigation index to stay within bounds
 * @param currentIndex - Current index
 * @param delta - Change amount (+1 or -1)
 * @param length - Total length of array
 * @returns New wrapped index
 */
export function wrapIndex(currentIndex: number, delta: number, length: number): number {
  if (length === 0) return 0
  // Handle large negative deltas by adding enough multiples of length
  const result = (currentIndex + delta) % length
  // Use Math.abs(0) to convert -0 to 0
  return result < 0 ? result + length : (result === 0 ? 0 : result)
}
