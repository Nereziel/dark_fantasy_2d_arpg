/**
 * Pure quest/dialogue planning for Prompt 20.
 *
 * Does not modify firstQuest, GameSimulation, saves, UI, NPCs, i18n or gold/XP.
 * Only the integrator applies a reward plan atomically with the new ledger.
 * Original Aether & Ruin source: GPL-3.0-only.
 */
export type QuestCategory =
  | 'main' | 'side' | 'bounty' | 'exploration'
  | 'dungeon' | 'boss' | 'collection' | 'investigation';

export type QuestStatus = 'available' | 'active' | 'ready' | 'completed' | 'failed';

export interface QuestObjectiveDefinition {
  id: string;
  /** Stable simulation event kind, not an occurrence ID or translated string. */
  eventId: string;
  targetCount: number;
}

export interface QuestDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  objectiveKey: string;
  category: QuestCategory;
  prerequisites: string[];
  objectives: QuestObjectiveDefinition[];
  reward: { gold: number; xp: number };
  /** Failure cannot occur unless an explicit event policy is declared. */
  failureEventId?: string;
}

/** Serializable predicates, deliberately never executable callbacks. */
export type DialogueCondition =
  | { type: 'questStatus'; questId: string; status: QuestStatus }
  | { type: 'questAvailable'; questId: string }
  | { type: 'objectiveAtLeast'; questId: string; objectiveId: string; count: number }
  | { type: 'npcState'; npcId: string; stateId: string }
  | { type: 'campaignFlag'; flagId: string; enabled: boolean };

export type DialogueAction =
  | { type: 'acceptQuest'; questId: string }
  | { type: 'turnInQuest'; questId: string }
  | { type: 'close' };

export interface DialogueOption {
  id: string;
  textKey: string;
  /** Hidden is the default for unmet conditions; disabled renders but cannot be selected. */
  whenLocked?: 'hidden' | 'disabled';
  conditions?: DialogueCondition[];
  nextNodeId?: string;
  action?: DialogueAction;
}

export interface DialogueNode {
  id: string;
  npcId: string;
  textKey: string;
  conditions?: DialogueCondition[];
  options: DialogueOption[];
}

export interface QuestCatalog {
  quests: QuestDefinition[];
  dialogueNodes: DialogueNode[];
}

/** ONLY character quest progress should be considered for future persistence. */
export interface QuestRuntimeState {
  questId: string;
  status: QuestStatus;
  counters: Readonly<Record<string, number>>;
  /** Bounded, persistent occurrence IDs: never evict (would permit reward replay). */
  processedEventIds: readonly string[];
  rewardClaimed: boolean;
}
export interface QuestLedger {
  quests: readonly QuestRuntimeState[];
}

/** NPC/campaign viewing context is transient and deliberately outside QuestLedger. */
export interface DialogueContext {
  npcId: string;
  npcStates?: Readonly<Record<string, string>>;
  campaignFlags?: readonly string[];
}

export interface EvaluatedDialogueOption {
  id: string;
  textKey: string;
  enabled: boolean;
  nextNodeId: string | null;
  action: DialogueAction | null;
}
export interface EvaluatedDialogue {
  id: string;
  textKey: string;
  options: readonly EvaluatedDialogueOption[];
}

export interface QuestRewardPlan {
  questId: string;
  gold: number;
  xp: number;
}
export interface QuestTransition {
  ledger: QuestLedger;
  changed: boolean;
  rewardPlan: QuestRewardPlan | null;
}

const MAX_QUESTS = 128;
const MAX_OBJECTIVES = 16;
const MAX_DIALOGUE_NODES = 256;
const MAX_OPTIONS = 24;
const MAX_CONDITIONS = 16;
const MAX_PREREQUISITES = 32;
const MAX_EVENTS = 256;
const MAX_TARGET = 1_000_000;
const MAX_REWARD = 1_000_000_000;
const MAX_INCREMENT = 10_000;
const CATEGORIES: readonly QuestCategory[] = [
  'main', 'side', 'bounty', 'exploration', 'dungeon', 'boss', 'collection', 'investigation'
];
const STATUSES: readonly QuestStatus[] = ['available', 'active', 'ready', 'completed', 'failed'];
const RESERVED = new Set<string>(['__proto__', 'constructor', 'prototype', ...Object.getOwnPropertyNames(Object.prototype)]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function onlyFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key));
}
function array(value: unknown, max: number, min = 0): value is unknown[] {
  return Array.isArray(value) && value.length >= min && value.length <= max;
}
/** IDs are safe as JSON property names and never interpreted as property paths. */
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(value)
    && !RESERVED.has(value);
}
function key(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value)
    && !value.includes('..');
}
function integer(value: unknown, low: number, high: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= low && value <= high;
}
function status(value: unknown): value is QuestStatus {
  return typeof value === 'string' && STATUSES.includes(value as QuestStatus);
}
function uniqueStrings(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}
function questById(catalog: QuestCatalog, questId: string): QuestDefinition | undefined {
  return catalog.quests.find(quest => quest.id === questId);
}
function stateById(ledger: QuestLedger, questId: string): QuestRuntimeState | undefined {
  return ledger.quests.find(state => state.questId === questId);
}

function validCondition(
  raw: unknown, quests: ReadonlyMap<string, QuestDefinition>
): raw is DialogueCondition {
  if (!record(raw)) return false;
  const questId = raw.questId;
  switch (raw.type) {
    case 'questStatus':
      return onlyFields(raw, ['type', 'questId', 'status'])
        && id(questId) && quests.has(questId) && status(raw.status);
    case 'questAvailable':
      return onlyFields(raw, ['type', 'questId'])
        && id(questId) && quests.has(questId);
    case 'objectiveAtLeast': {
      if (!onlyFields(raw, ['type', 'questId', 'objectiveId', 'count'])
        || !id(questId) || !id(raw.objectiveId)) return false;
      const objective = quests.get(questId)?.objectives.find(o => o.id === raw.objectiveId);
      return objective !== undefined && integer(raw.count, 0, objective.targetCount);
    }
    case 'npcState':
      return onlyFields(raw, ['type', 'npcId', 'stateId'])
        && id(raw.npcId) && id(raw.stateId);
    case 'campaignFlag':
      return onlyFields(raw, ['type', 'flagId', 'enabled'])
        && id(raw.flagId) && typeof raw.enabled === 'boolean';
    default: return false;
  }
}
function validConditions(
  value: unknown, quests: ReadonlyMap<string, QuestDefinition>
): boolean {
  return value === undefined || (
    array(value, MAX_CONDITIONS) && value.every(cond => validCondition(cond, quests))
  );
}
function validAction(value: unknown, quests: ReadonlyMap<string, QuestDefinition>): boolean {
  if (!record(value)) return false;
  if (value.type === 'close') return onlyFields(value, ['type']);
  return (value.type === 'acceptQuest' || value.type === 'turnInQuest')
    && onlyFields(value, ['type', 'questId'])
    && id(value.questId) && quests.has(value.questId);
}

/**
 * Reject malformed/oversized graphs before using them. Quest prerequisites
 * form a DAG; dialogue links may intentionally loop because evaluation never recurses.
 */
export function validateQuestCatalog(value: unknown): value is QuestCatalog {
  if (!record(value) || !onlyFields(value, ['quests', 'dialogueNodes'])
    || !array(value.quests, MAX_QUESTS, 1)
    || !array(value.dialogueNodes, MAX_DIALOGUE_NODES)) return false;

  const quests = new Map<string, QuestDefinition>();
  for (const quest of value.quests) {
    if (!record(quest)
      || !onlyFields(quest, [
        'id', 'titleKey', 'descriptionKey', 'objectiveKey', 'category',
        'prerequisites', 'objectives', 'reward', 'failureEventId'
      ])
      || !id(quest.id) || quests.has(quest.id)
      || !key(quest.titleKey) || !key(quest.descriptionKey) || !key(quest.objectiveKey)
      || !CATEGORIES.includes(quest.category as QuestCategory)
      || !array(quest.prerequisites, MAX_PREREQUISITES)
      || !quest.prerequisites.every(id) || !uniqueStrings(quest.prerequisites)
      || !array(quest.objectives, MAX_OBJECTIVES, 1)
      || !record(quest.reward) || !onlyFields(quest.reward, ['gold', 'xp'])
      || !integer(quest.reward.gold, 0, MAX_REWARD)
      || !integer(quest.reward.xp, 0, MAX_REWARD)
      || (quest.failureEventId !== undefined && !id(quest.failureEventId))) return false;

    const objectiveIds = new Set<string>();
    for (const objective of quest.objectives) {
      if (!record(objective) || !onlyFields(objective, ['id', 'eventId', 'targetCount'])
        || !id(objective.id) || objectiveIds.has(objective.id)
        || !id(objective.eventId) || !integer(objective.targetCount, 1, MAX_TARGET)) return false;
      objectiveIds.add(objective.id);
    }
    quests.set(quest.id, quest as unknown as QuestDefinition);
  }
  // Three colors: 1 is on the current path (cycle), 2 is completed.
  const colors = new Map<string, number>();
  const visit = (questId: string): boolean => {
    if (colors.get(questId) === 1) return false;
    if (colors.get(questId) === 2) return true;
    const quest = quests.get(questId);
    if (!quest) return false;
    colors.set(questId, 1);
    for (const prereqId of quest.prerequisites) {
      if (!quests.has(prereqId) || !visit(prereqId)) return false;
    }
    colors.set(questId, 2);
    return true;
  };
  for (const questId of quests.keys()) if (!visit(questId)) return false;

  const nodes = new Map<string, DialogueNode>();
  for (const node of value.dialogueNodes) {
    if (!record(node)
      || !onlyFields(node, ['id', 'npcId', 'textKey', 'conditions', 'options'])
      || !id(node.id) || nodes.has(node.id) || !id(node.npcId) || !key(node.textKey)
      || !validConditions(node.conditions, quests)
      || !array(node.options, MAX_OPTIONS, 1)) return false;
    const optionIds = new Set<string>();
    for (const option of node.options) {
      if (!record(option)
        || !onlyFields(option, ['id', 'textKey', 'whenLocked', 'conditions', 'nextNodeId', 'action'])
        || !id(option.id) || optionIds.has(option.id) || !key(option.textKey)
        || (option.whenLocked !== undefined
          && option.whenLocked !== 'disabled' && option.whenLocked !== 'hidden')
        || !validConditions(option.conditions, quests)
        || (option.nextNodeId !== undefined && !id(option.nextNodeId))
        || (option.action !== undefined && !validAction(option.action, quests))
        || (option.action === undefined && option.nextNodeId === undefined)) return false;
      optionIds.add(option.id);
    }
    nodes.set(node.id, node as unknown as DialogueNode);
  }
  for (const node of nodes.values()) {
    for (const option of node.options) {
      if (option.nextNodeId !== undefined
        && (nodes.get(option.nextNodeId) === undefined
          || nodes.get(option.nextNodeId)!.npcId !== node.npcId)) return false;
    }
  }
  return true;
}

function allDone(quest: QuestDefinition, state: QuestRuntimeState): boolean {
  return quest.objectives.every(objective => state.counters[objective.id] === objective.targetCount);
}
function validCounters(quest: QuestDefinition, value: unknown): value is Record<string, number> {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  return keys.length === quest.objectives.length
    && quest.objectives.every(objective =>
      Object.hasOwn(value, objective.id)
      && integer(value[objective.id], 0, objective.targetCount)
    );
}

/** Validate all character-only progress received from a save or bridge boundary. */
export function validateQuestLedger(catalog: QuestCatalog, value: unknown): value is QuestLedger {
  if (!validateQuestCatalog(catalog) || !record(value)
    || !onlyFields(value, ['quests'])
    || !array(value.quests, catalog.quests.length, catalog.quests.length)) return false;
  const found = new Set<string>();
  for (const raw of value.quests) {
    if (!record(raw)
      || !onlyFields(raw, ['questId', 'status', 'counters', 'processedEventIds', 'rewardClaimed'])
      || !id(raw.questId) || found.has(raw.questId) || !status(raw.status)
      || typeof raw.rewardClaimed !== 'boolean'
      || !array(raw.processedEventIds, MAX_EVENTS)
      || !raw.processedEventIds.every(id)
      || !uniqueStrings(raw.processedEventIds)) return false;
    const quest = questById(catalog, raw.questId);
    if (!quest || !validCounters(quest, raw.counters)) return false;
    const state = raw as unknown as QuestRuntimeState;
    const complete = allDone(quest, state);
    if (state.rewardClaimed !== (state.status === 'completed')) return false;
    if (state.status === 'available' && (
      state.processedEventIds.length !== 0
      || quest.objectives.some(o => state.counters[o.id] !== 0))) return false;
    if ((state.status === 'ready' || state.status === 'completed') && !complete) return false;
    if (state.status === 'active' && complete) return false;
    if (state.status === 'failed' && quest.failureEventId === undefined) return false;
    found.add(state.questId);
  }
  return found.size === catalog.quests.length;
}

/** A clean initial record for every quest; prerequisites are checked on accept. */
export function createQuestLedger(catalog: QuestCatalog): QuestLedger | null {
  if (!validateQuestCatalog(catalog)) return null;
  return {
    quests: catalog.quests.map(quest => ({
      questId: quest.id, status: 'available' as const,
      counters: Object.fromEntries(quest.objectives.map(objective => [objective.id, 0])),
      processedEventIds: [], rewardClaimed: false
    }))
  };
}
function prepared(
  catalog: QuestCatalog, ledger: QuestLedger, questId: string
): { quest: QuestDefinition; state: QuestRuntimeState } | null {
  if (!id(questId) || !validateQuestLedger(catalog, ledger)) return null;
  const quest = questById(catalog, questId);
  const state = stateById(ledger, questId);
  return quest && state ? { quest, state } : null;
}
function noChange(ledger: QuestLedger): QuestTransition {
  return { ledger, changed: false, rewardPlan: null };
}
function change(
  ledger: QuestLedger, questId: string, next: QuestRuntimeState,
  rewardPlan: QuestRewardPlan | null = null
): QuestTransition {
  return {
    ledger: { quests: ledger.quests.map(quest => quest.questId === questId ? next : quest) },
    changed: true, rewardPlan
  };
}
function prereqsCompleted(quest: QuestDefinition, ledger: QuestLedger): boolean {
  return quest.prerequisites.every(questId => stateById(ledger, questId)?.status === 'completed');
}

/** Only the authoritative caller may replace its ledger with the proposed result. */
export function acceptQuest(
  catalog: QuestCatalog, ledger: QuestLedger, questId: string
): QuestTransition | null {
  const pair = prepared(catalog, ledger, questId);
  if (!pair) return null;
  const { quest, state } = pair;
  if (state.status === 'active') return noChange(ledger);
  if (state.status !== 'available' || !prereqsCompleted(quest, ledger)) return null;
  return change(ledger, questId, { ...state, status: 'active' });
}

/**
 * Ignore unrelated event kinds and duplicate unique occurrence IDs.
 * Once the bounded replay log fills up, reject new occurrences: never evict
 * entries and accidentally allow an old combat/world event to count twice.
 */
export function advanceObjective(
  catalog: QuestCatalog, ledger: QuestLedger, questId: string,
  eventId: string, occurrenceId: string, amount = 1
): QuestTransition | null {
  const pair = prepared(catalog, ledger, questId);
  if (!pair || !id(eventId) || !id(occurrenceId)
    || !integer(amount, 1, MAX_INCREMENT)) return null;
  const { quest, state } = pair;
  if (state.status !== 'active') return noChange(ledger);
  const relevant = quest.objectives.filter(o => o.eventId === eventId);
  if (relevant.length === 0 || state.processedEventIds.includes(occurrenceId)) {
    return noChange(ledger);
  }
  if (state.processedEventIds.length >= MAX_EVENTS) return null;
  const counters: Record<string, number> = { ...state.counters };
  for (const objective of relevant) {
    counters[objective.id] = Math.min(objective.targetCount, counters[objective.id] + amount);
  }
  const completed = quest.objectives.every(o => counters[o.id] === o.targetCount);
  return change(ledger, questId, {
    ...state, counters,
    processedEventIds: [...state.processedEventIds, occurrenceId],
    status: completed ? 'ready' : 'active'
  });
}

/** Failure is opt-in, event-typed, terminal, and never revokes a claimed reward. */
export function failQuest(
  catalog: QuestCatalog, ledger: QuestLedger, questId: string, eventId: string
): QuestTransition | null {
  const pair = prepared(catalog, ledger, questId);
  if (!pair || !id(eventId)) return null;
  const { quest, state } = pair;
  if (quest.failureEventId === undefined || eventId !== quest.failureEventId) return null;
  if (state.status === 'failed') return noChange(ledger);
  if (state.status !== 'active' && state.status !== 'ready') return null;
  return change(ledger, questId, { ...state, status: 'failed' });
}

/**
 * Issues a reward plan exactly once in this ledger's transition history.
 * No gold or XP is awarded here; the integrator must atomically apply this
 * plan AND persist the updated quest state using one authoritative executor.
 */
export function turnInQuest(
  catalog: QuestCatalog, ledger: QuestLedger, questId: string
): QuestTransition | null {
  const pair = prepared(catalog, ledger, questId);
  if (!pair) return null;
  const { quest, state } = pair;
  if (state.status === 'completed' && state.rewardClaimed) return noChange(ledger);
  if (state.status !== 'ready' || state.rewardClaimed || !allDone(quest, state)) return null;
  return change(
    ledger, questId, { ...state, status: 'completed', rewardClaimed: true },
    { questId, gold: quest.reward.gold, xp: quest.reward.xp }
  );
}

function validDialogueContext(context: unknown): context is DialogueContext {
  if (!record(context) || !onlyFields(context, ['npcId', 'npcStates', 'campaignFlags'])
    || !id(context.npcId)) return false;
  if (context.npcStates !== undefined) {
    if (!record(context.npcStates) || Object.keys(context.npcStates).length > MAX_DIALOGUE_NODES
      || Object.entries(context.npcStates).some(([npcId, state]) => !id(npcId) || !id(state))) {
      return false;
    }
  }
  if (context.campaignFlags !== undefined
    && (!array(context.campaignFlags, MAX_EVENTS)
      || !context.campaignFlags.every(id)
      || !uniqueStrings(context.campaignFlags))) return false;
  return true;
}
function conditionsMet(
  conditions: readonly DialogueCondition[] | undefined,
  catalog: QuestCatalog, ledger: QuestLedger, context: DialogueContext
): boolean {
  return (conditions ?? []).every(condition => {
    switch (condition.type) {
      case 'questStatus':
        return stateById(ledger, condition.questId)?.status === condition.status;
      case 'questAvailable': {
        const quest = questById(catalog, condition.questId);
        return quest !== undefined && stateById(ledger, condition.questId)?.status === 'available'
          && prereqsCompleted(quest, ledger);
      }
      case 'objectiveAtLeast':
        return (stateById(ledger, condition.questId)?.counters[condition.objectiveId] ?? -1)
          >= condition.count;
      case 'npcState':
        return context.npcStates?.[condition.npcId] === condition.stateId;
      case 'campaignFlag':
        return (context.campaignFlags?.includes(condition.flagId) ?? false) === condition.enabled;
    }
  });
}
function actionAllowed(
  action: DialogueAction | undefined, catalog: QuestCatalog, ledger: QuestLedger
): boolean {
  if (!action || action.type === 'close') return true;
  const state = stateById(ledger, action.questId);
  if (!state) return false;
  if (action.type === 'turnInQuest') return state.status === 'ready' && !state.rewardClaimed;
  const quest = questById(catalog, action.questId);
  return state.status === 'available' && quest !== undefined && prereqsCompleted(quest, ledger);
}
function copyAction(action: DialogueAction | undefined): DialogueAction | null {
  return action ? { ...action } : null;
}

/** A live view projection; no stored selection/dialogue progress, no translated text. */
export function evaluateDialogue(
  catalog: QuestCatalog, ledger: QuestLedger, nodeId: string, context: DialogueContext
): EvaluatedDialogue | null {
  if (!id(nodeId) || !validateQuestLedger(catalog, ledger)
    || !validDialogueContext(context)) return null;
  const node = catalog.dialogueNodes.find(node => node.id === nodeId);
  if (!node || node.npcId !== context.npcId
    || !conditionsMet(node.conditions, catalog, ledger, context)) return null;
  const options: EvaluatedDialogueOption[] = [];
  for (const option of node.options) {
    const enabled = conditionsMet(option.conditions, catalog, ledger, context)
      && actionAllowed(option.action, catalog, ledger);
    if (!enabled && option.whenLocked !== 'disabled') continue;
    options.push({
      id: option.id, textKey: option.textKey, enabled,
      nextNodeId: option.nextNodeId ?? null, action: copyAction(option.action)
    });
  }
  return { id: node.id, textKey: node.textKey, options };
}

/** Reject hidden/disabled/unknown/stale choices; caller re-evaluates after actions. */
export function chooseDialogueOption(
  catalog: QuestCatalog, ledger: QuestLedger,
  nodeId: string, optionId: string, context: DialogueContext
): { nextNodeId: string | null; action: DialogueAction | null } | null {
  if (!id(optionId)) return null;
  const view = evaluateDialogue(catalog, ledger, nodeId, context);
  const chosen = view?.options.find(option => option.id === optionId && option.enabled);
  return chosen ? { nextNodeId: chosen.nextNodeId, action: copyAction(chosen.action ?? undefined) } : null;
}
