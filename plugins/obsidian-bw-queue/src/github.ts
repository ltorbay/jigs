import { requestUrl, RequestUrlResponse } from "obsidian";
import { base64ToUtf8, utf8ToBase64 } from "./encoding";

export interface RepoTarget {
  token: string;
  repo: string;
  branch: string;
}

export interface RemoteFile {
  sha: string;
  content: string;
}

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const API = "https://api.github.com";

function contentsUrl(target: RepoTarget, path: string): string {
  const [owner, name] = target.repo.split("/").map((part) => encodeURIComponent(part.trim()));
  if (!owner || !name) throw new GitHubError(`repo "${target.repo}" is not owner/name`, 0);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${owner}/${name}/contents/${encodedPath}`;
}

function headers(target: RepoTarget): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${target.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function describe(response: RequestUrlResponse): string {
  try {
    const message = (response.json as { message?: unknown } | null)?.message;
    if (typeof message === "string") return message;
  } catch {
    return `HTTP ${response.status}`;
  }
  return `HTTP ${response.status}`;
}

export async function getFile(target: RepoTarget, path: string): Promise<RemoteFile | null> {
  const url = `${contentsUrl(target, path)}?ref=${encodeURIComponent(target.branch)}`;
  const response = await requestUrl({ url, method: "GET", headers: headers(target), throw: false });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new GitHubError(`GET ${path}: ${describe(response)}`, response.status);
  const body = response.json as { sha?: unknown; content?: unknown; encoding?: unknown };
  if (typeof body.sha !== "string" || typeof body.content !== "string" || body.encoding !== "base64") {
    throw new GitHubError(`GET ${path}: unexpected response shape (file over 1 MB?)`, response.status);
  }
  return { sha: body.sha, content: base64ToUtf8(body.content) };
}

async function putOnce(target: RepoTarget, path: string, content: string, sha: string | undefined): Promise<RequestUrlResponse> {
  const payload: Record<string, string> = {
    message: `bw-queue: update ${path}`,
    content: utf8ToBase64(content),
    branch: target.branch,
  };
  if (sha) payload.sha = sha;
  return requestUrl({
    url: contentsUrl(target, path),
    method: "PUT",
    headers: { ...headers(target), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    throw: false,
  });
}

function isShaConflict(status: number): boolean {
  return status === 409 || status === 422;
}

export async function putFile(target: RepoTarget, path: string, content: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await getFile(target, path);
    if (remote?.content === content) return;
    const response = await putOnce(target, path, content, remote?.sha);
    if (response.status === 200 || response.status === 201) return;
    if (!isShaConflict(response.status) || attempt === 1) {
      throw new GitHubError(`PUT ${path}: ${describe(response)}`, response.status);
    }
  }
}
