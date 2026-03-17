const REPO   = process.env.GITHUB_REPO   || 'TruthOriginem/Starsector-Localization-CN';
const BRANCH = process.env.GITHUB_BRANCH || 'master';

/** 返回远端最新 commit SHA */
export async function getLatestCommitSha(): Promise<string> {
  const url  = `https://api.github.com/repos/${REPO}/commits/${BRANCH}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'fossic-ss-file-browser-updater' },
  });

  if (!resp.ok) {
    throw new Error(`GitHub API 请求失败: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as { sha: string };
  return data.sha;
}
