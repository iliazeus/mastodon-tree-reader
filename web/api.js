import * as storage from "./storage.js";

export function setUp() {
  storage.setUp();
  checkLogInCallback();
}

export function isLoggedIn({ instanceHost }) {
  return storage.getToken(instanceHost) != null;
}

function checkLogInCallback() {
  let redirectUri = new URL(window.location);
  redirectUri.searchParams.delete("code");

  let location = new URL(window.location);
  let code = location.searchParams.get("code");
  let instanceHost = location.searchParams.get("instance");

  location.searchParams.delete("code");
  location.searchParams.delete("instance");
  window.history.replaceState("", null, location);

  if (!code || !instanceHost) return null;
  storage.setToken(
    instanceHost,
    fetchToken({ instanceHost, code, redirectUri })
  );
}

async function fetchToken({ instanceHost, code, redirectUri }) {
  let body = new FormData();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("client_id", CLIENT_ID);
  body.set("client_secret", CLIENT_SECRET);
  body.set("redirect_uri", redirectUri);

  let response = await fetch(`https://${instanceHost}/oauth/token`, {
    method: "post",
    body,
  });

  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

export async function logIn({ instanceHost }) {
  if (instanceHost !== "lor.sh") throw new Error(`only implemented for lor.sh`);

  let redirectUri = new URL(window.location);
  redirectUri.searchParams.set("instance", instanceHost);

  let query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
  });

  window.location = `https://${instanceHost}/oauth/authorize?${query}`;
}

export async function logOut({ instanceHost }) {
  storage.deleteToken(instanceHost);
}

export async function fetchPostByUrl(url, { instanceHost }) {
  let query = new URLSearchParams({
    type: "statuses",
    resolve: true,
    limit: 1,
    q: url,
  });

  let result = await get(`api/v2/search?${query}`, { instanceHost });
  let post = result.statuses[0];
  if (!post) throw new Error("post not found");
  return post;
}

export async function fetchRootPostOfThread(post, { instanceHost }) {
  if (!post.in_reply_to_id) return post;

  let context = await get(`api/v1/statuses/${post.id}/context`, {
    instanceHost,
  });

  return context.ancestors[0] ?? post;
}

export async function fetchPostTree(post, { instanceHost }) {
  let posts = new Map();
  posts.set(post.id, post);

  if (post.replies_count > 0) {
    let context = await get(`api/v1/statuses/${post.id}/context`, {
      instanceHost,
    });
    post.ancestors = context.ancestors;
    for (let p of context.descendants) posts.set(p.id, p);
  } else {
    post.ancestors = [];
  }

  for (let p of posts.values()) {
    if (!p.replies) p.replies = [];
    if (!p.in_reply_to_id) continue;
    let parent = posts.get(p.in_reply_to_id);
    if (!parent) continue;
    if (!parent.replies) parent.replies = [];
    parent.replies.push(p);
  }

  let postViews = storage.getPostViews(instanceHost);
  let newPostViews = {};
  let now = new Date();
  for (let p of posts.values()) {
    let postDate = new Date(p.edited_at ?? p.created_at);
    p.viewed = new Date(postViews[p.id]) >= postDate;
    newPostViews[p.id] = now;
  }
  storage.addPostViews(instanceHost, newPostViews);

  return post;
}

const CLIENT_ID = "CIJFrOR_hvQC0hjR8VGer2a7mEquYYzswH8UmcDsRrE";
const CLIENT_SECRET = "NvixkNKze_pdrddUP6PIUnK_aYzS1IiAEMevYMREY-k";

async function get(path, { instanceHost }) {
  let url = new URL(path, `https://${instanceHost}`);
  let headers = {};

  let token = await storage.getToken(instanceHost);
  if (token) headers.authorization = `Bearer ${token.access_token}`;

  let response = await fetch(url, { headers });

  if (response.status === 429) {
    await sleep(1000);
    return await get(path, { instanceHost });
  }

  let json = await response.json();
  if (!response.ok) throw new Error(json.error);
  return json;
}

function sleep(ms) {
  return new Promise((cb) => setTimeout(cb, ms));
}
