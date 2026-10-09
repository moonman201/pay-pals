/** Types for the prebuild photo copy, which is plain ESM so node can run it with no build step. */
export declare const WEB_IMAGE: RegExp;

export declare function copyDemoPhotos(
  source: string,
  target: string,
): { copied: string[]; skipped: string[]; folders: string[] };
