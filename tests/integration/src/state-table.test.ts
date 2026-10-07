/**
 * The transition table in contracts and the store agree on every pair of
 * states. canTransition is the table; terminal states have no exits; every
 * state is reachable from DRAFT; and the memory store accepts exactly the
 * pairs canTransition accepts.
 */
import { describe, expect, it } from "vitest";
import {
  DEAL_STATES,
  DEAL_TRANSITIONS,
  IllegalTransitionError,
  TERMINAL_STATES,
  assertTransition,
  canTransition,
  cleanPs5,
  isTerminal,
} from "@pay-pals/contracts";
import type { DealState } from "@pay-pals/contracts";
import { driveTo, pathTo, seedFixture } from "./seed";

const pairs: [DealState, DealState][] = DEAL_STATES.flatMap((from) => DEAL_STATES.map((to): [DealState, DealState] => [from, to]));

describe("DEAL_TRANSITIONS", () => {
  it("canTransition and assertTransition agree with the table for every pair", () => {
    for (const [from, to] of pairs) {
      const legal = DEAL_TRANSITIONS[from].includes(to);
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(legal);
      if (legal) expect(() => assertTransition(from, to)).not.toThrow();
      else expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
    }
  });

  it("never allows a state to move to itself", () => {
    for (const state of DEAL_STATES) expect(canTransition(state, state), state).toBe(false);
  });

  it("terminal states have no exits, and no other state is a dead end", () => {
    for (const state of DEAL_STATES) {
      const terminal = TERMINAL_STATES.includes(state);
      expect(isTerminal(state), state).toBe(terminal);
      expect(DEAL_TRANSITIONS[state].length === 0, state).toBe(terminal);
    }
  });

  it("reaches every state from DRAFT", () => {
    for (const state of DEAL_STATES) {
      const path = pathTo(state);
      let at: DealState = "DRAFT";
      for (const next of path) {
        expect(canTransition(at, next), `${at} -> ${next}`).toBe(true);
        at = next;
      }
      expect(at).toBe(state);
    }
  });
});

describe("memory store enforces the table", () => {
  it("accepts exactly the pairs canTransition accepts", async () => {
    for (const [from, to] of pairs) {
      const seeded = await seedFixture(cleanPs5);
      await driveTo(seeded, from);
      const { store, dealId } = seeded;
      expect((await store.getDeal(dealId))!.state).toBe(from);

      const attempt = store.transition(dealId, to, "system", `${from} -> ${to}`);
      if (canTransition(from, to)) {
        const deal = await attempt;
        expect(deal.state, `${from} -> ${to}`).toBe(to);
        expect((await store.listEvents(dealId)).at(-1)).toMatchObject({ kind: "state_changed", fromState: from, toState: to });
      } else {
        await expect(attempt, `${from} -> ${to}`).rejects.toBeInstanceOf(IllegalTransitionError);
        expect((await store.getDeal(dealId))!.state).toBe(from);
        const events = await store.listEvents(dealId);
        expect(events.filter((e) => e.kind === "state_changed")).toHaveLength(pathTo(from).length);
      }
    }
  });

  it("refuses to cancel once money has moved", async () => {
    for (const from of ["PAID", "SHIPPED", "DELIVERED", "COMPLETE", "ISSUE"] as const) {
      const seeded = await seedFixture(cleanPs5);
      await driveTo(seeded, from);
      await expect(seeded.store.transition(seeded.dealId, "CANCELLED", "buyer", "Cancel.")).rejects.toBeInstanceOf(IllegalTransitionError);
    }
  });
});
