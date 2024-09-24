import * as storage from "./storage.js";

export function setUp() {
  storage.setUp();
  checkLogInCallback();
}

export function isLoggedIn({ instanceUrl }) {
  return storage.getToken(instanceUrl) != null;
}

function checkLogInCallback() {
  let redirectUri = new URL(window.location);
  redirectUri.searchParams.delete("code");

  let location = new URL(window.location);
  let code = location.searchParams.get("code");
  let instanceUrl = location.searchParams.get("instanceUrl");

  location.searchParams.delete("code");
  location.searchParams.delete("instanceUrl");
  window.history.replaceState("", null, location);

  if (!code || !instanceUrl) return null;
  storage.setToken(instanceUrl, fetchToken({ instanceUrl, code, redirectUri }));
}

async function fetchToken({ instanceUrl, code, redirectUri }) {
  let body = new FormData();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("client_id", CLIENT_ID);
  body.set("client_secret", CLIENT_SECRET);
  body.set("redirect_uri", redirectUri);

  let response = await fetch(new URL("/oauth/token", instanceUrl), {
    method: "post",
    body,
  });

  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

export async function logIn({ instanceUrl }) {
  if (new URL(instanceUrl).host !== "lor.sh")
    throw new Error(`only implemented for lor.sh`);

  let redirectUri = new URL(window.location);
  redirectUri.searchParams.set("instanceUrl", instanceUrl);

  let query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
  });
  window.location = new URL("/oauth/authorize?" + query, instanceUrl);
}

export async function logOut({ instanceUrl }) {
  storage.deleteToken(instanceUrl);
}

export async function fetchPostByUrl(url, { instanceUrl }) {
  let query = new URLSearchParams({
    type: "statuses",
    resolve: true,
    limit: 1,
    q: url,
  });

  let result = await get(`api/v2/search?${query}`, { instanceUrl });
  let post = result.statuses[0];
  if (!post) throw new Error("post not found");
  return post;
}

export async function fetchRootPostOfThread(post, { instanceUrl }) {
  let context = await get(`api/v1/statuses/${post.id}/context`, {
    instanceUrl,
  });

  return context.ancestors[0] ?? post;
}

export async function fetchPostTree(post, { instanceUrl }) {
  post = { ...post };

  let context = await get(`api/v1/statuses/${post.id}/context`, {
    instanceUrl,
  });

  let posts = new Map();
  posts.set(post.id, post);
  for (let p of context.descendants) posts.set(p.id, p);

  for (let p of posts.values()) {
    if (!p.replies) p.replies = [];
    if (!p.in_reply_to_id) continue;
    let parent = posts.get(p.in_reply_to_id);
    if (!parent) continue;
    if (!parent.replies) parent.replies = [];
    parent.replies.push(p);
  }

  return post;
}

const CLIENT_ID = "CIJFrOR_hvQC0hjR8VGer2a7mEquYYzswH8UmcDsRrE";
const CLIENT_SECRET = "NvixkNKze_pdrddUP6PIUnK_aYzS1IiAEMevYMREY-k";

async function get(path, { instanceUrl }) {
  let url = new URL(path, instanceUrl);
  let headers = {};

  let token = await storage.getToken(instanceUrl);
  if (token) headers.authorization = `Bearer ${token.access_token}`;

  let response = await fetch(url, { headers });
  let json = await response.json();
  if (!response.ok) throw new Error(json.error);
  return json;
}
