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
  let app = await fetchApp({ instanceHost });

  let body = new FormData();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("client_id", app.client_id);
  body.set("client_secret", app.client_secret);
  body.set("redirect_uri", redirectUri);

  let response = await fetch(`https://${instanceHost}/oauth/token`, {
    method: "post",
    body,
  });

  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

export async function logIn({ instanceHost }) {
  let app = await fetchApp({ instanceHost });

  let redirectUri = new URL(window.location);
  redirectUri.searchParams.set("instance", instanceHost);

  let query = new URLSearchParams({
    response_type: "code",
    client_id: app.client_id,
    redirect_uri: redirectUri,
  });

  window.location = `https://${instanceHost}/oauth/authorize?${query}`;
}

export async function logOut({ instanceHost }) {
  storage.deleteToken(instanceHost);
}

async function fetchApp({ instanceHost }) {
  let response = await fetch(
    `https://ruvds.iliazeus.lol/mastodon-tree-reader/app?instance=${instanceHost}`
  );
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
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

export async function fetchPostTree(post, { instanceHost, markViewed = true }) {
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

  if (markViewed) storage.addPostViews(instanceHost, newPostViews);

  return post;
}

function* walkPostTree(tree) {
  yield tree;
  for (let r in tree.replies) yield* walkPostTree(r);
}

export async function* fetchTimeline(name, { instanceHost, limit = 1000 }) {
  let query = new URLSearchParams({ limit: 40 });
  let count = 0;

  while (count < limit) {
    let page = await get(`api/v1/timelines/${name}?${query}`, { instanceHost });
    if (page.length === 0) return;

    yield* page;

    query.set("max_id", page.at(-1).id);
    count += page.length;
  }
}

export async function recapTimeline(timeline, { instanceHost }) {
  let trees = new Map();
  let postsToTrees = new Map();

  for await (let post of timeline) {
    timeline.push(post);

    if (post.reblog) {
      let treeId = postsToTrees.get(post.reblog.id);
      if (treeId) {
        let tree = trees.get(treeId);
        tree.interactions.push({ type: "replyReblog", post });
      } else {
        let root = await fetchRootPostOfThread(post.reblog, { instanceHost });
        let tree = await fetchPostTree(root, {
          instanceHost,
          markViewed: false,
        });

        trees.set(tree.id, tree);
        for (let p of walkPostTree(tree)) postsToTrees.set(p.id, tree.id);

        tree.interactions = [];
        if (post.reblog.id === tree.id) {
          tree.interactions.push({ type: "reblog", post });
        } else {
          tree.interactions.push({ type: "replyReblog", post });
        }
      }
    } else {
      let treeId = postsToTrees.get(post.id);
      if (treeId) {
        let tree = trees.get(treeId);
        tree.interactions.push({ type: "reply", post });
      } else {
        let root = await fetchRootPostOfThread(post, { instanceHost });
        let tree = await fetchPostTree(root, {
          instanceHost,
          markViewed: false,
        });

        trees.set(tree.id, tree);
        for (let p of walkPostTree(tree)) postsToTrees.set(p.id, tree.id);

        tree.interactions = [];
        if (post.id === tree.id) {
          tree.interactions.push({ type: "root", post });
        } else {
          tree.interactions.push({ type: "reply", post });
        }
      }
    }
  }

  return [...trees.values()];
}

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
