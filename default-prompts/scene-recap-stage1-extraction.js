export const scene_recap_stage1_extraction_prompt = `TASK: Extract what an LLM would need to continue this story consistently.

After this scene is gone from context, what must remain for the story to feel continuous?

EXTRACT:
- What happened (events, decisions, revelations, changes)
- Who was involved and how they relate (specific dynamics, not labels)
- Words that carry weight (oaths, confessions, threats, jokes that define character) - keep exact wording with speaker and context
- Facts and numbers that characters care about (if they discussed it, it matters to them)
- Conditions that would cause contradictions if forgotten
- Unresolved threads (problems raised, questions unanswered, threats looming)

LEVEL OF DETAIL:
Capture SUBSTANCE - the specific dynamics, concrete facts, what makes interactions unique.

NOT labels: "trust deepened" / "they grew closer" / "tension increased"
These tell the LLM nothing. What SPECIFICALLY happened?

NOT transcript: blow-by-blow action sequences, every line of dialogue
This wastes tokens on sequence instead of meaning.

YES substance: The specific dynamic. The concrete fact. What makes THIS relationship or situation different from a generic one.

For quotes: Keep exact wording only when the words themselves matter (will be referenced later, reveal character, establish commitment). Include who said it, to whom, and brief context for why it matters.

OUTPUT (JSON):
{
  "sn": "brief scene title",
  "extracted": [
    "Each meaningful piece of content as its own item",
    "CharacterName: what they did/said/revealed and why it matters",
    "Quote with context when wording matters",
    "Facts/numbers/status that characters focused on",
    "Relationship dynamics with SPECIFIC details not labels"
  ]
}

SCENE:
<SCENE>
{{scene_messages}}
</SCENE>

Output JSON only.`;
