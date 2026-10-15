import type { Fetcher, JobBoardRef, JobPlatform, JobsData, SiteData } from "../types";

export interface JobCandidate extends JobBoardRef {
  linkedFromSite: boolean;
}

export interface JobCount {
  openings: number;
  byArea: Record<string, number>;
}

const PLATFORMS: JobPlatform[] = ["greenhouse", "lever", "ashby"];

const ENDPOINTS: Record<JobPlatform, (token: string) => string> = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/departments`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
};

export function jobCandidates(site: SiteData | null, rootDomain: string): JobCandidate[] {
  const out: JobCandidate[] = [];
  const add = (c: JobCandidate) => {
    if (!out.some((o) => o.platform === c.platform && o.token.toLowerCase() === c.token.toLowerCase())) out.push(c);
  };
  for (const b of site?.jobBoards ?? []) add({ ...b, linkedFromSite: true });
  const label = rootDomain.split(".")[0];
  if (label) for (const platform of PLATFORMS) add({ platform, token: label, linkedFromSite: false });
  return out.slice(0, 6);
}

const area = (...names: unknown[]) => {
  const n = names.find((x): x is string => typeof x === "string" && x.trim().length > 0);
  return n ? n.trim() : "Otros";
};

function tally(areas: string[]): JobCount {
  const byArea: Record<string, number> = {};
  for (const a of areas) byArea[a] = (byArea[a] ?? 0) + 1;
  return { openings: areas.length, byArea };
}

export function parseGreenhouse(json: unknown): JobCount | null {
  const departments = (json as { departments?: { name?: unknown; jobs?: { id?: unknown }[] }[] } | null)?.departments;
  if (!Array.isArray(departments)) return null;
  const ids = new Set<unknown>();
  const byArea: Record<string, number> = {};
  for (const d of departments) {
    const jobs = Array.isArray(d.jobs) ? d.jobs : [];
    if (jobs.length === 0) continue;
    byArea[area(d.name)] = jobs.length;
    jobs.forEach((j) => ids.add(j.id));
  }
  return { openings: ids.size, byArea };
}

export function parseLever(json: unknown): JobCount | null {
  if (!Array.isArray(json)) return null;
  return tally(
    json.map((p) => {
      const c = (p as { categories?: { department?: unknown; team?: unknown } }).categories ?? {};
      return area(c.department, c.team);
    }),
  );
}

export function parseAshby(json: unknown): JobCount | null {
  const jobs = (json as { jobs?: { department?: unknown; team?: unknown; isListed?: unknown }[] } | null)?.jobs;
  if (!Array.isArray(jobs)) return null;
  return tally(jobs.filter((j) => j.isListed !== false).map((j) => area(j.department, j.team)));
}

const PARSERS: Record<JobPlatform, (json: unknown) => JobCount | null> = {
  greenhouse: parseGreenhouse,
  lever: parseLever,
  ashby: parseAshby,
};

export async function fetchJobs(candidates: JobCandidate[], fetcher: Fetcher): Promise<JobsData | null> {
  const results = await Promise.allSettled(
    candidates.map(async (c) => {
      const res = await fetcher(ENDPOINTS[c.platform](c.token), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return PARSERS[c.platform](await res.json().catch(() => null));
    }),
  );

  if (results.length > 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("Las plataformas de empleo no responden");
  }

  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const c = candidates[i];
    if (r.value.openings > 0 || c.linkedFromSite) {
      return { platform: c.platform, token: c.token, openings: r.value.openings, byArea: r.value.byArea, linkedFromSite: c.linkedFromSite };
    }
  }
  return null;
}
