// Which model answers a coach request, and who pays for it.
//
// The owner picks the model and effort in the app (or "auto": Opus for planning, Sonnet otherwise).
// Everyone else gets the model and effort set for them in Settings → People, within a monthly
// budget; past it, answers come from the cheapest model until the month turns. Opus planning
// sessions are a separate allowance: a person taps "Plan with Opus" and that conversation runs on
// Opus until its cost cap. Without ANTHROPIC_API_KEY everything stays on Gemini, as before.
import { CHEAPEST, EFFORTS, MODELS, claudeEnabled } from './claude.mjs'
import { isPlanning } from '../shared/coachSpec.mjs'

const live = (body) => String(body?.context || '').includes('WORKOUT IN PROGRESS')

/**
 * kind: 'chat' | 'quick' | 'weekly'. Returns { provider, key, effort, notice, charge(usd, model) }.
 */
export function coachRoute(accounts, userId, kind, body = {}) {
  if (!claudeEnabled()) return { provider: 'gemini', charge() {} }
  const plan = accounts.coachPlan(userId)
  let key = MODELS[plan.model] ? plan.model : 'sonnet'
  let effort = EFFORTS.includes(plan.effort) ? plan.effort : 'low'
  let opusSession = null
  let notice = ''
  const last = Array.isArray(body.messages) ? String(body.messages.at(-1)?.content || '') : ''

  if (plan.admin) {
    const wish = String(body.model || 'auto')
    if (MODELS[wish]) key = wish
    else key = kind === 'chat' && isPlanning(last) && !live(body) ? 'opus' : 'sonnet'
    effort = EFFORTS.includes(body.effort) ? body.effort : key === 'opus' ? 'medium' : 'low'
  } else {
    const overBudget = plan.budget >= 0 && plan.budgetSpent >= plan.budget
    if (kind === 'chat' && body.opus && key !== 'opus') {
      const s = accounts.opusSession(userId, body.opus)
      if (s.ok) {
        key = 'opus'
        effort = 'medium'
        opusSession = String(body.opus)
      } else notice = s.reason === 'cap' ? 'This planning session has reached its limit, so the coach is back on your usual model. Start a new one to keep planning with Opus.' : `You’ve used this month’s ${plan.opus === 1 ? 'Opus planning session' : `${plan.opus} Opus planning sessions`}, so this one is on your usual model.`
    }
    if (!opusSession && overBudget) {
      key = CHEAPEST
      effort = 'low'
      if (kind === 'chat') notice ||= 'You’ve used this month’s coach budget, so answers come from a lighter model until next month.'
    }
  }
  // Quick structured calls (targets, takeaways) don't need Opus.
  if (kind === 'quick' && key === 'opus') key = 'sonnet'
  if (kind === 'quick') effort = 'low'
  return {
    provider: 'claude',
    key,
    effort,
    notice,
    opus: !!opusSession,
    charge: (usd, servedBy) => accounts.coachSpend(userId, Object.values(MODELS).find((m) => m.id === servedBy)?.id || MODELS[key].id, usd, opusSession),
  }
}
