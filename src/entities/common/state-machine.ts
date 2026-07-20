export type TransitionMap<State extends string> = Readonly<
  Record<State, readonly State[]>
>;

export class InvalidStateTransitionError<State extends string> extends Error {
  constructor(
    readonly machine: string,
    readonly from: State,
    readonly to: State,
  ) {
    super(`Invalid ${machine} transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

export function canTransition<State extends string>(
  transitions: TransitionMap<State>,
  from: State,
  to: State,
): boolean {
  return transitions[from].includes(to);
}

export function assertTransition<State extends string>(
  machine: string,
  transitions: TransitionMap<State>,
  from: State,
  to: State,
): void {
  if (!canTransition(transitions, from, to)) {
    throw new InvalidStateTransitionError(machine, from, to);
  }
}

