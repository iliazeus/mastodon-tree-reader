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

export function installPostTree(container, postTree, { instanceUrl }) {
  container.innerHTML = renderPostTree(postTree, { instanceUrl });

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

function renderPostTree(post, { instanceUrl, depth = 0 }) {
  let acctUrl = new URL("@" + post.account.acct, instanceUrl);
  let postUrl = new URL("@" + post.account.acct + "/" + post.id, instanceUrl);

  // prettier-ignore
  return `
    <details open class="post" id="post_${post.id}">
      <summary title="Show/hide post" style="border-left-color: ${getDepthColor(depth)}">
        <div class="header">
          <img class="avatar" alt="Avatar of ${post.account.username}" src="${post.account.avatar_static}" />
          <a class="username" title="Profile page of ${post.account.username} on ${instanceUrl.host}" rel="author" target="_blank" href="${acctUrl}">${post.account.username}</a>
          <a class="acct" title="Profile page of ${post.account.username} on their server" rel="author" target="_blank" href="${post.account.url}">@${post.account.acct.includes('@') ? post.account.acct : `${post.account.acct}@${instanceUrl.host}`}</a>
          <br />
          ${post.visibility === "public" ? `<span class="visibility" title="Public">🌐</span>` : ''}
          ${post.visibility === "unlisted" ? `<span class="visibility" title="Unlisted">🔓</span>` : ''}
          ${post.visibility === "private" ? `<span class="visibility" title="Followers only">🔒</span>` : ''}
          ${post.visibility === "direct" ? `<span class="visibility" title="Direct">✉️</span>` : ''}
          <a class="favourites_count" title="Open list of likes on ${instanceUrl.host}" target="_blank" href="${postUrl}/favourites">⭐${post.favourites_count}</a>
          <a class="reblogs_count" title="Open list of boosts on ${instanceUrl.host}" target="_blank" href="${postUrl}/reblogs">🚀${post.reblogs_count}</a>
          <a class="replies_count" title="Open replies on ${instanceUrl.host}" target="_blank" href="${postUrl}">🗨️${post.replies_count}</a>
          <a class="created_at" title="Open post on ${instanceUrl.host}" rel="alternate" target="_blank" href="${postUrl}">${new Date(post.edited_at ?? post.created_at).toLocaleString()}</a>
          ${post.edited_at ? `<span class="edited" title="Edited post">✏️</span>` : ''}
          </div>
        <div class="content">
          ${post.spoiler_text && `<details><summary>${post.spoiler_text}</summary>`}
          ${processContent(post.content)}
          ${post.spoiler_text && `</details>`}
        </div>
        ${renderAttachments(post.media_attachments)}
        <details class="actions">
          <summary></summary>
          <a class="action_close" title="Close this panel" onclick="this.parentElement.removeAttribute('open')" href="javascript:">❎</a>
          <a class="action_favourite" title="Like" href="javascript:">⭐</a>
          <a class="action_reblog" title="Boost" href="javascript:">🚀</a>
          <a class="action_post" title="Reply" target="_blank" href="${postUrl}">🗨️</a>
          <a class="action_account" title="Open author's profile" target="_blank" href="${acctUrl}">🙂</a>
          <a class="action_remote_post" title="Open on their server" target="_blank" href="${post.url}">🔗🗨️</a>
          <a class="action_remote_account" title="Open author's profile on their server" target="_blank" href="${post.account.url}">🔗🙂</a>
        </details>
      </summary>
      <div class="replies">${
        post.replies.map((reply) => renderPostTree(reply, { instanceUrl, depth: depth + 1 })).join('')
      }</div>
    </details>
  `;
}

function renderAttachments(atts) {
  if (!atts || atts.length === 0) return "";

  // prettier-ignore
  atts = atts.map((a) => {
    if (a.type === "image") return `<a title="${a.description ?? ''}" target="_blank" href="${a.url}"><img src="${a.preview_url}" alt="${a.description ?? ''}" /></a>`;
    return `<a href="${a.url}">${a.url}</a>`;
  });

  // prettier-ignore
  return `
    <details class="attachments">
      <summary>${pluralizeCount(atts.length, "attachment")}</summary>
      ${atts.join("")}
    </details>
  `;
}

function processContent(content) {
  content = content.replace(/(\r?\n|<br ?\/?>)\s*(\r?\n|<br ?\/?>)\s*/g, "<p>");
  if (!content.startsWith("<p")) content = "<p>" + content;
  return content;
}

function getDepthColor(depth) {
  let hue = (depth % 8) * (360 / 8);
  return `hsl(${hue} 90% 45%)`;
}

function pluralizeCount(count, label) {
  if (count === 1) return count + " " + label;
  else if (label.endsWith("y")) return count + " " + label.slice(0, -1) + "ies";
  else return count + " " + label + "s";
}
