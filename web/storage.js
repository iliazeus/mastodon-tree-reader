let tokens = new Map();
let pendingTokens = new Map();

let defaultInstance = "";

export function setUp() {
  load();
}

function load() {
  let json = window.localStorage.getItem("treeder/v1");
  if (json) json = JSON.parse(json);
  else {
    json = { tokens: {}, defaultInstance: null };
    window.localStorage.setItem("treeder/v1", JSON.stringify(json));
  }

  tokens = new Map(Object.entries(json.tokens));
  defaultInstance = json.defaultInstance;
}

function save() {
  let json = { tokens: Object.fromEntries(tokens), defaultInstance };
  window.localStorage.setItem("treeder/v1", JSON.stringify(json));
}

export function setToken(instanceUrl, token) {
  let host = new URL(instanceUrl).host;

  token = Promise.resolve(token);
  pendingTokens.set(host, token);
  defaultInstance = host;

  token.then((t) => {
    pendingTokens.delete(host);
    tokens.set(host, t);
    save();
  });
}

export function getToken(instanceUrl) {
  let host = new URL(instanceUrl).host;
  return pendingTokens.get(host) ?? tokens.get(host);
}

export function deleteToken(instanceUrl) {
  let host = new URL(instanceUrl).host;
  pendingTokens.delete(host);
  tokens.delete(host);
  if (defaultInstance === host) defaultInstance = null;
  save();
}

export function getDefaultInstanceUrl() {
  return new URL("https://" + defaultInstance);
}
