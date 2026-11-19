# 2D Dark Fantasy ARPG — Sequential Implementation Prompts for Codex

Use these prompts **in order**. Each prompt assumes the previous prompts were completed and the repository is in a runnable state.

The goal is to build a large 2D dark-fantasy ARPG with Diablo-style mouse controls, procedural wilderness and dungeons, persistent cities, six classes, loot progression, quests, bosses, crafting, talents, economy, and future multiplayer compatibility.

---

# Global Rules for Every Prompt

Apply these rules during every implementation task:

1. Inspect the existing repository before changing anything.
2. Reuse existing systems instead of duplicating them.
3. Keep the game runnable after every task.
4. Do not rewrite unrelated systems unless necessary.
5. Prefer small focused classes/scripts over god classes.
6. Keep gameplay logic separate from rendering/UI.
7. Prefer data-driven systems for items, skills, enemies, quests, talents, loot tables, and world generation.
8. Avoid hardcoded gameplay content where reusable definitions can be used.
9. Centralize shared formulas such as damage, XP, rarity, scaling, resistances, and loot probabilities.
10. Use deterministic RNG where practical.
11. Keep systems compatible with future multiplayer, but **do not implement multiplayer yet**.
12. Input should create gameplay commands; UI should never directly modify combat/world state.
13. Add or update automated/debug tests where appropriate.
14. Update documentation whenever architecture or data formats change.
15. At the end of every task, report:
   - files created
   - files modified
   - architecture changes
   - tests performed
   - known limitations
   - recommended next step

If the repository is empty, use **Godot 4.x + GDScript**.

The game should use an isometric/top-down 2D presentation.

---

# PROMPT 01 — Project Foundation and Architecture

Inspect the repository and establish the initial architecture for a scalable 2D dark-fantasy ARPG.

Do not build the entire game yet.

Create a clean project structure supporting:

- player
- enemies
- combat
- skills
- talents
- items
- inventory
- loot
- quests
- dialogue
- world
- procedural generation
- dungeons
- cities
- NPCs
- crafting
- status effects
- UI
- audio
- save system
- debug tools
- tests

Suggested high-level structure:

```text
/game
    /actors
        /player
        /enemies
        /bosses

    /combat
    /skills
    /talents
    /items
    /inventory
    /loot
    /quests
    /dialogue

    /world
        /generation
        /regions
        /dungeons
        /cities

    /npc
    /crafting
    /effects
    /ui
    /audio
    /save
    /data
    /debug
    /tests

/docs
```

Create initial architectural documentation:

```text
docs/ARCHITECTURE.md
docs/COMBAT.md
docs/ITEMS.md
docs/SKILLS.md
docs/WORLD_GENERATION.md
docs/SAVE_SYSTEM.md
```

Establish the core application/game state flow:

```text
Boot
→ Main Menu
→ Character Selection / New Character
→ Load World
→ Gameplay
→ Pause
→ Save / Exit
```

Create only minimal placeholder scenes/resources necessary to prove the project boots correctly.

Acceptance criteria:

- project starts without errors
- main gameplay scene can load
- architecture is documented
- no huge all-purpose manager
- systems are designed for future expansion
- repository remains clean and runnable

---

# PROMPT 02 — Player Entity and Character Core

Implement the reusable player character foundation.

The player should contain separate components/systems for:

- movement
- statistics
- health
- class resource
- combat
- skills
- equipment
- status effects
- animation
- interaction

Do not place all functionality into PlayerController.

Create a reusable stat model supporting at least:

Primary attributes:

- Strength
- Dexterity
- Intelligence
- Vitality
- Willpower

Derived statistics:

- maximum health
- health regeneration
- maximum class resource
- resource regeneration
- armor
- physical resistance
- fire resistance
- frost resistance
- lightning resistance
- poison resistance
- shadow resistance
- holy resistance
- attack speed
- movement speed
- critical hit chance
- critical hit damage
- dodge chance
- block chance
- cooldown reduction
- life steal
- magic find
- gold find

Use derived-stat calculation rather than permanently modifying cached numbers from many different systems.

Create a minimal placeholder Warrior as the first playable class.

Acceptance criteria:

- player can spawn
- player has health and stats
- stats can be inspected in debug output
- stats are not hardcoded directly into UI
- player systems are modular

---

# PROMPT 03 — Diablo-Style Mouse Movement

Implement **Diablo-style click-to-move controls**.

Do not use WASD as the default movement scheme.

Required behavior:

## Ground click

Left-click on walkable ground:

```text
click ground
→ determine world position
→ request movement command
→ pathfind
→ move player
→ stop at destination
```

Holding the left mouse button should continuously update movement toward the cursor without causing excessive path recalculation.

Use navigation/pathfinding to route around obstacles.

Clicking unreachable terrain should resolve to the nearest valid reachable location when possible.

Implement:

- movement acceleration/deceleration if appropriate
- configurable stopping distance
- obstacle avoidance
- movement interruption
- root/stun movement prevention
- path recalculation throttling
- destination visualization in debug mode

Create a clean command pipeline:

```text
Mouse
→ InputController
→ ContextResolver
→ MoveCommand
→ PlayerMovement
```

Do not access raw mouse input throughout gameplay scripts.

Acceptance criteria:

- player moves entirely using the mouse
- holding left-click produces smooth movement
- obstacles are avoided
- movement does not jitter
- UI clicks do not trigger world movement

---

# PROMPT 04 — Mouse Context Resolver and Interaction Model

Build a centralized mouse/context interaction system.

The system must determine what is under the cursor.

Supported categories:

```text
GROUND
ENEMY
NPC
LOOT
INTERACTABLE
UI
INVALID
```

Left-click behavior:

Ground:
- move

Enemy:
- move toward target if necessary
- perform primary attack

NPC:
- approach
- interact

Loot:
- approach
- pick up

Chest / shrine / door:
- approach
- interact

Create common interaction interfaces/components instead of writing unique click logic for every entity.

Add cursor feedback for:

- movement
- hostile target
- NPC interaction
- loot
- interactable object
- invalid location

Add target highlighting.

Acceptance criteria:

- clicking different world objects produces correct context-sensitive behavior
- UI consumes clicks before world interaction
- interaction distance is respected
- interaction logic is centralized

---

# PROMPT 05 — Force Move, Hold Position, and Skill Aiming

Expand the input system with standard ARPG control helpers.

Implement:

## Force Move

A configurable action that causes movement regardless of enemies beneath the cursor.

Suggested default:

- middle mouse button

Do not hardcode the final binding.

## Hold Position / Stand Still

Suggested default:

- Shift

While active:

- attack commands must not automatically move the player
- ranged attacks can fire while stationary
- melee attacks fail gracefully when target is out of range

## Skill aiming

Skills activated by hotkeys should aim using the mouse cursor.

Support targeting modes:

```text
SELF
TARGET_ENTITY
GROUND_POSITION
DIRECTION
AREA
```

Recommended input defaults:

```text
Left Mouse Button  = move / interact / primary attack
Right Mouse Button = secondary skill
1                   = skill slot 1
2                   = skill slot 2
3                   = skill slot 3
4                   = skill slot 4
Q                   = potion
Space               = evade
Shift               = hold position
I                   = inventory
C                   = character
S                   = skills
T                   = talents
M                   = map
J                   = quest journal
Esc                 = menu
```

Acceptance criteria:

- all bindings are configurable input actions
- keyboard skills aim using cursor position
- force move works in enemy crowds
- hold position prevents unwanted movement

---

# PROMPT 06 — Combat Foundation

Implement the centralized real-time combat system.

Support:

- melee attacks
- ranged attacks
- projectiles
- spells
- area damage
- critical hits
- armor
- resistances
- dodge
- block
- healing
- shields

Use a centralized damage pipeline:

```text
attack source
→ skill/weapon base damage
→ attacker modifiers
→ damage type modifiers
→ critical calculation
→ defender armor/resistance
→ defensive effects
→ final damage
→ health
```

Supported damage types:

- Physical
- Fire
- Frost
- Lightning
- Poison
- Holy
- Shadow
- Arcane

Create reusable hit/damage payloads.

Do not allow individual skills to invent independent damage formulas.

Acceptance criteria:

- player can damage enemies
- enemies can damage player
- damage type/resistance works
- critical hits work
- damage logic is centralized
- combat events can be observed by UI without UI controlling combat

---

# PROMPT 07 — Warrior Basic Combat

Implement the Warrior as the first complete combat class.

Class resource:

**Rage**

Implement:

- basic melee attack
- Cleave
- Charge
- Ground Slam
- War Cry
- Whirlwind
- Execute

Each skill must define data such as:

- cooldown
- resource cost
- damage scaling
- range
- targeting type
- tags
- animation reference
- status effects
- whether auto-approach is permitted

Suggested skill tags:

```text
MELEE
PHYSICAL
AREA
MOVEMENT
CHANNELING
BUFF
```

Integrate with Diablo-style controls:

- click enemy outside range → approach → attack
- right-click skill → use cursor target
- keyboard skill → use cursor target
- hold position → never auto-approach

Acceptance criteria:

- Warrior has a playable combat loop
- skill cooldowns work
- Rage works
- skills use centralized combat formulas
- target approach behavior feels correct

---

# PROMPT 08 — Animation and Combat Feel

Add the animation framework and improve game feel.

Player animation states:

- idle
- walk
- run
- attack
- cast
- channel
- hit
- block
- dodge
- death

Synchronize damage with actual hit frames rather than immediately dealing damage when input begins.

Support:

- attack wind-up
- hit frame
- recovery
- controlled animation cancellation
- movement locking where appropriate

Add:

- impact particles
- hit flashes
- weapon trails
- strong-hit screen shake
- knockback feedback
- critical hit feedback
- death animation hooks

Keep visual effects readable.

Acceptance criteria:

- attacks visually align with hit timing
- strong attacks feel different from basic attacks
- animation system remains separate from damage calculations

---

# PROMPT 09 — Status Effect Framework

Implement a reusable status-effect system.

Support:

- Burning
- Chilled
- Frozen
- Poisoned
- Bleeding
- Stunned
- Slowed
- Rooted
- Silenced
- Cursed
- Vulnerable
- Fortified
- Shielded
- Regeneration
- Haste

Each effect should support:

- source
- duration
- magnitude
- tick interval
- stacking rules
- maximum stacks
- refresh behavior
- dispel category
- immunity
- visual hook

Effects must be data-driven.

Acceptance criteria:

- effects can be applied by skills
- timed effects expire correctly
- DoT effects tick correctly
- stacking behavior is deterministic
- UI can query current effects

---

# PROMPT 10 — Enemy Framework and AI

Create the reusable enemy framework.

Implement AI archetypes:

- melee aggressor
- ranged attacker
- defensive enemy
- healer
- summoner
- ambusher
- charger
- caster
- support enemy

AI must support:

- idle
- patrol
- aggro
- chase
- attack
- reposition
- flee where appropriate
- return to origin
- death

Create configurable:

- aggro range
- attack range
- movement speed
- preferred distance
- cooldown behavior
- target selection

Do not make every enemy use identical AI.

Acceptance criteria:

- at least three enemy archetypes behave differently
- AI respects navigation
- enemies react correctly to player death
- enemy configuration is data-driven

---

# PROMPT 11 — Monster Families

Add initial monster families for Act I.

Implement reusable definitions for:

Undead:
- Skeleton
- Skeleton Archer
- Skeleton Mage
- Ghoul
- Zombie

Beasts:
- Wolf
- Spider
- Corrupted Boar

Bandits:
- Bandit Fighter
- Bandit Archer
- Bandit Rogue

Cultists:
- Fanatic
- Cult Mage
- Cult Healer

Each family should have tactical differences.

Do not create fifteen identical enemies with different sprites.

Acceptance criteria:

- monster definitions share reusable components
- ranged and melee enemies behave differently
- healers/support enemies affect encounters
- spawn system can instantiate enemies from data

---

# PROMPT 12 — XP, Levels, and Character Progression

Implement player progression.

Players gain XP from:

- enemies
- quests
- bosses
- exploration
- dungeons
- world events

Create configurable XP curves.

Leveling grants:

- stat growth
- skill points
- talent points
- access to higher-level equipment

Avoid placing the XP formula directly in Player.

Create progression definitions/resources.

Acceptance criteria:

- XP can be gained
- player levels up
- rewards are deterministic
- progression persists in save data later

---

# PROMPT 13 — Item Data Model

Create the equipment/item foundation.

Equipment slots:

- Helmet
- Chest
- Gloves
- Boots
- Belt
- Amulet
- Ring 1
- Ring 2
- Main Hand
- Off Hand
- optional Relic/Charm

Weapon types:

- Sword
- Greatsword
- Axe
- Greataxe
- Mace
- Hammer
- Dagger
- Bow
- Crossbow
- Staff
- Wand
- Spellbook
- Shield

Item rarity:

1. Common
2. Uncommon
3. Rare
4. Epic
5. Legendary
6. Mythic

Create data definitions for:

- base item
- item level
- required level
- rarity
- affixes
- sockets
- legendary powers
- sell value

Acceptance criteria:

- items are defined outside inventory UI
- items can be instantiated from definitions
- item instances can contain generated affixes
- item data is serializable

---

# PROMPT 14 — Affixes and Random Item Generation

Implement procedural item generation.

Create:

- prefix pool
- suffix pool
- rarity rules
- affix tiers
- item-level restrictions
- class-relevant weighting where appropriate

Example affixes:

- Strength
- Dexterity
- Intelligence
- Vitality
- critical chance
- critical damage
- attack speed
- movement speed
- fire damage
- physical damage
- resistances
- maximum health
- resource regeneration
- cooldown reduction
- skill rank
- summon damage
- poison damage

Rarity should influence:

- number of affixes
- affix tier
- chance of special effects

Use controlled RNG.

Acceptance criteria:

- generated items are reproducible with a known seed when requested
- invalid affix combinations are prevented
- rarity meaningfully changes item quality
- item generation has automated/debug tests

---

# PROMPT 15 — Inventory and Equipment

Implement inventory and equipment systems.

Support:

- item storage
- equipment slots
- equipping
- unequipping
- swapping
- dropping
- sorting
- filtering
- locking/favoriting
- comparison tooltips

Equipping an item should update character derived statistics through the stat system.

Do not allow UI to directly modify stats.

Flow:

```text
UI equip request
→ Inventory/Equipment command
→ EquipmentSystem
→ CharacterStats recompute
→ UI receives updated state
```

Acceptance criteria:

- items can be equipped
- character stats change correctly
- invalid equipment is rejected
- UI shows before/after comparison

---

# PROMPT 16 — Loot Drops

Implement loot generation and world drops.

Loot quality depends on:

- monster level
- elite status
- boss status
- region
- difficulty
- player level
- magic find

Implement weighted loot tables.

World loot should support:

- ground labels
- rarity visuals
- click-to-pickup
- auto-approach
- pickup radius
- inventory-full handling

Boss loot tables should support curated guaranteed drops plus random drops.

Acceptance criteria:

- normal enemies drop basic loot
- elite monsters provide improved loot
- bosses provide clearly better rewards
- pickup works through mouse interaction system

---

# PROMPT 17 — Elite Monsters and Modifiers

Implement elite enemies.

Create reusable modifiers such as:

- Extra Health
- Increased Damage
- Fast
- Fire Aura
- Frost Attacks
- Poison Attacks
- Teleporting
- Shielded
- Regenerating
- Summoner
- Explodes on Death
- Hazardous Ground

Elites may combine compatible modifiers.

Add visual identification and better loot.

Acceptance criteria:

- modifiers are composable
- incompatible combinations can be excluded
- elites are clearly distinguishable
- elite loot is improved

---

# PROMPT 18 — First Persistent Town

Create the first permanent town.

The town must always exist regardless of procedural world seed.

Include:

- blacksmith
- weapon/armor merchant
- potion vendor
- quest NPC
- healer
- stash
- waypoint
- several decorative civilians

Town should be a safe zone.

Implement reusable NPC interaction through mouse controls:

```text
click NPC
→ walk into interaction range
→ stop
→ open interaction/dialogue
```

Acceptance criteria:

- town is persistent
- NPCs can be interacted with
- combat is disabled or controlled inside safe zone
- waypoint can later connect to fast travel

---

# PROMPT 19 — Gold Economy and Merchants

Implement gold as the primary currency.

Gold sources:

- enemies
- treasure
- quests
- selling equipment
- dungeon rewards

Gold sinks:

- purchases
- repairs
- crafting
- enchanting
- respec
- upgrading

Implement merchants with:

- buy
- sell
- inventory
- prices
- refresh rules
- item categories

Avoid exponential inflation.

Create centralized pricing/economy formulas.

Acceptance criteria:

- player can earn gold
- player can buy and sell
- prices are data-driven
- invalid transactions are rejected

---

# PROMPT 20 — Dialogue and Quest Foundation

Implement a reusable dialogue and quest system.

Dialogue should support:

- branching dialogue
- quest availability conditions
- completed quest conditions
- campaign progression
- optional dialogue
- NPC state

Quest system should support:

- quest ID
- title
- description
- objectives
- prerequisite quests
- objective counters
- rewards
- quest state
- completion
- failure where applicable

Quest categories:

- main
- side
- bounty
- exploration
- dungeon
- boss
- collection
- investigation

Do not embed quest logic directly inside NPC scripts.

Acceptance criteria:

- NPC can offer quest
- player can accept quest
- objective updates
- quest can complete
- reward is granted

---

# PROMPT 21 — Act I Quest Chain

Create the first playable quest chain.

Suggested flow:

1. player begins in town
2. talks to quest giver
3. investigates nearby corruption
4. fights corrupted beasts
5. discovers an abandoned graveyard
6. defeats a named mini boss
7. finds evidence leading to a dungeon
8. enters dungeon
9. defeats dungeon boss
10. returns to town
11. receives reward
12. unlocks next progression step

Include meaningful narrative context instead of only numeric kill objectives.

Acceptance criteria:

- complete beginning-to-end quest chain
- quest markers work
- objectives persist
- rewards work
- player can complete chain without debug tools

---

# PROMPT 22 — Procedural Wilderness Generation

Implement the first procedurally generated wilderness region.

Use a deterministic world seed.

Generation pipeline:

```text
seed
→ region bounds
→ terrain
→ walkable areas
→ obstacles
→ roads
→ persistent landmarks
→ random POIs
→ monster zones
→ treasure
→ events
→ dungeon entrances
→ validation
```

The first biome should resemble a dark corrupted frontier/forest.

Important locations such as the starting town should remain persistent.

Create generation validation:

- town reachable
- critical quest destinations reachable
- dungeon entrance reachable
- player spawn valid
- no required NPC inside collision

Regenerate invalid sections.

Acceptance criteria:

- different seeds produce different wilderness layouts
- same seed reproduces same important generated layout
- town remains stable
- navigation remains valid

---

# PROMPT 23 — World Chunking and Streaming

Prepare the open world for larger maps.

Divide the procedural world into chunks.

Implement:

- nearby chunk loading
- distant chunk unloading
- persistent chunk identifiers
- chunk content seeds
- persistence of important world state

Persist examples:

- opened chest
- completed event
- killed unique enemy
- discovered landmark
- activated waypoint

Avoid loading the entire world simultaneously.

Acceptance criteria:

- player can cross chunk boundaries without obvious breaks
- unloaded chunks release unnecessary entities/resources
- returning to a chunk restores important persistent state

---

# PROMPT 24 — Map, Minimap, and Fog of War

Implement:

- minimap
- world map
- fog of war
- discovered areas
- landmarks
- quest markers
- dungeon entrances
- towns
- waypoints

Map discovery must persist.

Do not reveal unexplored procedural locations automatically.

Acceptance criteria:

- unexplored map starts hidden
- exploring reveals terrain
- known towns remain visible
- map state persists

---

# PROMPT 25 — Procedural Dungeon Generator

Implement procedurally generated dungeons using modular rooms.

Room types:

- entrance
- corridor
- combat room
- elite room
- event room
- treasure room
- trap room
- secret room
- boss room

Generation must guarantee:

- reachable boss
- reachable exit
- no inaccessible objective
- valid enemy spawning
- valid player spawn
- no overlapping impossible room connections

Use dungeon seeds.

Add automated/debug connectivity validation.

Acceptance criteria:

- multiple seeds produce different valid layouts
- boss room is always reachable
- generation failure triggers retry or safe fallback

---

# PROMPT 26 — First Dungeon Theme

Create the first complete dungeon theme:

**Corrupted Crypt**

Add:

- modular room visuals
- tomb props
- breakable containers
- traps
- undead enemies
- ambient audio hooks
- treasure rooms
- secret-room support

Do not change the general dungeon generator just to hardcode this theme.

Theme-specific data should plug into reusable generation logic.

Acceptance criteria:

- crypt feels visually and mechanically distinct
- dungeon can be generated repeatedly
- encounters use appropriate enemies

---

# PROMPT 27 — Mini Boss Framework

Create reusable mini-boss infrastructure.

Mini bosses should support:

- unique name
- multiple abilities
- larger health pool
- phases where appropriate
- improved AI
- guaranteed reward rules
- intro/arena hooks

Implement Act I examples:

- Bandit Captain
- Graveyard Warden
- Brood Mother
- Corrupted Knight

Acceptance criteria:

- mini bosses are mechanically more complex than normal enemies
- rewards are better
- quest system can reference a specific mini boss

---

# PROMPT 28 — Boss Framework and First Act Boss

Implement reusable boss encounter architecture.

Boss features:

- boss health UI
- phases
- ability rotations
- telegraphed attacks
- arena boundaries
- adds/summons
- environmental hazards
- death event
- boss loot table

Create Act I boss:

**The Hollow King**

Design at least three mechanically distinct phases.

Boss difficulty should come from mechanics rather than extreme HP.

Acceptance criteria:

- encounter can be completed without debug tools
- phase transitions work
- telegraphs are readable
- boss death updates quests/world state
- boss drops high-quality loot

---

# PROMPT 29 — Death and Respawn

Implement player death.

On death:

- movement stops
- abilities cancel
- temporary effects are handled correctly
- death animation plays
- interaction stops
- respawn UI appears

Respawn at:

- nearest activated checkpoint
- or town waypoint

Optionally apply configurable durability loss.

Do not remove major permanent progression on standard difficulty.

Acceptance criteria:

- death cannot leave player stuck
- combat state resets
- player respawns correctly
- repeated death is safe

---

# PROMPT 30 — Talent Tree Foundation

Implement a reusable talent tree framework.

Talents can:

- increase stats
- modify skills
- unlock passive mechanics
- alter resources
- trigger conditional effects

Support:

- prerequisites
- talent ranks
- branches
- unlock levels
- respec

Create Warrior branches:

## Berserker
- Rage generation
- attack speed
- crit
- aggressive bonuses

## Guardian
- armor
- block
- shields
- survivability

## Warlord
- war cries
- crowd control
- tactical buffs

Acceptance criteria:

- player can spend talent points
- prerequisites work
- talent effects update character correctly
- respec is possible through a gold cost

---

# PROMPT 31 — Skill Modification System

Expand skills so talents and items can alter behavior.

Examples:

Fireball:
- extra projectiles
- explosion radius
- burning ground
- piercing

Whirlwind:
- pull enemies
- movement speed increase
- bleed
- larger radius

Raise Skeleton:
- extra skeleton
- exploding skeleton
- armored skeleton

Do not implement modifications with giant skill-specific if/else chains.

Use composable modifiers or well-defined extension hooks.

Acceptance criteria:

- at least one Warrior skill can be materially transformed
- modification is visible in gameplay
- architecture supports future class skills

---

# PROMPT 32 — Crafting, Salvaging, and Materials

Implement crafting foundation.

Support:

- salvage equipment
- materials
- item upgrade
- affix reroll
- enchanting
- socketing

Example materials:

- Iron
- Steel
- Arcane Dust
- Soul Fragment
- Demon Essence
- Ancient Crystal

Create crafting recipes as data.

Acceptance criteria:

- items can be salvaged
- materials are stored
- crafting costs are validated
- crafted upgrades modify item data safely

---

# PROMPT 33 — Gems and Runes

Implement equipment sockets.

Socket effects can depend on item category.

Examples:

Weapon:
- damage bonus

Armor:
- resistance

Jewelry:
- resource regeneration

Support gem tiers and upgrading lower-tier gems into higher tiers.

Acceptance criteria:

- items can have sockets
- gems can be inserted/removed according to rules
- stats update correctly
- socket data persists

---

# PROMPT 34 — Potions and Consumables

Implement consumables.

Support:

- healing potion
- class-resource potion if desired
- resistance potion
- temporary buff potion

Prevent unlimited instant potion spam.

Use configurable:

- charges
- cooldowns
- refill rules

Integrate potion hotkey:

`Q`

Acceptance criteria:

- potion works during combat
- cooldown/charges display in UI
- consumable state saves correctly where appropriate

---

# PROMPT 35 — Player Stash

Create a town stash.

Features:

- persistent storage
- multiple tabs
- item movement between inventory and stash
- sorting
- filtering

Architect it so account-wide/shared storage could be added later for multiplayer or multiple characters.

Do not implement network storage yet.

Acceptance criteria:

- stash persists
- item identity remains stable
- moving items cannot duplicate or delete them

---

# PROMPT 36 — Fast Travel and Waypoints

Implement waypoints.

Rules:

- waypoint must be discovered/activated
- activated waypoints appear on world map
- player may fast-travel between unlocked destinations
- travel should preserve world/save state

Add the starting-town waypoint and at least one wilderness waypoint.

Acceptance criteria:

- undiscovered destinations cannot be used
- fast travel works
- destination state is valid after travel

---

# PROMPT 37 — World Events

Implement random world events.

Examples:

- Bandit Ambush
- Demon Incursion
- Caravan Defense
- Cursed Shrine
- Elite Hunt
- Rescue Event
- Ritual Interruption
- Treasure Ambush

Events should use region/event tables.

Rewards:

- XP
- gold
- materials
- loot

Acceptance criteria:

- events spawn under controlled conditions
- event state is tracked
- completed events reward player
- events do not overwrite critical quest locations

---

# PROMPT 38 — Shrines and Environmental Interactions

Add interactable environment systems.

Objects:

- chests
- doors
- locked doors
- levers
- shrines
- traps
- breakable barrels
- crates
- hidden walls
- lore objects

Shrine effects can include:

- damage
- armor
- speed
- regeneration
- resource generation
- loot bonus

Some shrines may trigger combat encounters.

All interactions must work through the central click interaction system.

Acceptance criteria:

- interactables share reusable interface
- player auto-approaches correctly
- consumed/opened state can persist

---

# PROMPT 39 — Paladin Class

Add the Paladin using existing class infrastructure.

Resource:

**Faith**

Implement skills:

- Holy Strike
- Consecration
- Divine Shield
- Judgment
- Healing Light
- Holy Aura
- Smite

Possible builds:

- holy warrior
- guardian
- aura build
- holy caster

Create Paladin-specific talent branches and class-relevant item affixes.

Do not duplicate Warrior systems.

Acceptance criteria:

- class selection supports Paladin
- Faith works
- Paladin plays differently from Warrior
- talents and items integrate with existing systems

---

# PROMPT 40 — Mage Class

Add the Mage.

Resource:

**Mana**

Elements:

- Fire
- Frost
- Lightning
- Arcane

Skills:

- Fireball
- Frost Nova
- Chain Lightning
- Meteor
- Teleport
- Arcane Barrier
- Blizzard

Support:

- ground targeting
- projectile targeting
- self buffs
- movement skill
- elemental status effects

Possible builds:

- fire
- frost
- lightning
- arcane

Acceptance criteria:

- mouse cursor determines spell direction/ground position
- elements interact correctly with status effects
- Mage has distinct item/talent support

---

# PROMPT 41 — Necromancer Class

Add the Necromancer.

Resource:

**Essence**

Skills:

- Raise Skeleton
- Corpse Explosion
- Bone Spear
- Blood Drain
- Curse
- Summon Golem
- Death Nova

Implement reusable summon ownership.

Summons should have:

- stable owner
- target behavior
- lifetime where applicable
- stat scaling
- cleanup on scene/world transition

Possible builds:

- skeleton army
- corpse explosion
- bone caster
- blood
- poison

Acceptance criteria:

- summoned entities function reliably
- corpse mechanics are reusable
- future multiplayer ownership remains possible

---

# PROMPT 42 — Rogue Class

Add the Rogue.

Resource:

**Energy**

Weapons:

- Daggers
- Bows
- Crossbows

Skills:

- Backstab
- Dash
- Poison Blade
- Multishot
- Shadow Step
- Trap
- Fan of Knives

Possible builds:

- assassin
- poison
- ranged
- traps

Focus on:

- positioning
- crits
- mobility
- target selection
- traps

Acceptance criteria:

- melee and ranged Rogue builds are possible
- mouse targeting works naturally
- mobility skills interact correctly with navigation/combat

---

# PROMPT 43 — Warlock Class

Add the Warlock.

Resource:

**Soul Power**

Skills:

- Shadow Bolt
- Life Drain
- Demon Summoning
- Soul Burn
- Corruption
- Fear
- Hellfire

Possible builds:

- demon summoner
- shadow caster
- DoT
- life drain

Reuse summon framework created for Necromancer.

Acceptance criteria:

- Warlock has distinct resource/gameplay
- DoT and curses use shared status framework
- demon summons reuse generic summon infrastructure

---

# PROMPT 44 — Class Selection and Character Creation

Create character creation.

Allow selection of:

- Warrior
- Paladin
- Mage
- Necromancer
- Rogue
- Warlock

Store:

- character ID
- class
- level
- XP
- progression
- world seed association

Do not make a separate save implementation per class.

Acceptance criteria:

- all six classes can create/load
- class-specific resources and starting equipment load correctly

---

# PROMPT 45 — Save/Load System

Implement a versioned save system.

Save:

- character class
- level
- XP
- stats/progression
- inventory
- equipment
- stash
- gold
- materials
- skills
- talents
- quest state
- world seed
- discovered map
- waypoints
- world persistent states
- dungeon seeds/state
- NPC state
- campaign progress

Use schema/save versioning.

Plan for future migration.

Never serialize fragile scene/node references as primary identity.

Use stable IDs.

Acceptance criteria:

- new game can be saved
- full game can be closed/reloaded
- progression restores correctly
- corrupted/invalid save fails gracefully
- version field exists

---

# PROMPT 46 — Full HUD and Main Gameplay UI

Build production-oriented gameplay UI.

HUD:

- health
- class resource
- XP
- level
- skill bar
- potion
- buffs/debuffs
- minimap
- quest tracker

Menus:

- inventory
- equipment
- character statistics
- skills
- talent tree
- quest journal
- map
- crafting
- settings

Combat UI:

- enemy health
- boss health
- elite modifiers
- damage numbers
- crit feedback
- cooldown indicators

UI must observe gameplay state, not own it.

Acceptance criteria:

- UI supports mouse interaction correctly
- UI blocks world click-through
- all major gameplay information is readable

---

# PROMPT 47 — Settings, Accessibility, and Input Rebinding

Implement settings.

Support:

- master volume
- music volume
- effects volume
- UI volume
- fullscreen/windowed
- resolution
- VSync
- UI scale
- screen shake intensity/on/off
- floating combat text
- input rebinding

Ensure all Diablo-style mouse actions can be rebound.

Do not assume left-handed/right-handed input layout permanently.

Acceptance criteria:

- settings persist
- keybindings persist
- changing input mapping does not require code changes

---

# PROMPT 48 — Audio Framework

Implement audio architecture.

Categories/buses:

- Master
- Music
- Ambience
- Combat
- Monsters
- Spells
- UI

Add event hooks for:

- attacks
- hits
- spells
- loot
- NPC interactions
- bosses
- environment

Do not hardcode audio playback throughout unrelated systems.

Acceptance criteria:

- categories have separate volume
- gameplay events can trigger audio centrally
- missing sound asset does not break gameplay

---

# PROMPT 49 — Act II Region

Add Act II:

**The Rotting Marshes**

Environment:

- swamps
- flooded ruins
- poisonous caves
- witch settlements

Enemies:

- swamp beasts
- plague zombies
- witches
- poisonous creatures
- insects

Mini bosses:

- Mire Hag
- Plague Brute
- Rotting Hydra

Boss:

**The Mother of Decay**

Create new biome-generation data, monster tables, dungeon themes, quests, and loot tendencies.

Reuse existing systems.

Acceptance criteria:

- Act II is a progression from Act I
- it introduces new mechanics rather than only higher numbers
- content is data-driven

---

# PROMPT 50 — Act III Region

Add Act III:

**Ashen Highlands**

Environment:

- mountains
- volcanic regions
- mines
- ruined fortresses

Enemies:

- demons
- corrupted miners
- fire creatures
- armored beasts

Mini bosses:

- Forge Guardian
- Ash Demon
- Fallen Champion

Boss:

**The Infernal Smith**

Introduce fire hazards and new dungeon themes.

Acceptance criteria:

- new biome uses existing world-generation framework
- enemies introduce new tactical behaviors
- Act III progression and quest chain are complete

---

# PROMPT 51 — Act IV Region

Add Act IV:

**The Dead Kingdom**

Environment:

- abandoned cities
- necropolises
- haunted castles
- crypt networks

Enemies:

- skeleton armies
- ghosts
- necromancers
- vampires
- death knights

Mini bosses:

- Bone Colossus
- Vampire Lord
- Death Knight Commander

Boss:

**The Lich Sovereign**

Acceptance criteria:

- region has distinct tone and mechanics
- end-of-act boss has multiple phases
- new loot and enemy mechanics integrate cleanly

---

# PROMPT 52 — Act V and Campaign Finale

Add Act V:

**The Shattered Realm**

Environment:

- corrupted reality
- floating ruins
- demonic fortresses
- unstable magical zones

Enemies:

- advanced demons
- corrupted celestial beings
- arcane creatures
- dimensional horrors

Create an original final antagonist tied to the world's corruption.

The final act should test advanced player builds.

Create:

- final quest chain
- mini bosses
- final dungeon
- multi-phase final boss
- campaign completion state

Acceptance criteria:

- campaign can be completed from start to finish
- final boss uses multiple existing gameplay systems
- completion state persists

---

# PROMPT 53 — Difficulty Modes and Controlled Scaling

Implement difficulty modes.

Difficulty can affect:

- enemy health
- damage
- aggression
- elite frequency
- encounter composition
- loot quality
- XP
- gold

Avoid simply multiplying enemy HP.

Implement controlled regional level scaling.

The player should still feel stronger when returning to old areas.

Use region level ranges rather than permanently matching every enemy exactly to player level.

Acceptance criteria:

- difficulty changes combat meaningfully
- old regions remain easier later
- rewards correspond to increased challenge

---

# PROMPT 54 — Reputation and Factions

Implement optional faction reputation.

Reputation may unlock:

- quests
- merchants
- discounts
- recipes
- items
- dialogue

Keep faction logic data-driven.

Do not tightly couple it to the main campaign.

Acceptance criteria:

- reputation changes persist
- vendors/dialogue can query faction state
- system can be expanded with new factions

---

# PROMPT 55 — Advanced Legendary Items

Expand legendary loot.

Legendary items should often change gameplay mechanics rather than only provide larger numbers.

Examples:

- Whirlwind pulls enemies inward
- Fireball splits after impact
- Skeletons explode on death
- Charge leaves burning ground
- Poison spreads on critical hit
- Holy Strike creates a temporary aura

Create legendary-effect framework reusable across classes.

Acceptance criteria:

- legendary effects are modular
- multiple legendary powers can exist without giant conditional code
- effects interact correctly with skills/talents

---

# PROMPT 56 — Endgame Foundation

Create a minimal extensible endgame foundation.

Do not build an enormous endgame yet.

Prepare systems for:

- higher difficulty dungeons
- dungeon modifiers
- world tiers
- boss farming
- challenge maps
- legendary farming
- post-campaign progression

Implement one prototype repeatable challenge dungeon with configurable modifiers.

Acceptance criteria:

- campaign completion unlocks endgame prototype
- system reuses dungeon/loot architecture
- no major architecture rewrite is required

---

# PROMPT 57 — Performance Pass

Profile and optimize.

Focus on:

- enemy counts
- projectiles
- particles
- dropped loot
- navigation
- procedural generation
- chunk streaming
- AI updates
- UI updates

Use:

- object pooling where valuable
- spatial queries
- collision layers/masks
- AI update throttling
- chunk unloading
- off-screen deactivation

Do not prematurely optimize trivial code.

Measure before/after where possible.

Acceptance criteria:

- performance bottlenecks are documented
- major bottlenecks are improved
- optimizations do not break deterministic gameplay

---

# PROMPT 58 — Procedural Generation Validation Suite

Build automated/debug validation for procedural content.

Test many generated seeds.

Validate:

- player spawn
- town reachability
- waypoint reachability
- quest destination reachability
- dungeon entrance reachability
- dungeon boss reachability
- navigation
- no critical object inside collision
- no disconnected dungeon critical path

Produce useful error output with seed information.

Acceptance criteria:

- generation tests can run across many seeds
- failures report exact seed/context
- invalid generation fails safely

---

# PROMPT 59 — Combat and Item Test Suite

Add automated tests/debug validation for:

- damage formulas
- critical hits
- armor
- resistance
- blocking
- status effects
- XP
- level progression
- affix generation
- item rarity
- loot tables
- legendary modifiers
- talents

Test edge cases.

Acceptance criteria:

- core mathematical systems are covered
- failures are reproducible
- random tests use explicit seeds

---

# PROMPT 60 — Developer Console and Debug Tools

Create development-only debug tools.

Commands/actions:

- add XP
- add gold
- set level
- spawn enemy
- spawn elite
- spawn boss
- generate item
- generate rarity
- teleport
- activate waypoint
- reveal map
- god mode
- regenerate dungeon
- regenerate region
- inspect target
- inspect player stats
- print current RNG seeds

Debug tools must be disabled or inaccessible in release mode.

Acceptance criteria:

- common gameplay systems can be tested quickly
- debug commands use normal gameplay APIs where possible

---

# PROMPT 61 — Multiplayer-Readiness Architecture Review

Do **not** implement multiplayer.

Review the complete codebase for future co-op compatibility.

Check:

- stable entity IDs
- deterministic world generation
- controlled RNG
- separation of input and gameplay
- separation of UI and game state
- explicit ownership of summons/projectiles
- centralized combat authority points
- serializable state
- minimal use of hidden global mutable state

Refactor only where current architecture would make future networking prohibitively difficult.

Design the future flow around the possibility of:

```text
client input
→ gameplay command
→ authoritative simulation
→ replicated state
```

Document findings in:

```text
docs/MULTIPLAYER_READINESS.md
```

Acceptance criteria:

- no multiplayer code is required
- major blockers are documented/fixed
- current single-player game still behaves identically

---

# PROMPT 62 — Final Vertical Slice Verification

Perform a full gameplay verification.

The game must support this sequence without debug commands:

1. Start game.
2. Create Warrior.
3. Spawn in starting town.
4. Talk to quest NPC.
5. Accept quest.
6. Leave town using mouse movement.
7. Explore procedural wilderness.
8. Fight several enemy types.
9. Gain XP.
10. Level up.
11. Receive loot.
12. Equip an item.
13. Spend a talent point.
14. Discover dungeon.
15. Enter dungeon.
16. Defeat mini boss.
17. Defeat dungeon boss.
18. Receive boss loot.
19. Return to town.
20. Sell unwanted items.
21. Craft or upgrade one item.
22. Complete quest.
23. Activate waypoint.
24. Save.
25. Exit game.
26. Reload game.
27. Confirm character/world progression restored correctly.

Fix all blocking issues discovered.

Do not add unrelated new features during this verification pass.

---

# PROMPT 63 — Full Game Systems Audit

Perform a final architecture and quality audit.

Inspect:

- class architecture
- combat
- skills
- talents
- status effects
- items
- loot
- crafting
- quests
- dialogue
- procedural generation
- dungeons
- bosses
- world streaming
- saving
- UI
- input
- performance
- future multiplayer readiness

Look specifically for:

- duplicated logic
- god classes
- hardcoded content
- unsafe global state
- circular dependencies
- inconsistent IDs
- duplicated formulas
- fragile save behavior
- unnecessary per-frame processing

Refactor only clear architectural problems.

Update documentation to match the final code.

At the end, produce a concise architecture summary and list the highest-value future improvements.

---

# Final Target

The completed project should provide:

- Diablo-style mouse movement and targeting
- real-time ARPG combat
- Warrior
- Paladin
- Mage
- Necromancer
- Rogue
- Warlock
- class-specific resources
- skill systems
- talent trees
- meaningful build diversity
- item rarity
- randomized affixes
- legendary effects
- equipment
- inventory
- stash
- gold economy
- merchants
- crafting
- gems/runes
- potions
- status effects
- enemy AI
- monster families
- elite enemies
- mini bosses
- act bosses
- five Acts
- persistent towns
- procedural wilderness
- procedural dungeons
- world events
- quests
- dialogue
- map/minimap
- fog of war
- fast travel
- death/respawn
- difficulty modes
- save/load
- scalable UI
- settings/input rebinding
- debugging tools
- performance-conscious world streaming
- future multiplayer-ready architecture

Priority order:

```text
gameplay correctness
→ clean architecture
→ responsive controls
→ combat feel
→ progression
→ procedural replayability
→ content
→ polish
```

Do not sacrifice maintainability for rapid content generation.

Build and verify each layer before expanding the next one.
