/**
 * The "get set up" checklist a new organization sees at the top of its dashboard.
 *
 * Pure and small on purpose: the dashboard hands in what it already knows (the entrances and whether each
 * has a paired tablet, and how many people are in the organization) and gets back the steps. Nothing here
 * reads the database, the clock or the browser.
 *
 * Three steps, each a real thing that has to exist before attendance can work:
 *   1. an entrance (a location), 2. a paired tablet at it, 3. people to check in.
 * Once all three are done the checklist never shows again. It deliberately does NOT include "first
 * check-in", because that would reappear on a quiet day for an organization that is long set up.
 */

export interface SetupLocation {
  /** Whether a tablet is currently paired to this entrance. */
  isPaired: boolean;
}

export type SetupStepId = "entrance" | "tablet" | "team";

export interface SetupStep {
  id: SetupStepId;
  title: string;
  detail: string;
  done: boolean;
}

export interface SetupInput {
  locations: readonly SetupLocation[];
  /** Everyone in the organization, including the admin. A brand new organization has 1. */
  headcount: number;
}

export function buildSetupSteps(input: SetupInput): SetupStep[] {
  const locations = Array.isArray(input.locations) ? input.locations : [];
  const hasEntrance = locations.length > 0;
  const hasTablet = locations.some((l) => l?.isPaired === true);
  const hasTeam = Number.isFinite(input.headcount) && input.headcount > 1;

  return [
    {
      id: "entrance",
      title: "Add your entrance",
      detail: "Tell ChecIN where people check in, and the hours they are expected.",
      done: hasEntrance,
    },
    {
      id: "tablet",
      title: "Pair the entrance tablet",
      detail: hasEntrance
        ? "Generate a pairing code in Settings and type it into the tablet at the door."
        : "Add an entrance first, then pair its tablet.",
      done: hasTablet,
    },
    {
      id: "team",
      title: "Invite your team",
      detail: "Send each person a link. They create their account and can check in from their phone.",
      done: hasTeam,
    },
  ];
}

export interface SetupProgress {
  done: number;
  total: number;
  complete: boolean;
}

export function setupProgress(steps: readonly SetupStep[]): SetupProgress {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: steps.length > 0 && done === steps.length };
}

/** Where "hide for now" is remembered, per organization, in the viewer's own browser. */
export function setupHiddenKey(orgId: string): string {
  return `checin.setup.hidden.${orgId}`;
}
