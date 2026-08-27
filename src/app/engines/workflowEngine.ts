// SiteTrack Pro — VNext P1.1: declarative workflow engine.
// Pure, DOM-free state-machine helpers. Workflow *definitions* are declared in
// workflowDefinitions.ts (the declare-first register) and persisted to
// workflow_definitions by migration 207. Every hand-rolled `*_NEXT` ladder in
// the query files is now DERIVED from a workflow definition via workflowNextMap,
// so the register is the single source of truth for status transitions.

export interface WorkflowTransition<S extends string = string> {
  /** source state */
  from: S;
  /** target state */
  to: S;
  /** capability ids (all required) to take this transition — optional */
  requires?: readonly string[];
  /** canonical next when several outbound transitions exist (used by workflowNextMap) */
  primary?: boolean;
}

export interface WorkflowDefinition<S extends string = string> {
  id: string;
  name: string;
  description?: string;
  initial: S;
  states: readonly S[];
  transitions: readonly WorkflowTransition<S>[];
}

export class WorkflowError extends Error {
  constructor(public readonly defId: string, public readonly from: string, public readonly to: string) {
    super(`workflow '${defId}': illegal transition ${from} → ${to}`);
    this.name = "WorkflowError";
  }
}

/** Validate a workflow definition and freeze it. Throws on malformed defs. */
export function defineWorkflow<S extends string>(def: WorkflowDefinition<S>): WorkflowDefinition<S> {
  if (!def.id) throw new Error("workflow: id is required");
  if (def.states.length === 0) throw new Error(`workflow '${def.id}': at least one state is required`);
  if (!def.states.includes(def.initial)) throw new Error(`workflow '${def.id}': initial '${def.initial}' not in states`);
  const seen = new Set<string>();
  const outgoing = new Map<string, number>();
  for (const t of def.transitions) {
    if (!def.states.includes(t.from)) throw new Error(`workflow '${def.id}': transition from unknown state '${t.from}'`);
    if (!def.states.includes(t.to)) throw new Error(`workflow '${def.id}': transition to unknown state '${t.to}'`);
    const key = `${t.from}\u0000${t.to}`;
    if (seen.has(key)) throw new Error(`workflow '${def.id}': duplicate transition ${t.from} → ${t.to}`);
    seen.add(key);
    outgoing.set(t.from, (outgoing.get(t.from) ?? 0) + 1);
  }
  for (const s of def.states) {
    const outs = def.transitions.filter(t => t.from === s);
    const targets = new Set(outs.map(t => t.to));
    if (targets.size > 1 && !outs.some(t => t.primary)) {
      throw new Error(`workflow '${def.id}': state '${s}' branches to ${[...targets].join(", ")} but no transition is marked primary`);
    }
  }
  return def;
}

/** All reachable states from `from` (distinct targets). */
export function nextStates<S extends string>(def: WorkflowDefinition<S>, from: S): S[] {
  const seen = new Set<S>();
  for (const t of def.transitions) if (t.from === from) seen.add(t.to);
  return [...seen];
}

/** True if a legal transition exists (optionally requiring a capability set). */
export function canTransition<S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
  to: S,
  caps?: ReadonlySet<string>,
): boolean {
  const t = def.transitions.find(x => x.from === from && x.to === to);
  if (!t) return false;
  if (caps && t.requires && t.requires.length > 0) {
    return t.requires.every(r => caps.has(r));
  }
  return true;
}

/** Transition if legal, else throw WorkflowError. Returns the target state. */
export function transit<S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
  to: S,
  caps?: ReadonlySet<string>,
): S {
  if (!canTransition(def, from, to, caps)) throw new WorkflowError(def.id, from, to);
  return to;
}

/**
 * Single-next map in the historical `*_NEXT` convention: for each state, the
 * canonical next state, or null when terminal. Rule: exactly one outbound
 * transition → its target; several → the one flagged `primary`; none → null.
 * Self-loop transitions (a state advancing to itself) are declared explicitly
 * in the def, so "terminal stays put" maps are reproduced faithfully.
 */
export function workflowNextMap<S extends string>(def: WorkflowDefinition<S>): Record<S, S | null> {
  const map = {} as Record<S, S | null>;
  for (const s of def.states) {
    const outs = def.transitions.filter(t => t.from === s);
    if (outs.length === 0) {
      map[s] = null;
    } else if (outs.length === 1) {
      map[s] = outs[0].to;
    } else {
      const primary = outs.find(t => t.primary);
      map[s] = primary ? primary.to : null;
    }
  }
  return map;
}

/** States with no outgoing transition (legal final states). */
export function terminalStates<S extends string>(def: WorkflowDefinition<S>): S[] {
  return def.states.filter(s => !def.transitions.some(t => t.from === s));
}

/** Legal (to, requires) actions from a state — for rendering advance buttons. */
export function transitionActions<S extends string>(
  def: WorkflowDefinition<S>,
  from: S,
): ReadonlyArray<{ to: S; requires?: readonly string[]; primary?: boolean }> {
  return def.transitions.filter(t => t.from === from).map(t => ({ to: t.to, requires: t.requires, primary: t.primary }));
}
