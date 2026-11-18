export interface UpdateState {
  etag?: string;
  checkedAt?: number;
  latest?: string;
  notes?: string;
  url?: string;
  skipped?: string;
}

export interface UpdateCheckResult {
  status: "unconfigured" | "current" | "available" | "error";
  latest?: string;
  notes?: string;
  url?: string;
  state: UpdateState;
  error?: string;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdate(
  repo: string | undefined,
  current: string,
  prev: UpdateState,
  force = false,
): Promise<UpdateCheckResult> {
  if (!repo) {
    return { status: "unconfigured", state: prev };
  }
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (prev.etag && !force) headers["If-None-Match"] = prev.etag;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases/latest`,
      { headers },
    );
    if (res.status === 304) {
      const latest = prev.latest;
      const available =
        latest &&
        compareSemver(latest, current) > 0 &&
        prev.skipped !== latest;
      return {
        status: available ? "available" : "current",
        latest,
        notes: prev.notes,
        url: prev.url,
        state: { ...prev, checkedAt: Date.now() },
      };
    }
    if (!res.ok) {
      return {
        status: "error",
        state: prev,
        error: `GitHub 返回 ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      tag_name?: string;
      body?: string;
      html_url?: string;
    };
    const latest = json.tag_name ?? "";
    const state: UpdateState = {
      etag: res.headers.get("ETag") ?? undefined,
      checkedAt: Date.now(),
      latest,
      notes: json.body ?? "",
      url: json.html_url ?? "",
      skipped: prev.skipped,
    };
    const available =
      compareSemver(latest, current) > 0 && prev.skipped !== latest;
    return {
      status: available ? "available" : "current",
      latest,
      notes: state.notes,
      url: state.url,
      state,
    };
  } catch (err) {
    return { status: "error", state: prev, error: String(err) };
  }
}