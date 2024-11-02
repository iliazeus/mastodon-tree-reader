export function setUp() {
  {
    // prevent details collapsing on selection
    let tt = null;
    document.addEventListener("mousedown", (e) => {
      tt = window.getSelection()?.type;
    });
    document.addEventListener("click", (e) => {
      let s = e.target.closest("summary");
      let t = window.getSelection()?.type;
      if (e.button === 0 && s && (t === "Range" || tt === "Range"))
        e.preventDefault();
    });
  }

  // suppport "long tap" gesture to open action menu
  document.addEventListener("contextmenu", (e) => {
    let a = e.target.closest(".post > summary")?.querySelector(".actions");
    if (a && a.hasAttribute("open")) {
      a.removeAttribute("open");
    } else if (a) {
      a.setAttribute("open", "");
      e.preventDefault();
    }
  });
}

export function installPostTree(container, postTree, { instanceHost }) {
  container.innerHTML = renderPostTree(postTree, { instanceHost });

  container
    .querySelectorAll(".post > summary > .actions")
    .forEach((el) => (el.open = null));

  container.querySelectorAll(".post").forEach((el) => {
    el.addEventListener("toggle", (e) => {
      if (!e.target.hasAttribute("open")) {
        e.target
          .querySelectorAll(".post:not([open])")
          .forEach((el) => el.setAttribute("open", ""));
        e.target
          .querySelectorAll(".actions[open]")
          .forEach((el) => el.removeAttribute("open"));
        e.target.scrollIntoView({ block: "nearest" });
      }
    });
  });

  let excerpt = container.querySelector(".content").innerText;
  if (excerpt.length > 100) excerpt = excerpt.slice(0, 100 - 3) + "...";
  document.title = excerpt + " | Treeder";

  let location = new URL(window.location);
  location.searchParams.set("post", postTree.url);
  window.history.replaceState(null, "", location);
}

export function uninstallPostTree(container) {
  container.innerHTML = "";

  let location = new URL(window.location);
  location.searchParams.delete("post");
  window.history.replaceState(null, "", location);
}

function renderPostTree(
  post,
  { instanceHost, depth = 0, rootPostViewed = post.viewed }
) {
  let acctUrl = `https://${instanceHost}/@${post.account.acct}`;
  let postUrl = `${acctUrl}/${post.id}`;
  let postNew = depth > 0 && rootPostViewed && !post.viewed;

  // prettier-ignore
  return `
    <details open class="${postNew ? "post post-new" : "post"}" id="post_${post.id}">
      <summary title="Show/hide post" style="border-left-color: ${getDepthColor(depth)}">
        <div class="header">
          <img class="avatar" alt="Avatar of ${post.account.username}" src="${post.account.avatar_static}" />
          <a class="username" title="Profile page of ${post.account.username} on ${instanceHost}" rel="author" target="_blank" href="${acctUrl}">${post.account.username}</a>
          <a class="acct" title="Profile page of ${post.account.username} on their server" rel="author" target="_blank" href="${post.account.url}">@${post.account.acct.includes('@') ? post.account.acct : `${post.account.acct}@${instanceHost}`}</a>
          <br />
          ${post.visibility === "public" ? `<span class="visibility" title="Public">🌐</span>` : ''}
          ${post.visibility === "unlisted" ? `<span class="visibility" title="Unlisted">🔓</span>` : ''}
          ${post.visibility === "private" ? `<span class="visibility" title="Followers only">🔒</span>` : ''}
          ${post.visibility === "direct" ? `<span class="visibility" title="Direct">✉️</span>` : ''}
          <a class="favourites_count" title="Open list of likes on ${instanceHost}" target="_blank" href="${postUrl}/favourites">⭐${post.favourites_count}</a>
          <a class="reblogs_count" title="Open list of boosts on ${instanceHost}" target="_blank" href="${postUrl}/reblogs">🚀${post.reblogs_count}</a>
          <a class="replies_count" title="Open replies on ${instanceHost}" target="_blank" href="${postUrl}">🗨️${post.replies_count}</a>
          <a class="created_at" title="Open post on ${instanceHost}" rel="alternate" target="_blank" href="${postUrl}">${new Date(post.edited_at ?? post.created_at).toLocaleString()}</a>
          ${post.edited_at ? `<span class="edited" title="Edited post">✏️</span>` : ''}
          </div>
        <div class="content">
          ${post.spoiler_text && `<details><summary>${post.spoiler_text}</summary>`}
          ${processContent(post)}
          ${post.spoiler_text && `</details>`}
        </div>
        ${renderPoll(post.poll)}
        ${renderAttachments(post.media_attachments)}
        <details class="actions">
          <summary></summary>
          <a class="action_close" title="Close this panel" onclick="this.parentElement.removeAttribute('open')" href="javascript:">❎</a>
          <a class="action_post" title="Reply" target="_blank" href="${postUrl}">🗨️</a>
          <a class="action_account" title="Open author's profile" target="_blank" href="${acctUrl}">🙂</a>
          <a class="action_remote_post" title="Open on their server" target="_blank" href="${post.url}">🔗🗨️</a>
          <a class="action_remote_account" title="Open author's profile on their server" target="_blank" href="${post.account.url}">🔗🙂</a>
        </details>
      </summary>
      <div class="replies">${
        post.replies.map((reply) => renderPostTree(reply, { instanceHost, depth: depth + 1, rootPostViewed })).join('')
      }</div>
    </details>
  `;
}

function renderAttachments(atts) {
  if (!atts || atts.length === 0) return "";

  atts = atts.map((a) => {
    switch (a.type) {
      case "image":
      case "video":
      case "gifv":
        // prettier-ignore
        return `<a title="${a.description ?? ''}" target="_blank" href="${a.url}"><img src="${a.preview_url}" alt="${a.description ?? ''}" /></a>`;
      case "audio":
        return `<audio title="${a.description}" controls src="${a.url}"></audio>`;
      default:
        return `<a href="${a.url}">${a.url}</a>`;
    }
  });

  // prettier-ignore
  return `
    <details class="attachments">
      <summary>${pluralizeCount(atts.length, "attachment")}</summary>
      ${atts.join("")}
    </details>
  `;
}

function renderPoll(poll) {
  if (!poll) return "";

  // prettier-ignore
  let options = poll.options.map((opt) => `
    <div class="option">
      <label>
        <progress value="${opt.votes_count}" max="${poll.voters_count ?? poll.votes_count}"></progress>
        ${opt.votes_count} / ${poll.voters_count ?? poll.votes_count} - ${opt.title}
      </label>
    </div>
  `);

  return `
    <div class="poll">
      ${options.join("\n")}
    </div>
  `;
}

function processContent(post) {
  let content = post.content;

  content = content.replace(/(\r?\n|<br ?\/?>)\s*(\r?\n|<br ?\/?>)\s*/g, "<p>");
  if (!content.startsWith("<p")) content = "<p>" + content;

  for (let emoji of post.emojis) {
    content = content.replaceAll(
      ":" + emoji.shortcode + ":",
      `<img class="emoji" title=":${emoji.shortcode}:" src="${emoji.static_url}" />`
    );
  }

  return content;
}

function getDepthColor(depth) {
  let i = depth % 8;
  let hue = i * (360 / 8);
  if (i === 2) hue -= 20;
  let sat = 90 - i * 3;
  let lit = 45 + i * 2;
  return `hsl(${hue} ${sat}% ${lit}%)`;
}

function pluralizeCount(count, label) {
  if (count === 1) return count + " " + label;
  else if (label.endsWith("y")) return count + " " + label.slice(0, -1) + "ies";
  else return count + " " + label + "s";
}
