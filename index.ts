#!/usr/bin/env bun

// Handle --version flag
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log("trello-tui v1.0.0")
  process.exit(0)
}

import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  SelectRenderable,
  SelectRenderableEvents,
  InputRenderable,
  InputRenderableEvents,
  ASCIIFontRenderable,
  t,
  fg,
  bold,
  type KeyEvent,
} from "@opentui/core"
import { getBoardId, setBoard } from "./config"
import type { NormalizedCard, TrelloList, TrelloBoard, TrelloAttachment } from "./trello"

const colors = {
  bg: "#1e1e2e",
  text: "#cdd6f4",
  textDim: "#6c7086",
  border: "#45475a",
  borderFocus: "#f9e2af",
  yellow: "#f9e2af",
  green: "#a6e3a1",
  blue: "#89b4fa",
}

const labelColors: Record<string, string> = {
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

// Create renderer
const renderer = await createCliRenderer({ useMouse: false })
renderer.start()

// Import trello and create client IMMEDIATELY after renderer starts
const trelloModule = await import("./trello")
const trelloClient = trelloModule.createTrelloClient()

async function runMainApp(boardId: string, lists: TrelloList[], cards: NormalizedCard[]) {
  const children = [...renderer.root.getChildren()]
  for (const child of children) {
    renderer.root.remove(child.id)
  }

  let currentListIndex = 0
  let searchQuery = ""
  let activePanel: "list" | "details" = "list"
  let moveModalOpen = false
  let moveModalSelect: SelectRenderable | null = null
  let moveModalOverlay: BoxRenderable | null = null
  let isAnalyzing = false
  let analyzeProcess: ReturnType<typeof Bun.spawn> | null = null
  let selectedAttachmentIndex = 0
  let lastSelectedCardId: string | null = null

  // Helper to check if attachment is an image
  function isImageAttachment(attachment: TrelloAttachment): boolean {
    return attachment.mimeType?.startsWith("image/") || false
  }

  // Helper to get image attachments for a card
  function getImageAttachments(card: NormalizedCard): TrelloAttachment[] {
    return card.attachments?.filter(isImageAttachment) || []
  }

  // Platform-specific open command
  function getOpenCommand(): string {
    const platform = process.platform
    if (platform === "darwin") return "open"
    if (platform === "win32") return "start"
    return "xdg-open"  // Linux and others
  }

  // Fuzzy match - checks if all query chars appear in order
  function fuzzyMatch(query: string, text: string): boolean {
    if (!query) return true
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    let qi = 0
    for (let i = 0; i < lowerText.length && qi < lowerQuery.length; i++) {
      if (lowerText[i] === lowerQuery[qi]) qi++
    }
    return qi === lowerQuery.length
  }

  function getFilteredCards(): NormalizedCard[] {
    const currentList = lists[currentListIndex]
    if (!currentList) return []
    return cards
      .filter(card => card.listId === currentList.id)
      .filter(card => fuzzyMatch(searchQuery, card.name))
  }

  let filteredCards = getFilteredCards()

  // Root container
  const container = new BoxRenderable(renderer, {
    id: "container",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    backgroundColor: colors.bg,
  })

  // Header with ASCII title
  const header = new BoxRenderable(renderer, {
    id: "header",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 1,
    paddingTop: 1,
    backgroundColor: colors.bg,
  })

  const asciiTitle = new ASCIIFontRenderable(renderer, {
    id: "ascii-title",
    text: "SHIMMER",
    font: "tiny",
    color: colors.yellow,
    backgroundColor: colors.bg,
  })
  header.add(asciiTitle)

  // Main content row
  const mainRow = new BoxRenderable(renderer, {
    id: "main-row",
    flexDirection: "row",
    width: "100%",
    flexGrow: 1,
  })

  // Left panel
  const leftPanel = new BoxRenderable(renderer, {
    id: "left-panel",
    width: "40%",
    height: "100%",
    borderStyle: "single",
    borderColor: colors.border,
    flexDirection: "column",
    backgroundColor: colors.bg,
  })

  const tabBar = new BoxRenderable(renderer, {
    id: "tab-bar",
    width: "100%",
    height: 2,
    flexDirection: "row",
    backgroundColor: colors.bg,
    paddingLeft: 1,
    paddingTop: 1,
    gap: 0,
  })

  let tabElements: TextRenderable[] = []

  function buildTabs() {
    // Clear existing tabs
    tabElements.forEach(el => tabBar.remove(el.id))
    tabElements = []

    lists.forEach((list, i) => {
      if (i > 0) {
        const sep = new TextRenderable(renderer, {
          id: `tab-sep-${i}-${Date.now()}`,
          content: t`${fg(colors.textDim)(" · ")}`,
        })
        tabBar.add(sep)
        tabElements.push(sep)
      }

      const tab = new TextRenderable(renderer, {
        id: `tab-${i}-${Date.now()}`,
        content: i === currentListIndex
          ? t`${fg(colors.yellow)(list.name)}`
          : t`${fg(colors.textDim)(list.name)}`,
      })
      tabBar.add(tab)
      tabElements.push(tab)
    })
  }

  buildTabs()

  // Search input
  const searchContainer = new BoxRenderable(renderer, {
    id: "search-container",
    width: "100%",
    height: 2,
    paddingLeft: 1,
    paddingTop: 1,
    backgroundColor: colors.bg,
  })

  const searchInput = new InputRenderable(renderer, {
    id: "search-input",
    width: "90%",
    height: 1,
    placeholder: "search...",
    placeholderColor: colors.textDim,
    textColor: colors.yellow,
    backgroundColor: colors.bg,
    focusedBackgroundColor: colors.bg,
    focusedTextColor: colors.yellow,
    cursorColor: colors.yellow,
  })
  searchContainer.add(searchInput)

  const ticketListContainer = new BoxRenderable(renderer, {
    id: "ticket-list",
    width: "100%",
    flexGrow: 1,
    backgroundColor: colors.bg,
    paddingTop: 1,
  })

  let ticketSelect = new SelectRenderable(renderer, {
    id: "ticket-select",
    width: "100%",
    height: "100%",
    options: filteredCards.map(card => ({ name: card.name, description: "" })),
    selectedBackgroundColor: colors.bg,
    selectedTextColor: colors.yellow,
    textColor: colors.textDim,
    backgroundColor: colors.bg,
    focusedBackgroundColor: colors.bg,
  })
  ticketListContainer.add(ticketSelect)

  leftPanel.add(tabBar)
  leftPanel.add(searchContainer)
  leftPanel.add(ticketListContainer)

  // Right panel
  const rightPanel = new BoxRenderable(renderer, {
    id: "right-panel",
    flexGrow: 1,
    height: "100%",
    borderStyle: "single",
    borderColor: colors.border,
    flexDirection: "column",
    paddingLeft: 1,
    paddingRight: 1,
    paddingTop: 1,
    backgroundColor: colors.bg,
  })

  let detailText: TextRenderable | null = null

  mainRow.add(leftPanel)
  mainRow.add(rightPanel)

  // Footer
  const footer = new BoxRenderable(renderer, {
    id: "footer",
    width: "100%",
    height: 1,
    paddingLeft: 1,
    flexDirection: "row",
  })
  let footerText = new TextRenderable(renderer, {
    id: "footer-text",
    content: t`${fg(colors.textDim)("↑↓")} navigate  ${fg(colors.textDim)("←→")} panels  ${fg(colors.textDim)("tab")} column  ${fg(colors.textDim)("^f")} search  ${fg(colors.textDim)("o")} open  ${fg(colors.textDim)("q")} quit`,
  })
  footer.add(footerText)

  function updateFooter() {
    footer.remove(footerText.id)
    footerText = new TextRenderable(renderer, {
      id: "footer-text-" + Date.now(),
      content: activePanel === "details"
        ? t`${fg(colors.textDim)("↑↓")} attachments  ${fg(colors.textDim)("←→")} panels  ${fg(colors.textDim)("i")} view image  ${fg(colors.textDim)("a")} analyze  ${fg(colors.textDim)("m")} move  ${fg(colors.textDim)("o")} open  ${fg(colors.textDim)("q")} quit`
        : t`${fg(colors.textDim)("↑↓")} navigate  ${fg(colors.textDim)("←→")} panels  ${fg(colors.textDim)("tab")} column  ${fg(colors.textDim)("^f")} search  ${fg(colors.textDim)("o")} open  ${fg(colors.textDim)("q")} quit`,
    })
    footer.add(footerText)
  }

  container.add(header)
  container.add(mainRow)
  container.add(footer)
  renderer.root.add(container)

  // Update panel focus borders
  function updatePanelFocus() {
    leftPanel.borderColor = activePanel === "list" ? colors.borderFocus : colors.border
    rightPanel.borderColor = activePanel === "details" ? colors.borderFocus : colors.border
    updateFooter()
  }

  // Update function - creates multiple text renderables for the detail view
  let detailElements: TextRenderable[] = []

  function updateDetails() {
    // Clear existing elements
    if (detailText) {
      rightPanel.remove(detailText.id)
    }
    detailElements.forEach(el => rightPanel.remove(el.id))
    detailElements = []

    const card = filteredCards[ticketSelect.getSelectedIndex()]

    if (!card) {
      detailText = new TextRenderable(renderer, {
        id: "detail-text-" + Date.now(),
        content: t`${fg(colors.textDim)("No tickets")}`,
      })
      rightPanel.add(detailText)
      lastSelectedCardId = null
      return
    }

    // Reset attachment selection when switching cards
    if (card.id !== lastSelectedCardId) {
      selectedAttachmentIndex = 0
      lastSelectedCardId = card.id
    }

    // Title - bold and yellow with marker
    const titleEl = new TextRenderable(renderer, {
      id: "detail-title-" + Date.now(),
      content: t`${fg(colors.yellow)("■")} ${bold(fg(colors.yellow)(card.name))}\n`,
    })
    rightPanel.add(titleEl)
    detailElements.push(titleEl)

    // Show analyzing indicator
    if (isAnalyzing) {
      const analyzingEl = new TextRenderable(renderer, {
        id: "detail-analyzing-" + Date.now(),
        content: t`${fg(colors.blue)("⟳ Analyzing with Claude...")} ${fg(colors.textDim)("(esc to cancel)")}\n`,
      })
      rightPanel.add(analyzingEl)
      detailElements.push(analyzingEl)
    }

    // Labels with colors - create a container row for labels
    if (card.labels?.length) {
      const labelsContainer = new BoxRenderable(renderer, {
        id: "detail-labels-container-" + Date.now(),
        width: "100%",
        height: 1,
        flexDirection: "row",
        gap: 1,
      })
      for (const label of card.labels) {
        const color = labelColors[label.color] || colors.textDim
        const labelEl = new TextRenderable(renderer, {
          id: `detail-label-${label.id}-${Date.now()}`,
          content: t`${fg(color)(`[${label.name}]`)} `,
        })
        labelsContainer.add(labelEl)
      }
      rightPanel.add(labelsContainer)
      detailElements.push(labelsContainer as unknown as TextRenderable)
    }

    // Members
    if (card.members?.length) {
      const membersEl = new TextRenderable(renderer, {
        id: "detail-members-" + Date.now(),
        content: t`${fg(colors.blue)(card.members.map(m => `@${m.username}`).join(" "))}\n`,
      })
      rightPanel.add(membersEl)
      detailElements.push(membersEl)
    }

    // Due date
    if (card.dueDate) {
      const dueEl = new TextRenderable(renderer, {
        id: "detail-due-" + Date.now(),
        content: t`${fg(colors.yellow)(`Due: ${card.dueDate}`)}\n`,
      })
      rightPanel.add(dueEl)
      detailElements.push(dueEl)
    }

    // Checklists
    if (card.checklists?.length) {
      for (const checklist of card.checklists) {
        const done = checklist.checkItems.filter(i => i.state === "complete").length
        const total = checklist.checkItems.length

        const checklistEl = new TextRenderable(renderer, {
          id: `detail-checklist-${checklist.id}-${Date.now()}`,
          content: t`\n${fg(colors.text)(`☐ ${checklist.name}`)} ${fg(colors.textDim)(`(${done}/${total})`)}`,
        })
        rightPanel.add(checklistEl)
        detailElements.push(checklistEl)

        for (const item of checklist.checkItems.slice(0, 5)) {
          const icon = item.state === "complete" ? "✓" : "○"
          const color = item.state === "complete" ? colors.green : colors.textDim
          const itemEl = new TextRenderable(renderer, {
            id: `detail-item-${item.id}-${Date.now()}`,
            content: t`\n${fg(color)(`  ${icon} ${item.name}`)}`,
          })
          rightPanel.add(itemEl)
          detailElements.push(itemEl)
        }
        if (checklist.checkItems.length > 5) {
          const moreEl = new TextRenderable(renderer, {
            id: `detail-more-${checklist.id}-${Date.now()}`,
            content: t`\n${fg(colors.textDim)(`  ... and ${checklist.checkItems.length - 5} more`)}`,
          })
          rightPanel.add(moreEl)
          detailElements.push(moreEl)
        }
      }
    }

    // Attachments
    if (card.attachments?.length) {
      const imageAttachments = getImageAttachments(card)
      const otherAttachments = card.attachments.filter(a => !isImageAttachment(a))

      // Reset attachment index if out of bounds
      if (selectedAttachmentIndex >= card.attachments.length) {
        selectedAttachmentIndex = 0
      }

      const attachLabel = new TextRenderable(renderer, {
        id: "detail-attach-label-" + Date.now(),
        content: t`\n${fg(colors.textDim)("Attachments")} ${fg(colors.textDim)(`(${card.attachments.length})`)}`,
      })
      rightPanel.add(attachLabel)
      detailElements.push(attachLabel)

      // Show image attachments with selection indicator
      if (imageAttachments.length > 0) {
        const imgLabel = new TextRenderable(renderer, {
          id: "detail-img-label-" + Date.now(),
          content: t`${fg(colors.blue)(`  📷 Images (${imageAttachments.length}):`)}`,
        })
        rightPanel.add(imgLabel)
        detailElements.push(imgLabel)

        imageAttachments.forEach((attachment, idx) => {
          const globalIdx = card.attachments!.indexOf(attachment)
          const isSelected = activePanel === "details" && globalIdx === selectedAttachmentIndex
          const prefix = isSelected ? fg(colors.yellow)("▸ ") : "  "
          const nameColor = isSelected ? colors.yellow : colors.text
          const attachEl = new TextRenderable(renderer, {
            id: `detail-img-${attachment.id}-${Date.now()}`,
            content: t`  ${prefix}${fg(nameColor)(attachment.name)}${isSelected ? fg(colors.textDim)(" [i: open]") : ""}`,
          })
          rightPanel.add(attachEl)
          detailElements.push(attachEl)
        })
      }

      // Show other attachments
      if (otherAttachments.length > 0) {
        const otherLabel = new TextRenderable(renderer, {
          id: "detail-other-label-" + Date.now(),
          content: t`${fg(colors.blue)(`  📎 Files (${otherAttachments.length}):`)}`,
        })
        rightPanel.add(otherLabel)
        detailElements.push(otherLabel)

        otherAttachments.forEach((attachment, idx) => {
          const globalIdx = card.attachments!.indexOf(attachment)
          const isSelected = activePanel === "details" && globalIdx === selectedAttachmentIndex
          const prefix = isSelected ? fg(colors.yellow)("▸ ") : "  "
          const nameColor = isSelected ? colors.yellow : colors.text
          const attachEl = new TextRenderable(renderer, {
            id: `detail-attach-${attachment.id}-${Date.now()}`,
            content: t`  ${prefix}${fg(nameColor)(attachment.name)}${isSelected ? fg(colors.textDim)(" [i: open]") : ""}`,
          })
          rightPanel.add(attachEl)
          detailElements.push(attachEl)
        })
      }
    }

    // Description with border
    if (card.description) {
      const descLabel = new TextRenderable(renderer, {
        id: "detail-desc-label-" + Date.now(),
        content: t`\n${fg(colors.textDim)("Description")}`,
      })
      rightPanel.add(descLabel)
      detailElements.push(descLabel)

      const descBox = new BoxRenderable(renderer, {
        id: "detail-desc-box-" + Date.now(),
        width: "100%",
        borderStyle: "single",
        borderColor: colors.border,
        backgroundColor: colors.bg,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
      })
      const descText = new TextRenderable(renderer, {
        id: "detail-desc-text-" + Date.now(),
        content: t`${fg(colors.text)(card.description)}`,
      })
      descBox.add(descText)
      rightPanel.add(descBox)
      detailElements.push(descBox as unknown as TextRenderable)
    }

    detailText = null
  }

  // Move modal functions
  function showMoveModal() {
    const card = filteredCards[ticketSelect.getSelectedIndex()]
    if (!card) return

    moveModalOpen = true

    // Create overlay
    moveModalOverlay = new BoxRenderable(renderer, {
      id: "move-modal-overlay-" + Date.now(),
      position: "absolute",
      width: "100%",
      height: "100%",
      backgroundColor: "#00000088",
      justifyContent: "center",
      alignItems: "center",
    })

    // Modal box
    const modalBox = new BoxRenderable(renderer, {
      id: "move-modal-box-" + Date.now(),
      width: 36,
      backgroundColor: colors.bg,
      borderStyle: "single",
      borderColor: colors.borderFocus,
      flexDirection: "column",
      paddingLeft: 2,
      paddingRight: 2,
      paddingTop: 1,
      paddingBottom: 1,
    })

    const modalTitle = new TextRenderable(renderer, {
      id: "move-modal-title-" + Date.now(),
      content: t`${fg(colors.yellow)("Move to list")}`,
    })
    modalBox.add(modalTitle)

    // Spacer
    const spacer = new BoxRenderable(renderer, {
      id: "move-modal-spacer-" + Date.now(),
      width: "100%",
      height: 1,
    })
    modalBox.add(spacer)

    moveModalSelect = new SelectRenderable(renderer, {
      id: "move-modal-select-" + Date.now(),
      width: "100%",
      height: lists.length,
      options: lists.map(list => ({
        name: list.id === card.listId ? `${list.name} (current)` : list.name,
        description: "",
        value: list.id,
      })),
      selectedBackgroundColor: colors.bg,
      selectedTextColor: colors.yellow,
      textColor: colors.text,
      backgroundColor: colors.bg,
      focusedBackgroundColor: colors.bg,
    })
    modalBox.add(moveModalSelect)

    // Spacer before hint
    const spacer2 = new BoxRenderable(renderer, {
      id: "move-modal-spacer2-" + Date.now(),
      width: "100%",
      height: 1,
    })
    modalBox.add(spacer2)

    const modalHint = new TextRenderable(renderer, {
      id: "move-modal-hint-" + Date.now(),
      content: t`${fg(colors.textDim)("enter")} move  ${fg(colors.textDim)("esc")} cancel`,
    })
    modalBox.add(modalHint)

    moveModalOverlay.add(modalBox)
    renderer.root.add(moveModalOverlay)
    moveModalSelect.focus()
  }

  function closeMoveModal() {
    if (moveModalOverlay) {
      renderer.root.remove(moveModalOverlay.id)
      moveModalOverlay = null
      moveModalSelect = null
    }
    moveModalOpen = false
  }

  async function executeMove() {
    const card = filteredCards[ticketSelect.getSelectedIndex()]
    if (!card || !moveModalSelect) return

    const selectedIdx = moveModalSelect.getSelectedIndex()
    const targetList = lists[selectedIdx]
    if (!targetList || targetList.id === card.listId) {
      closeMoveModal()
      return
    }

    try {
      await trelloClient.moveCard(card.id, targetList.id)
      // Update local state
      card.listId = targetList.id
      closeMoveModal()
      // Refresh view - card moved to different list
      updateColumn()
    } catch (err) {
      closeMoveModal()
    }
  }

  // AI analyze function
  async function analyzeWithAI() {
    const card = filteredCards[ticketSelect.getSelectedIndex()]
    if (!card || isAnalyzing) return

    isAnalyzing = true
    updateDetails() // Show analyzing state

    const imageAttachments = getImageAttachments(card)
    const tempFiles: string[] = []

    try {
      // Download image attachments to temp files
      if (imageAttachments.length > 0) {
        const os = await import("os")
        const fs = await import("fs")
        const path = await import("path")
        const tmpDir = os.tmpdir()

        for (const attachment of imageAttachments) {
          try {
            const response = await fetch(attachment.url)
            if (response.ok) {
              const buffer = await response.arrayBuffer()
              const ext = attachment.name.split('.').pop() || 'png'
              const tmpPath = path.join(tmpDir, `trello-attachment-${attachment.id}.${ext}`)
              fs.writeFileSync(tmpPath, Buffer.from(buffer))
              tempFiles.push(tmpPath)
            }
          } catch {
            // Skip failed downloads
          }
        }
      }

      const imageContext = imageAttachments.length > 0
        ? `\n\n**Attached Images (${imageAttachments.length}):**\n${imageAttachments.map(a => `- ${a.name}`).join('\n')}\n\nIMPORTANT: Analyze the attached images carefully. They may contain screenshots, error messages, UI mockups, or other visual information relevant to this task.`
        : ""

      const prompt = `Describe what you see in the attached image(s). Be specific about any UI elements, text, errors, or visual details you can observe.`

      // Build command with image files
      const claudeArgs = ["-p", prompt]
      for (const tmpFile of tempFiles) {
        claudeArgs.push(tmpFile)
      }

      // Use Bun's subprocess API
      const proc = Bun.spawn(["claude", ...claudeArgs], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      })
      analyzeProcess = proc

      // Timeout after 3 minutes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill()
          reject(new Error("Analysis timed out after 3 minutes"))
        }, 3 * 60 * 1000)
      })

      const resultPromise = (async () => {
        const exitCode = await proc.exited
        const stdout = await new Response(proc.stdout).text()
        const stderr = await new Response(proc.stderr).text()

        if (exitCode === 0) {
          return stdout
        } else {
          throw new Error(stderr || `Claude exited with code ${exitCode}`)
        }
      })()

      const result = await Promise.race([resultPromise, timeoutPromise])
      analyzeProcess = null

      // Build new description
      const timestamp = new Date().toLocaleString()
      const newDescription = `${card.description || ""}

---
## AI Analysis (${timestamp})

${result.trim()}
`

      // Update Trello
      await trelloClient.updateCardDescription(card.id, newDescription)

      // Update local state
      card.description = newDescription

    } catch (err) {
      // Show error in description temporarily
      card.description = `${card.description || ""}\n\n---\n⚠️ AI Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`
    } finally {
      // Clean up temp files
      try {
        const fs = await import("fs")
        for (const tmpFile of tempFiles) {
          try { fs.unlinkSync(tmpFile) } catch {}
        }
      } catch {}
    }

    isAnalyzing = false
    updateDetails()
  }

  function cancelAnalysis() {
    if (analyzeProcess) {
      analyzeProcess.kill()
      analyzeProcess = null
    }
    isAnalyzing = false
    updateDetails()
  }

  function updateColumn() {
    // Update filtered cards
    filteredCards = getFilteredCards()

    // Update tabs
    buildTabs()

    // Update ticket list
    ticketListContainer.remove(ticketSelect.id)
    ticketSelect = new SelectRenderable(renderer, {
      id: "ticket-select-" + Date.now(),
      width: "100%",
      height: "100%",
      options: filteredCards.map(card => ({ name: card.name, description: "" })),
      selectedBackgroundColor: colors.bg,
      selectedTextColor: colors.yellow,
      textColor: colors.textDim,
      backgroundColor: colors.bg,
      focusedBackgroundColor: colors.bg,
    })
    ticketListContainer.add(ticketSelect)
    ticketSelect.on(SelectRenderableEvents.SELECTION_CHANGED, updateDetails)
    ticketSelect.focus()

    updateDetails()
  }

  // Listen for selection changes
  ticketSelect.on(SelectRenderableEvents.SELECTION_CHANGED, updateDetails)

  // Search input handler
  function updateSearch() {
    searchQuery = searchInput.value
    filteredCards = getFilteredCards()

    // Update ticket list
    ticketListContainer.remove(ticketSelect.id)
    ticketSelect = new SelectRenderable(renderer, {
      id: "ticket-select-" + Date.now(),
      width: "100%",
      height: "100%",
      options: filteredCards.map(card => ({ name: card.name, description: "" })),
      selectedBackgroundColor: colors.bg,
      selectedTextColor: colors.yellow,
      textColor: colors.textDim,
      backgroundColor: colors.bg,
      focusedBackgroundColor: colors.bg,
    })
    ticketListContainer.add(ticketSelect)
    ticketSelect.on(SelectRenderableEvents.SELECTION_CHANGED, updateDetails)

    updateDetails()
  }

  searchInput.on(InputRenderableEvents.INPUT, updateSearch)

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Handle modal keys first
    if (moveModalOpen) {
      if (key.name === "escape") {
        closeMoveModal()
        return
      }
      if (key.name === "return") {
        executeMove()
        return
      }
      // Let the modal select handle j/k navigation
      return
    }

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      process.exit(0)
    }

    // Ctrl+F to focus search
    if (key.ctrl && key.name === "f" && !searchInput.focused) {
      searchInput.focus()
      return
    }

    // Escape handling
    if (key.name === "escape") {
      if (isAnalyzing) {
        cancelAnalysis()
        return
      }
      if (searchInput.focused) {
        searchInput.value = ""
        searchQuery = ""
        updateSearch()
        ticketSelect.focus()
      } else if (activePanel === "details") {
        activePanel = "list"
        updatePanelFocus()
        ticketSelect.focus()
      }
      return
    }

    // Enter from search to focus list
    if (key.name === "return" && searchInput.focused) {
      ticketSelect.focus()
      return
    }

    // Enter to go to details panel (when in list)
    if (key.name === "return" && activePanel === "list" && !searchInput.focused) {
      activePanel = "details"
      ticketSelect.blur()
      updatePanelFocus()
      return
    }

    // 'h' or left arrow to go back to list
    if ((key.name === "h" || key.name === "left") && activePanel === "details") {
      activePanel = "list"
      updatePanelFocus()
      ticketSelect.focus()
      return
    }

    // 'l' or right arrow to go to details
    if ((key.name === "l" || key.name === "right") && activePanel === "list" && !searchInput.focused) {
      activePanel = "details"
      ticketSelect.blur()
      updatePanelFocus()
      return
    }

    // 'o' to open URL (from any panel)
    if (key.name === "o" && !searchInput.focused) {
      const card = filteredCards[ticketSelect.getSelectedIndex()]
      if (card?.url) {
        import("child_process").then(cp => cp.exec(`${getOpenCommand()} "${card.url}"`))
      }
      return
    }

    // 'm' to move card (in details panel)
    if (key.name === "m" && activePanel === "details") {
      showMoveModal()
      return
    }

    // 'a' to analyze with AI (in details panel)
    if (key.name === "a" && activePanel === "details" && !isAnalyzing) {
      analyzeWithAI()
      return
    }

    // 'i' to open selected attachment (in details panel)
    if (key.name === "i" && activePanel === "details") {
      const card = filteredCards[ticketSelect.getSelectedIndex()]
      if (card?.attachments?.length) {
        const attachment = card.attachments[selectedAttachmentIndex]
        if (attachment?.url) {
          import("child_process").then(cp => cp.exec(`${getOpenCommand()} "${attachment.url}"`))
        }
      }
      return
    }

    // Up/Down or j/k to navigate attachments (in details panel)
    if ((key.name === "up" || key.name === "k") && activePanel === "details") {
      const card = filteredCards[ticketSelect.getSelectedIndex()]
      if (card?.attachments?.length) {
        selectedAttachmentIndex = Math.max(0, selectedAttachmentIndex - 1)
        updateDetails()
      }
      return
    }
    if ((key.name === "down" || key.name === "j") && activePanel === "details") {
      const card = filteredCards[ticketSelect.getSelectedIndex()]
      if (card?.attachments?.length) {
        selectedAttachmentIndex = Math.min(card.attachments.length - 1, selectedAttachmentIndex + 1)
        updateDetails()
      }
      return
    }

    // Tab to switch columns (only in list panel)
    if (key.name === "tab" && !searchInput.focused && activePanel === "list") {
      if (key.shift) {
        currentListIndex = (currentListIndex - 1 + lists.length) % lists.length
      } else {
        currentListIndex = (currentListIndex + 1) % lists.length
      }
      updateColumn()
    }
  })

  ticketSelect.focus()
  updatePanelFocus()
  updateDetails()
}

// Board selector for first run
async function selectBoard(boards: TrelloBoard[]): Promise<TrelloBoard> {
  return new Promise((resolve) => {
    const container = new BoxRenderable(renderer, {
      id: "board-selector",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      backgroundColor: colors.bg,
      paddingTop: 2,
      paddingLeft: 2,
    })

    const title = new TextRenderable(renderer, {
      id: "board-title",
      content: t`${fg(colors.yellow)("Select a Trello board:")}\n`,
    })
    container.add(title)

    const boardSelect = new SelectRenderable(renderer, {
      id: "board-select",
      width: "50%",
      height: boards.length,
      options: boards.map(b => ({ name: b.name, description: "" })),
      selectedBackgroundColor: colors.bg,
      selectedTextColor: colors.yellow,
      textColor: colors.text,
      backgroundColor: colors.bg,
      focusedBackgroundColor: colors.bg,
    })
    container.add(boardSelect)

    const hint = new TextRenderable(renderer, {
      id: "board-hint",
      content: t`\n${fg(colors.textDim)("Enter to select · q to quit")}`,
    })
    container.add(hint)

    renderer.root.add(container)
    boardSelect.focus()

    renderer.keyInput.on("keypress", (key: KeyEvent) => {
      if (key.name === "q") {
        renderer.destroy()
        process.exit(0)
      }
      if (key.name === "return") {
        const selected = boards[boardSelect.getSelectedIndex()]
        if (selected) {
          renderer.root.remove(container.id)
          resolve(selected)
        }
      }
    })
  })
}

// Main
async function main() {
  let boardId = getBoardId()

  if (!boardId) {
    const boards = await trelloClient.getBoards()
    if (boards.length === 0) {
      renderer.destroy()
      console.error("No Trello boards found for this account.")
      process.exit(1)
    }
    const selected = await selectBoard(boards)
    setBoard(selected.id, selected.name)
    boardId = selected.id
  }

  const [lists, cards] = await Promise.all([
    trelloClient.getLists(boardId),
    trelloClient.getCards(boardId),
  ])
  await runMainApp(boardId, lists, cards)
}

main().catch(err => {
  try { renderer.destroy() } catch {}
  console.error("Error:", err.message)
  process.exit(1)
})
