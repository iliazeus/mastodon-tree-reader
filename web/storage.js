let storage = {};
let pendingTokens = new Map();

export function setUp() {
  load();
}

function load() {
  storage = window.localStorage.getItem("treeder/v2");
  if (storage) {
    storage = JSON.parse(storage);
    return;
  }

  storage = window.localStorage.getItem("treeder/v1");
  if (storage) {
    storage = JSON.parse(storage);

    storage.instances = {};
    for (let key in storage.tokens) {
      let instance = getOrCreateInstance(key);
      instance.token = storage.tokens[key];
    }
    delete storage.tokens;

    window.localStorage.removeItem("treeder/v1");
    save();
    return;
  }

  storage = {
    defaultInstance: null,
    instances: {},
  };
  save();
}

function save() {
  window.localStorage.setItem("treeder/v2", JSON.stringify(storage));
}

function getOrCreateInstance(host) {
  storage.instances[host] ??= { postViews: {} };
  return storage.instances[host];
}

export function setToken(host, token) {
  token = Promise.resolve(token);
  pendingTokens.set(host, token);
  storage.defaultInstance = host;

  token.then((t) => {
    pendingTokens.delete(host);
    getOrCreateInstance(host).token = t;
    save();
  });
}

export function getToken(host) {
  return pendingTokens.get(host) ?? getOrCreateInstance(host).token;
}

export function deleteToken(host) {
  pendingTokens.delete(host);
  delete getOrCreateInstance(host).token;
  save();
}

export function getDefaultInstanceHost() {
  return storage.defaultInstance;
}

export function addPostViews(host, views) {
  let instance = getOrCreateInstance(host);
  Object.assign(instance.postViews, views);
  save();
}

export function getPostViews(host) {
  return { ...getOrCreateInstance(host).postViews };
}
