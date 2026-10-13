/** Types for the production smoke rules, which are plain ESM so node can run the script with no build step. */
export declare const SCENARIOS: readonly string[];
export declare const ROLES: readonly string[];
export declare const SLOW_MS: number;
export declare const EXPECTED: Record<string, { room: string[]; evidence: string[] }>;

export declare function parseArgs(argv: readonly string[], env?: Record<string, string | undefined>): { ok: true; base: string } | { ok: false; message: string };
export declare function findFinishedLinks(html: string): Record<string, string>;
export declare function asRole(href: string, role: string): string;
export declare function findEvidenceLink(roomHtml: string): string | null;
export declare function checkPage(
  result: { path: string; status: number; ms: number; body: string; finalPath?: string },
  expected: readonly string[],
): string[];
