export interface JsonSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [k: string]: unknown
}
export interface CoachTool {
  name: string
  kind: 'lookup' | 'memory' | 'proposal'
  description: string
  parameters: JsonSchema
}
export const COACH_SYSTEM: string
export const COACH_TOOLS: CoachTool[]
export function toGemini(s: JsonSchema): JsonSchema
export function ymd(t: number, tz?: string): string
export function memoryText(list: unknown[], tz?: string): string
export function systemText(o: { list: unknown[]; context: string; tz?: string }): string
export const QUICK: {
  pre: { prompt(routine: string, exercises: string[]): string; schema: JsonSchema }
  workout: { prompt(): string; schema: JsonSchema }
  condense: { prompt(transcript: string): string; schema: JsonSchema }
  weekly: { prompt(): string; schema: JsonSchema }
}
export function isPlanning(text: string): boolean
