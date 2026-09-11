export async function fakeSuggestionProvider(_text: string) {
  return { output: { title: 'Plan a garden', type: 'project', targetId: null }, model: { provider: 'fake', name: 'deterministic-v1' } };
}
