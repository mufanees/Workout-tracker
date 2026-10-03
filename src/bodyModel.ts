// The weight model (src/weightModel.ts) on your data, recomputed when weigh-ins, fasts or the target change.
import { computed } from '@preact/signals'
import { bodyWeights, fasts, settings } from './store'
import { weightModel } from './weightModel'

export const bodyModel = computed(() => weightModel({ list: bodyWeights.value, fasts: fasts.value, target: settings.value.weightGoal ?? null }))
