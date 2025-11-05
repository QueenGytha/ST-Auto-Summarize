# Summary vs Lorebook Examples

**Purpose:** Comprehensive examples demonstrating the clear separation between `summary` (timeline) and `lorebooks` (detailed entries)

---

## Example 1: Tavern Introduction Scene

### Scene Content:
```
Alice pushed open the heavy wooden door of The Rusty Nail, a dimly lit tavern in the merchant quarter. The smell of ale and pipe smoke filled her nostrils. Behind the bar stood a gruff-looking dwarf with a scarred face and graying beard, polishing a glass with a dirty rag.

"What'll it be?" the dwarf grunted without looking up.

"Information," Alice replied, sliding a gold coin across the bar. "I'm looking for someone who might know about the bandits on the eastern road."

The dwarf's eyes flicked to the coin, then to Alice's face. "Name's Grim. And you're in luck—I hear everything that happens in these parts." He pocketed the coin. "There's a gang operating on the eastern road, led by a bastard called Scarface. Nasty bunch. They've been hitting merchant caravans for the past three weeks."

Alice nodded grimly. "Any idea where they're based?"

"Darkwood Forest, most likely. But I wouldn't go poking around there unless you've got a death wish."
```

### Correct Output:

```json
{
  "summary": "Alice entered The Rusty Nail tavern in merchant quarter. She paid bartender Grim for information about eastern road bandits. Grim revealed gang led by Scarface has been hitting merchant caravans for three weeks. Likely based in Darkwood Forest. Grim warned against investigating.",
  "lorebooks": [
    {
      "name": "The Rusty Nail",
      "type": "location",
      "keywords": ["Rusty Nail", "tavern", "merchant quarter tavern"],
      "content": "Dimly lit tavern in merchant quarter. Heavy wooden door. Smells of ale and pipe smoke. Grim works as bartender. Local information hub."
    },
    {
      "name": "Grim",
      "type": "character",
      "keywords": ["Grim", "bartender", "dwarf bartender"],
      "content": "Dwarf bartender at The Rusty Nail. Gruff demeanor. Scarred face, graying beard. Knows everything happening in the area. Willing to share information for coin. Warned Alice about Darkwood danger."
    },
    {
      "name": "Scarface's Bandit Gang",
      "type": "faction",
      "keywords": ["Scarface", "bandits", "eastern road bandits", "gang"],
      "content": "Bandit gang operating on eastern road. Led by individual called 'Scarface'. Active for at least three weeks. Targeting merchant caravans. Likely based in Darkwood Forest. Described as 'nasty bunch' by local informants."
    },
    {
      "name": "Darkwood Forest",
      "type": "location",
      "keywords": ["Darkwood", "Darkwood Forest", "forest"],
      "content": "Forest region. Suspected base of Scarface's bandit operations. Considered dangerous—Grim described going there as 'death wish'. Location is known but specifics of bandit camp unknown."
    }
  ]
}
```

### Why This Works:

**Summary contains:**
- ✅ Alice went to tavern (event)
- ✅ She asked for information (action)
- ✅ Grim told her about bandits (outcome)
- ✅ Learned about Scarface and gang location (information gain)
- ✅ Received warning (state change: Alice now knows it's dangerous)

**Summary does NOT contain:**
- ❌ Description of the tavern's appearance
- ❌ Description of Grim's appearance
- ❌ Details about the bandits beyond what's needed for timeline

**Lorebooks contain:**
- ✅ The Rusty Nail: Full description with atmosphere and details
- ✅ Grim: Appearance, personality, role, capabilities
- ✅ Scarface's Gang: All known details about the faction
- ✅ Darkwood Forest: Location details and significance

**Lorebooks do NOT contain:**
- ❌ "Alice went to the tavern" (that's timeline)
- ❌ "Grim told Alice about bandits" (that's an event)

---

## Example 2: Combat Scene

### Scene Content:
```
The ambush came without warning. Five figures emerged from the trees—four wielding rusted swords, one hanging back with a crossbow. Alice's hand went to her greatsword as Bob dropped into a defensive stance beside her.

"Scarface sends his regards!" the crossbowman shouted before loosing a bolt.

Alice dodged left, the bolt whistling past her ear. She charged the nearest swordsman, her greatsword cleaving through his guard in one fluid motion. He crumpled. The second barely had time to raise his blade before Alice's follow-through caught him in the chest.

Bob, meanwhile, had produced a throwing knife from somewhere. It buried itself in the crossbowman's shoulder with a meaty thunk. The man screamed and dropped his weapon.

The remaining two swordsmen exchanged a glance, then fled into the forest.

Alice grimaced, feeling warm blood seeping down her left shoulder where a second crossbow bolt had grazed her. "That could've gone worse," she muttered.
```

### Correct Output:

```json
{
  "summary": "Bandits ambushed Alice and Bob on road. Five attackers: four swordsmen, one crossbowman. Alice killed two swordsmen with greatsword. Bob disabled crossbowman with throwing knife to shoulder. Two remaining bandits fled. Alice sustained grazing crossbow wound on left shoulder. Attackers claimed to be sent by Scarface.",
  "lorebooks": [
    {
      "name": "Alice - Combat Style",
      "type": "concept",
      "keywords": ["Alice combat", "Alice fighting", "greatsword technique", "Alice capabilities"],
      "content": "Wields greatsword with lethal skill. Combat style: aggressive, fluid motions. Capable of killing multiple opponents in quick succession. Fast reactions (dodged crossbow bolt). Continues fighting effectively while wounded. Formal training evident in technique."
    },
    {
      "name": "Bob - Combat Style",
      "type": "concept",
      "keywords": ["Bob combat", "Bob fighting", "throwing knives", "Bob capabilities"],
      "content": "Uses throwing knives with precision. Keeps weapons concealed until needed. Accurate at medium range—hit crossbowman's shoulder. Prefers disabling strikes over lethal force. Takes defensive stance when threatened. Tactical fighter."
    },
    {
      "name": "Alice - Current Injury",
      "type": "concept",
      "keywords": ["Alice wounded", "Alice injury", "shoulder wound", "Alice status"],
      "content": "Grazing crossbow wound on left shoulder. Sustained during bandit ambush. Blood seeping from wound but remains functional. Injury didn't prevent her from fighting effectively. Severity: minor to moderate."
    },
    {
      "name": "Scarface - Bandit Activities",
      "type": "concept",
      "keywords": ["Scarface actions", "bandit ambush", "Scarface sends regards"],
      "content": "UPDATE: Scarface ordered ambush on Alice and Bob. Attackers explicitly claimed to be sent by Scarface ('Scarface sends his regards'). Indicates Scarface is aware of Alice and Bob's investigation. Escalation from passive banditry to targeted attacks."
    }
  ]
}
```

### Why This Works:

**Summary contains:**
- ✅ Ambush occurred (event)
- ✅ Composition of attackers (context needed for timeline)
- ✅ Combat outcomes (who did what, results)
- ✅ Alice was wounded (state change)
- ✅ Scarface connection mentioned (plot development)

**Lorebooks contain:**
- ✅ Alice's combat capabilities (how she fights, skills demonstrated)
- ✅ Bob's combat capabilities (his methods, weapons, style)
- ✅ Alice's injury status (detailed condition, severity)
- ✅ Scarface activities (UPDATE to existing entry with new information)

**Note on UPDATES:**
- The Scarface lorebook entry is marked as "UPDATE" because Scarface's bandit gang was already in lorebooks from Example 1
- This entry adds new information: Scarface knows about Alice/Bob and is targeting them
- Combined/merged memories would consolidate this into the existing Scarface entry

---

## Example 3: Revelation and Relationship Change

### Scene Content:
```
"I need to know why you won't tell me who has the Sunblade," Alice said, her voice tight with frustration. They'd set up camp in a small clearing, a safe distance from the road.

Bob was silent for a long moment, staring into the fire. Finally, he spoke. "Because I work for the Shadow Guild."

Alice's hand instinctively went to her sword hilt. "The Shadow Guild? The ones fighting the nobility?"

"The ones fighting corrupt nobility," Bob corrected. "There's a difference. And yes, I know who took the Sunblade because the Guild has been tracking them. But if I tell you, it could expose our entire operation."

Alice's mind raced. The Shadow Guild were criminals by law, but she'd heard rumors that they actually helped common folk against tyrannical lords. "How do I know you're not just using me?"

"You don't," Bob admitted. "But I swear on my life that when the time is right, I'll get you the Sunblade back. I just need a few more days to coordinate with the Guild."

Alice lowered her hand from her sword. "Three days," she said. "You have three days to tell me who took it, or I report you to the city guard."

Bob nodded slowly. "Three days. I can work with that."
```

### Correct Output:

```json
{
  "summary": "At camp, Alice confronted Bob about withholding Sunblade thief information. Bob revealed Shadow Guild membership—organization fighting corrupt nobility. He knows thief's identity through Guild intelligence but cannot reveal it yet without exposing Guild operations. Alice initially reached for sword but lowered it after Bob's explanation. She's torn between duty and sympathy for Guild's anti-corruption goals. They agreed: Bob has three days to reveal thief's identity or Alice reports him to city guard. Alliance formed despite tension.",
  "lorebooks": [
    {
      "name": "Shadow Guild",
      "type": "faction",
      "keywords": ["Shadow Guild", "the Guild", "secret organization", "anti-nobility group"],
      "content": "Secret organization fighting corrupt nobility. Operates outside law but reportedly helps common folk against tyrannical lords. Has intelligence network tracking significant persons and items (including Sunblade thief). Bob is member. Operations must remain covert to function. Alice now knows of their existence."
    },
    {
      "name": "Bob - Shadow Guild Member",
      "type": "concept",
      "keywords": ["Bob secret", "Bob affiliation", "Bob Shadow Guild", "Bob organization", "Bob's guild"],
      "content": "Bob is Shadow Guild member. Membership was previously hidden from Alice and {{user}}, revealed at camp during confrontation. Source of his knowledge about Sunblade thief—Guild has been tracking them. Bob is constrained by Guild secrecy requirements. Must coordinate with Guild before sharing sensitive information. Sworn to help Alice recover Sunblade."
    },
    {
      "name": "Alice & Bob - Alliance Terms",
      "type": "concept",
      "keywords": ["Alice Bob relationship", "alliance", "three day deadline", "cooperation terms"],
      "content": "Fragile alliance formed at camp. Alice agreed to work with Bob despite Guild revelation. Terms: Bob has three days to reveal Sunblade thief's identity, or Alice reports him to city guard. Relationship dynamic: Alice torn between duty (recover Sunblade, uphold law) and sympathy (Guild fights corruption). Trust is conditional and strained. Alice initially reached for weapon but chose cooperation."
    },
    {
      "name": "Sunblade Thief - Knowledge Status",
      "type": "concept",
      "keywords": ["Sunblade thief identity", "who stole Sunblade", "thief information"],
      "content": "Shadow Guild knows Sunblade thief's identity and has been tracking them. Bob has access to this information but hasn't revealed it to Alice or {{user}} yet. Reason: revealing identity could expose Guild operations. Bob promised to share within three days. Thief's actual identity still unknown to Alice and {{user}}."
    },
    {
      "name": "Alice - Internal Conflict",
      "type": "concept",
      "keywords": ["Alice conflict", "Alice dilemma", "Alice duty vs sympathy"],
      "content": "Alice experiencing internal conflict. Duty: recover Sunblade (family trust), uphold law (Shadow Guild are criminals). Sympathy: Shadow Guild fights corrupt nobility, helps common people. Bob's cause resonates with her despite legal/duty obligations. This conflict influenced her decision to give Bob three days rather than immediately reporting him. Represents character development and complexity."
    }
  ]
}
```

### Why This Works:

**Summary contains:**
- ✅ Confrontation happened (event)
- ✅ Bob's revelation (major plot development)
- ✅ Alice's reaction (reached for sword, then lowered it)
- ✅ Negotiation and agreement (three-day deadline)
- ✅ Current state of relationship (fragile alliance)
- ✅ Alice's internal conflict mentioned briefly

**Lorebooks contain:**
- ✅ Shadow Guild: Full description, goals, capabilities, significance
- ✅ Bob's membership: All details about what this means for his character
- ✅ Alliance terms: Detailed relationship dynamic and conditions
- ✅ Sunblade thief knowledge: What's known, what's not, who knows
- ✅ Alice's internal conflict: Depth and nuance of her dilemma

**Key Separation Principle Demonstrated:**
- Summary: "Alice confronted Bob. Bob revealed X. They agreed to Y."
- Lorebooks: "What IS the Shadow Guild? What does Bob's membership MEAN? What is the nature of their alliance? What is Alice feeling?"

---

## Example 4: Discovery Scene

### Scene Content:
```
Behind the waterfall, just as the old map had indicated, was a narrow opening in the rock face. Alice squeezed through, Bob following close behind. Their torches revealed a circular chamber, perhaps twenty feet across, with smooth stone walls.

Ancient murals covered every surface. Faded but still visible, they depicted a great war—armies clashing, cities burning, and at the center of it all, a figure in golden armor wielding a sword that blazed like the sun.

"The First War," Bob breathed. "These must be over a thousand years old."

Alice moved closer to one section of the mural. It showed the golden warrior sealing something away—a darkness, formless and terrifying. "This is the Sunblade," she said, pointing to the blazing sword. "This chamber... it's telling the weapon's origin story."

In an alcove at the back of the chamber sat a stone pedestal, empty save for a thick layer of dust. Bob examined it closely. "Look at the dust pattern. Something was here recently. Something about this size..." He held his hands apart, roughly the length of a sword.

"Someone's been here," Alice said grimly. "Recently."
```

### Correct Output:

```json
{
  "summary": "Alice and Bob found hidden chamber behind waterfall as indicated by old map. Circular stone chamber contained ancient murals depicting the First War and golden warrior wielding sun-like sword. Bob identified murals as over 1000 years old. Murals show Sunblade's origin—used by golden warrior to seal away formless darkness. Empty stone pedestal at chamber back had disturbed dust pattern shaped like sword. Evidence someone removed sword-sized object recently. Alice concluded someone had been there recently.",
  "lorebooks": [
    {
      "name": "Hidden Waterfall Chamber",
      "type": "location",
      "keywords": ["hidden chamber", "waterfall chamber", "secret room", "mural chamber"],
      "content": "Secret chamber behind waterfall, accessible through narrow rock opening. Circular room, approximately 20 feet across. Smooth stone walls. Contains ancient murals covering all surfaces. Stone pedestal in alcove at back. Location was marked on old map Alice and Bob possessed. Recently visited by unknown party who removed sword-sized object."
    },
    {
      "name": "First War Murals",
      "type": "lore",
      "keywords": ["First War", "ancient murals", "war murals", "golden warrior"],
      "content": "Ancient murals over 1000 years old depicting the First War. Show armies clashing, cities burning. Central figure: warrior in golden armor wielding blazing sword (the Sunblade). Murals depict warrior using Sunblade to seal away formless darkness. Provide origin story of the Sunblade. Faded but still visible. Located in hidden waterfall chamber."
    },
    {
      "name": "Sunblade - Origins",
      "type": "lore",
      "keywords": ["Sunblade origin", "Sunblade history", "First War Sunblade", "golden warrior weapon"],
      "content": "UPDATE: Ancient murals reveal Sunblade's origins. Weapon dates back over 1000 years to the First War. Originally wielded by warrior in golden armor. Blazed like sun when active. Used to seal away formless darkness/evil. Murals suggest Sunblade has specific purpose beyond being simple weapon—sealing/banishing darkness. This context adds significance to its theft."
    },
    {
      "name": "Recent Chamber Intrusion",
      "type": "concept",
      "keywords": ["chamber intruder", "stolen from chamber", "dust pattern", "recent visitor"],
      "content": "Someone visited hidden chamber recently (dust disturbance fresh). Removed sword-sized object from stone pedestal—likely the Sunblade itself or related artifact. Intruder knew about chamber's location and significance. Unknown who or when exactly, but recent enough for dust pattern to be clear. May be connected to Sunblade theft from Eastern Ruins temple."
    }
  ]
}
```

### Why This Works:

**Summary contains:**
- ✅ Found chamber (event)
- ✅ What they saw (murals, pedestal)
- ✅ What they learned (Sunblade origin, sealing darkness)
- ✅ Discovery about recent intrusion (dust pattern, empty pedestal)
- ✅ Their conclusions (someone was here recently)

**Lorebooks contain:**
- ✅ Chamber: Full location description, features, access method
- ✅ Murals: Complete description of lore they depict
- ✅ Sunblade origins: Historical context and significance (UPDATE to existing Sunblade entry)
- ✅ Recent intrusion: Analysis of evidence and implications

**Discovery Separation Principle:**
- Summary: "We found X, saw Y, learned Z" (the DISCOVERY event)
- Lorebooks: "What IS X? What does Y depict? What does Z MEAN?" (the DISCOVERED information)

---

## Example 5: Social/Political Scene

### Scene Content:
```
The throne room of Castle Aldenmoor was packed with nobles, all watching as Alice knelt before King Aldric. The king was an imposing figure even in his sixties, with silver hair and keen blue eyes that missed nothing.

"Alice of House Thornwood," the king's voice echoed in the chamber. "You have served your kingdom well. It is time I entrusted you with a matter of grave importance."

He gestured, and a servant brought forth a scroll sealed with the royal crest. "Lord Blackmoor of the eastern provinces has failed to pay tribute for three months. I want you to investigate. Determine if this is rebellion or merely... incompetence."

Alice took the scroll, noting the weight of the king's words. Lord Blackmoor was a powerful noble with substantial military forces. If he was rebelling, it could mean civil war.

"Your Majesty," she said carefully, "if Lord Blackmoor has turned traitor, I will need more than my blade to handle it."

The king smiled thinly. "Which is why I'm also sending Lord Commander Theron and a company of knights. They will meet you at the eastern border. You will lead the investigation."

Alice bowed. "I will not fail you, sire."

As she rose and left the throne room, she caught sight of a familiar face in the crowd—Lady Celeste, the king's advisor, was watching her with an expression Alice couldn't quite read. Approval? Or concern?
```

### Correct Output:

```json
{
  "summary": "Alice summoned to throne room of Castle Aldenmoor before King Aldric and assembled nobles. King assigned her investigation of Lord Blackmoor in eastern provinces—Blackmoor failed to pay tribute for three months. King wants determination if this is rebellion or incompetence. Alice received sealed royal scroll with orders. King assigned Lord Commander Theron and knight company to meet Alice at eastern border; Alice to lead investigation. Mission accepted. Lady Celeste (king's advisor) observed Alice leaving with unreadable expression.",
  "lorebooks": [
    {
      "name": "King Aldric",
      "type": "character",
      "keywords": ["King Aldric", "the king", "His Majesty", "Aldric"],
      "content": "King of the realm. Age: sixties. Silver hair, keen blue eyes. Imposing presence and commanding voice. Trusts Alice enough to assign her sensitive political investigation. Concerned about Lord Blackmoor's tribute failure and potential rebellion. Has authority to mobilize Lord Commander Theron and military forces. Throne room in Castle Aldenmoor."
    },
    {
      "name": "Castle Aldenmoor",
      "type": "location",
      "keywords": ["Castle Aldenmoor", "Aldenmoor", "royal castle", "throne room"],
      "content": "Royal castle and seat of King Aldric's power. Large throne room that can accommodate many nobles. Location of formal royal audiences and assignments. Castle name suggests it may be in Aldenmoor region or is named after ruling family."
    },
    {
      "name": "Lord Blackmoor",
      "type": "character",
      "keywords": ["Lord Blackmoor", "Blackmoor", "eastern provinces lord"],
      "content": "Noble ruling eastern provinces. Powerful figure with substantial military forces. Failed to pay royal tribute for three months—unprecedented and suspicious. Situation serious enough that king suspects either rebellion or major incompetence. If rebelling, could trigger civil war. Alice has been assigned to investigate his status and intentions."
    },
    {
      "name": "Alice - Royal Mission",
      "type": "concept",
      "keywords": ["Alice mission", "Alice investigation", "Blackmoor investigation", "royal assignment"],
      "content": "Alice assigned by King Aldric to investigate Lord Blackmoor's tribute failure. Mission: determine if Blackmoor is rebelling or merely incompetent. Given sealed scroll with royal orders. Alice to lead investigation with support of Lord Commander Theron and knight company at eastern border. High stakes: potential civil war if Blackmoor has turned traitor. Alice accepted mission."
    },
    {
      "name": "Lord Commander Theron",
      "type": "character",
      "keywords": ["Lord Commander Theron", "Theron", "knight commander"],
      "content": "Lord Commander of kingdom's knights. Assigned by King Aldric to support Alice's investigation of Lord Blackmoor. Commands company of knights. Will meet Alice at eastern border. Under Alice's leadership for this mission despite likely higher formal rank—indicates king's trust in Alice."
    },
    {
      "name": "Lady Celeste",
      "type": "character",
      "keywords": ["Lady Celeste", "Celeste", "king's advisor"],
      "content": "Advisor to King Aldric. Present in throne room during Alice's assignment. Watched Alice leave with unreadable expression—either approval or concern. Significance unknown but her attention suggests she has interest in mission outcome or Alice specifically. Role as advisor means she likely influenced or knows details of Alice's assignment."
    },
    {
      "name": "Alice of House Thornwood",
      "type": "concept",
      "keywords": ["Alice background", "House Thornwood", "Alice title", "Alice status"],
      "content": "UPDATE: Alice is member of House Thornwood. Formal noble lineage recognized by King Aldric in throne room address. 'Served kingdom well' per king—has proven track record. Trusted with sensitive political investigation despite it being diplomatic/military matter not just combat mission. Status allows her to operate in noble circles and command troops."
    }
  ]
}
```

### Why This Works:

**Summary contains:**
- ✅ Meeting occurred (event)
- ✅ King's assignment (plot development)
- ✅ Terms of mission (what Alice must do)
- ✅ Support provided (Theron, knights)
- ✅ Alice's acceptance (state change: now has mission)
- ✅ Celeste's observation (potential plot thread)

**Lorebooks contain:**
- ✅ King Aldric: Full character description, personality, authority
- ✅ Castle Aldenmoor: Location details
- ✅ Lord Blackmoor: Character profile, situation, significance
- ✅ Alice's mission: Detailed mission parameters and stakes
- ✅ Lord Commander Theron: Character introduction
- ✅ Lady Celeste: Character introduction with narrative significance
- ✅ Alice's background: UPDATE adding her noble house and status

**Political Scene Principle:**
- Summary: "Meeting happened, mission assigned, terms set, accepted" (EVENTS and DECISIONS)
- Lorebooks: "Who IS the king? Who is Blackmoor? What's at stake? Who is Celeste?" (ENTITIES and CONTEXT)

---

## Common Patterns

### Pattern 1: Character First Introduction

**Summary:** "Alice met [Name]. [Name] said/did [action/information]."

**Lorebook:**
```json
{
  "name": "Character Name",
  "type": "character",
  "keywords": ["name", "title", "role"],
  "content": "Appearance, personality, role, capabilities, significance."
}
```

### Pattern 2: Location Discovery

**Summary:** "They found/arrived at [Location]. [What they observed/did there]."

**Lorebook:**
```json
{
  "name": "Location Name",
  "type": "location",
  "keywords": ["location name", "area", "region"],
  "content": "Description, features, atmosphere, significance, accessibility."
}
```

### Pattern 3: Item Discovery/Acquisition

**Summary:** "They found/acquired/lost [Item]. [Event context]."

**Lorebook:**
```json
{
  "name": "Item Name",
  "type": "item",
  "keywords": ["item name", "object type"],
  "content": "Description, capabilities, significance, current owner/location."
}
```

### Pattern 4: Secret Revealed

**Summary:** "[Who] revealed [secret] to [whom]. [Reaction/consequence]."

**Lorebook:**
```json
{
  "name": "Secret Content",
  "type": "concept",
  "keywords": ["secret topic", "related terms"],
  "content": "Secret details. Known by: [X, Y]. Hidden from: [Z]. Significance and context."
}
```

### Pattern 5: Relationship Change

**Summary:** "[Character A] and [Character B] [became allies/enemies/etc]. [Reason]."

**Lorebook:**
```json
{
  "name": "Character A & Character B - Relationship",
  "type": "concept",
  "keywords": ["A B relationship", "A and B", "alliance/conflict"],
  "content": "Current relationship status. History. Recent changes. Conditions/terms. Emotional dynamic."
}
```

### Pattern 6: Status/State Change

**Summary:** "[Character] became [new status]. [Cause]."

**Lorebook:**
```json
{
  "name": "Character Name - Current Status",
  "type": "concept",
  "keywords": ["character name status", "character condition"],
  "content": "Current state/status. How it changed. Severity/significance. Implications."
}
```

---

## Anti-Patterns (What NOT to Do)

### ❌ Anti-Pattern 1: Detailed Descriptions in Summary

**WRONG:**
```json
{
  "summary": "Alice, a tall warrior woman with flowing red hair and piercing green eyes, entered the dimly lit tavern with its heavy wooden door and smell of ale. The gruff dwarf bartender with a scarred face..."
}
```

**RIGHT:**
```json
{
  "summary": "Alice entered tavern. Dwarf bartender Grim provided information about bandits."
}
```

### ❌ Anti-Pattern 2: Timeline Events in Lorebooks

**WRONG:**
```json
{
  "lorebooks": [
    {
      "name": "The Battle",
      "type": "concept",
      "content": "Alice and Bob fought bandits. Alice killed two, Bob disabled one, two fled."
    }
  ]
}
```

**RIGHT:**
- That information belongs in `summary`, not `lorebooks`
- Lorebooks should have entries for "Alice Combat Capabilities" and "Bob Combat Capabilities" instead

### ❌ Anti-Pattern 3: Redundancy Between Summary and Lorebooks

**WRONG:**
```json
{
  "summary": "Grim is a dwarf bartender with a scarred face who knows everything happening in the area.",
  "lorebooks": [
    {
      "name": "Grim",
      "content": "Dwarf bartender with scarred face. Knows everything happening in area."
    }
  ]
}
```

**RIGHT:**
```json
{
  "summary": "Bartender Grim provided information about bandits.",
  "lorebooks": [
    {
      "name": "Grim",
      "content": "Dwarf bartender. Scarred face. Knows everything happening in area. Willing to share for coin."
    }
  ]
}
```

### ❌ Anti-Pattern 4: Missing Keywords

**WRONG:**
```json
{
  "name": "Shadow Guild",
  "keywords": ["guild"],
  "content": "..."
}
```

**RIGHT:**
```json
{
  "name": "Shadow Guild",
  "keywords": ["Shadow Guild", "the Guild", "secret organization", "anti-nobility"],
  "content": "..."
}
```

### ❌ Anti-Pattern 5: Overly Generic Lorebook Entries

**WRONG:**
```json
{
  "name": "Sword",
  "type": "item",
  "keywords": ["sword"],
  "content": "A sword."
}
```

**RIGHT:**
- Don't create lorebook entries for generic/trivial items
- Only create entries for significant, unique, or plot-relevant items
- If it's not worth remembering later, don't include it

---

## Decision Flowchart

```
Is this information...

├─ About WHAT HAPPENED?
│  ├─ An event? → SUMMARY
│  ├─ A state change? → SUMMARY
│  ├─ An action? → SUMMARY
│  └─ An outcome? → SUMMARY
│
└─ About WHAT SOMETHING IS?
   ├─ A description? → LOREBOOK
   ├─ Background info? → LOREBOOK
   ├─ Characteristics? → LOREBOOK
   └─ Detailed context? → LOREBOOK

Special cases:

├─ Information appears in BOTH forms?
│  └─ Timeline part → SUMMARY
│      Detail part → LOREBOOK
│
├─ Minor/trivial entity?
│  └─ Mention in SUMMARY only
│      No LOREBOOK entry needed
│
└─ UPDATE to existing entity?
   └─ State change → SUMMARY
       Updated details → LOREBOOK (mark as UPDATE)
```

---

## Testing Your Separation

**For any given piece of information, ask:**

1. **Could this be a question about WHAT HAPPENED?**
   - "What did Alice do?" → Summary
   - "What happened in the fight?" → Summary
   - "What did Bob reveal?" → Summary

2. **Could this be a question about WHO/WHAT someone/something IS?**
   - "Who is Grim?" → Lorebook
   - "What is the Shadow Guild?" → Lorebook
   - "What can Alice do in combat?" → Lorebook

3. **Does this information describe a PROCESS or an OUTCOME?**
   - Process: "Alice dodged left, charged, swung her sword..." → NEITHER (too detailed)
   - Outcome: "Alice killed two bandits" → Summary

4. **Would I need this information if [entity] is mentioned 10 scenes later?**
   - Yes → Lorebook
   - No → Don't include, or summary only

5. **Does this help me understand WHAT'S HAPPENING NOW vs WHAT THINGS ARE?**
   - What's happening now → Summary
   - What things are → Lorebook

---

**End of Examples Document**
