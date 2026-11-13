export const name = 'agent-loadout-workflow'
export const inject = ['systemPrompt']

const sections = {
  evidence: `When work reaches a recommendation, verification or submission based on evidence, first compare each material claim to an actual source. Distinguish verified sources, self-reported statements, inferences and missing evidence. A URL alone is not verification. For recruiting use only job-relevant evidence and keep private candidate details out of public search.
If a material claim lacks evidence, pause before finalizing or submitting the affected recommendation. Present the claim, what is missing and why it matters. Use the native ask_user_question tool with one question and the following three choices (translate them into the user's language): Continue gathering evidence / Lower the recommendation to a qualified draft / Pause submission. Follow the choice without assuming authorization for any external submission. If no choice is available, leave the affected item pending and ask in the conversation. Skip this checkpoint when there is no material evidence gap.`,
  review: `When the requested deliverable is ready and there is a distinct handoff, approval or submission step, show a concise draft or preview before that step. Ask via ask_user_question whether to proceed with the handoff or revise the draft, translating the choices into the user's language. On revision, ask for or incorporate specific feedback. On confirmation, use only actions and destinations already authorized by the user. Keep the item as a draft if confirmation is absent. Evidence decisions and draft approval are separate decisions when both apply.`,
}

export function apply(ctx, { id }) {
  const instructions = sections[id]
  if (!instructions) throw new Error('Unknown Agent loadout workflow: ' + id)
  ctx.systemPrompt.section({
    name: 'agent-loadout:' + id,
    order: 9700,
    text: instructions,
    interpolate: false,
  })
}
