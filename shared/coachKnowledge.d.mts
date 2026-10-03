export const KNOWLEDGE_CORE: string
export const KNOWLEDGE: Record<string, string>
export const KNOWLEDGE_TOPICS: string[]
export function knowledgeLookup(query: string): string
export function searchLibrary(items: unknown[], query: string, max?: number): string
