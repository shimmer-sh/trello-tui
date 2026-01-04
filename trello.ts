// Trello API Client

interface TrelloLabel {
  id: string
  name: string
  color: string
}

interface TrelloMember {
  id: string
  fullName: string
  username: string
  initials: string
}

interface TrelloChecklist {
  id: string
  name: string
  checkItems: { id: string; name: string; state: "complete" | "incomplete" }[]
}

interface TrelloCard {
  id: string
  name: string
  desc: string
  idList: string
  labels: TrelloLabel[]
  due?: string
  url: string
  members?: TrelloMember[]
  checklists?: TrelloChecklist[]
}

export interface TrelloList {
  id: string
  name: string
  idBoard: string
}

export interface TrelloBoard {
  id: string
  name: string
}

export interface NormalizedCard {
  id: string
  name: string
  description: string
  listId: string
  labels: TrelloLabel[]
  dueDate?: string
  url: string
  members: TrelloMember[]
  checklists: TrelloChecklist[]
}

const TRELLO_API_BASE = "https://api.trello.com/1"

export class TrelloClient {
  private apiKey: string
  private token: string

  constructor() {
    const apiKey = process.env.TRELLO_API_KEY
    const token = process.env.TRELLO_TOKEN

    if (!apiKey || !token) {
      throw new Error(
        "Missing Trello credentials. Please set TRELLO_API_KEY and TRELLO_TOKEN.\n" +
          "Get your API key from: https://trello.com/app-key\n" +
          "Then run the app to get a token URL."
      )
    }

    this.apiKey = apiKey
    this.token = token
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${TRELLO_API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}key=${this.apiKey}&token=${this.token}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Trello API error: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  // Get all boards for the authenticated user
  async getBoards(): Promise<TrelloBoard[]> {
    return this.fetch<TrelloBoard[]>("/members/me/boards?fields=id,name")
  }

  // Get lists for a board
  async getLists(boardId: string): Promise<TrelloList[]> {
    return this.fetch<TrelloList[]>(`/boards/${boardId}/lists?fields=id,name,idBoard`)
  }

  // Get cards for a board or list
  async getCards(boardId: string, listId?: string): Promise<NormalizedCard[]> {
    const endpoint = listId
      ? `/lists/${listId}/cards?fields=id,name,desc,idList,due,url,labels&members=true&member_fields=id,fullName,username,initials&checklists=all`
      : `/boards/${boardId}/cards?fields=id,name,desc,idList,due,url,labels&members=true&member_fields=id,fullName,username,initials&checklists=all`

    const cards = await this.fetch<TrelloCard[]>(endpoint)

    return cards.map(card => ({
      id: card.id,
      name: card.name,
      description: card.desc,
      listId: card.idList,
      labels: card.labels || [],
      dueDate: card.due ? new Date(card.due).toLocaleDateString() : undefined,
      url: card.url,
      members: card.members || [],
      checklists: card.checklists || [],
    }))
  }

  // Move a card to a different list
  async moveCard(cardId: string, toListId: string): Promise<void> {
    const url = `${TRELLO_API_BASE}/cards/${cardId}?idList=${toListId}&key=${this.apiKey}&token=${this.token}`
    const response = await fetch(url, { method: "PUT" })

    if (!response.ok) {
      throw new Error(`Failed to move card: ${response.status} ${response.statusText}`)
    }
  }

  // Update a card's description
  async updateCardDescription(cardId: string, description: string): Promise<void> {
    const url = `${TRELLO_API_BASE}/cards/${cardId}?key=${this.apiKey}&token=${this.token}`
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desc: description }),
    })

    if (!response.ok) {
      throw new Error(`Failed to update card: ${response.status} ${response.statusText}`)
    }
  }
}

export function createTrelloClient(): TrelloClient {
  return new TrelloClient()
}
