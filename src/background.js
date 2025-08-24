// background.js - CORS Helper Pro Plus v3.1
// Adds: onboarding, badge color by mode, hinting for preflight failures.

const BASE_RULE_ID = 14000;
const LOG_LIMIT = 60;
const TICK_MINUTES = 1;

const COLOR_OFF = "#9e9e9e";        // grey
const COLOR_ALLOWLIST = "#1e88e5";   // blue
const COLOR_GLOBAL = "#fb8c00";      // amber

async function updateActionIcon() {
  const state = await getState();
  const { enabled, expiry_ts, profiles = {}, activeProfile } = state;
  const list = (profiles?.[activeProfile]?.allowlist) || [];
  const isGlobal = list.length === 0;
  const sizeMap = (dir) => ({
    "16":  `icons/${dir}/icons/16.png`,
    "32":  `icons/${dir}/icons/32.png`,
    "48":  `icons/${dir}/icons/48.png`,
    "128": `icons/${dir}/icons/128.png`
  });
  let dir = "off";
  if (enabled) {
    dir = isGlobal ? "global" : "allowlist";
  }
  try {
    await chrome.action.setIcon({ path: sizeMap(dir) });
  } catch (e) {
    // ignore
  }
}

async function getState() {
  const defaults = {
    enabled: false,
    expiry_ts: 0,
    activeProfile: "default",
    profiles: { "default": { allowlist: [] } },
    seen_onboarding: false
  };
  const syncData = await chrome.storage.sync.get(defaults);
  const localData = await chrome.storage.local.get({ logs: [] });
  return { ...syncData, logs: localData.logs || [] };
}

async function setSync(patch) { return chrome.storage.sync.set(patch); }
async function setLocal(patch) { return chrome.storage.local.set(patch); }

function ensureProfile(state, name) {
  if (!state.profiles[name]) state.profiles[name] = { allowlist: [] };
}

function domainToUrlFilter(entry) {
  try {
    if (entry.includes("://")) {
      const u = new URL(entry);
      return `||${u.hostname}^`;
    }
  } catch (_){}
  return `||${entry.replace(/^(\*\.)?/, "")}^`;
}

function buildRule(ruleId, urlFilter) {
  return {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "access-control-allow-origin", operation: "set", value: "*" },
        { header: "access-control-allow-methods", operation: "set", value: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
        { header: "access-control-allow-headers", operation: "set", value: "*" },
        { header: "access-control-expose-headers", operation: "set", value: "*" },
        { header: "access-control-allow-credentials", operation: "set", value: "true" }
      ]
    },
    condition: {
      urlFilter,
      resourceTypes: [
        "xmlhttprequest",
        "other",
        "sub_frame",
        "main_frame",
        "script",
        "image",
        "font",
        "stylesheet",
        "media",
        "object",
        "ping",
        "csp_report",
        "websocket",
        "webtransport",
        "webbundle"
      ]
    }
  };
}

async function applyRules() {
  const state = await getState();
  const { enabled, profiles, activeProfile } = state;

  // Clear our dynamic rules
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const myIds = current.filter(r => r.id >= BASE_RULE_ID && r.id < BASE_RULE_ID + 2000).map(r => r.id);
  if (myIds.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: myIds });

  if (!enabled) {
    await chrome.action.setBadgeText({ text: "OFF" });
    await chrome.action.setBadgeBackgroundColor({ color: COLOR_OFF });
    await chrome.action.setTitle({ title: "CORS Helper Pro Plus (OFF)" });
    await chrome.action.setIcon({ path: {"16":"icons/off16.png","32":"icons/off32.png","48":"icons/off48.png","128":"icons/off128.png"} });
    return;
  }

  const prof = profiles[activeProfile] || { allowlist: [] };
  const filters = (prof.allowlist && prof.allowlist.length) ? prof.allowlist.map(domainToUrlFilter) : ["*"];
  const rules = filters.map((f, idx) => buildRule(BASE_RULE_ID + idx, f));
  if (rules.length) await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });

  // Badge color by mode
  const isAllowlist = (prof.allowlist && prof.allowlist.length);
  const badgeColor = isAllowlist ? COLOR_ALLOWLIST : COLOR_GLOBAL;
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
  await updateBadgeCountdown();
  await updateActionIcon();
}

async function enable(durationMin = 0) {
  const patch = { enabled: true };
  if (durationMin > 0) {
    const expiry = Date.now() + durationMin*60*1000;
    patch.expiry_ts = expiry;
    await chrome.alarms.create("expire", { when: expiry });
    await chrome.alarms.create("tick", { periodInMinutes: TICK_MINUTES });
  } else {
    patch.expiry_ts = 0;
    await chrome.alarms.clear("expire");
    await chrome.alarms.clear("tick");
  }
  await setSync(patch);
  await applyRules();
}

async function disable() {
  await setSync({ enabled: false, expiry_ts: 0 });
  await chrome.alarms.clear("expire");
  await chrome.alarms.clear("tick");
  await applyRules();

  await updateActionIcon();
}

async function updateBadgeCountdown() {
  const { enabled, expiry_ts } = await getState();
  if (!enabled) return;
  if (!expiry_ts) {
    await chrome.action.setBadgeText({ text: "ON" });
    return;
  }
  const mins = Math.max(0, Math.ceil((expiry_ts - Date.now())/60000));
  await chrome.action.setBadgeText({ text: String(mins) });
  await chrome.action.setTitle({ title: `CORS Helper — auto-off in ~${mins} min` });
  if (mins <= 0) await disable();
}

function labelPreflight(status) {
  if (status >= 200 && status < 300) return null;
  if (status === 0) return "No response (blocked early)";
  if (status === 403) return "Preflight forbidden";
  if (status === 404) return "Preflight path not found";
  if (status >= 500) return "Server error on preflight";
  return "Preflight non-2xx";
}

async function pushLog(entry) {
  const store = await chrome.storage.local.get({ logs: [] });
  const arr = store.logs;
  arr.unshift(entry);
  if (arr.length > LOG_LIMIT) arr.pop();
  await chrome.storage.local.set({ logs: arr });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await setSync({ enabled: false, seen_onboarding: false });
    // Open onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
  // Context menu
  chrome.contextMenus.create({
    id: "allow-this-domain",
    title: "CORS Helper: Allow this domain",
    contexts: ["page", "frame", "link"]
  });
  await applyRules();
});

chrome.runtime.onStartup.addListener(applyRules);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "allow-this-domain" && tab && tab.url) {
    const url = new URL(tab.url);
    const host = url.hostname;
    const state = await getState();
    ensureProfile(state, state.activeProfile);
    const list = state.profiles[state.activeProfile].allowlist;
    if (!list.includes(host)) list.push(host);
    await setSync({ profiles: state.profiles });
    await applyRules();
  }
});

// Alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "expire") await disable();
  if (alarm.name === "tick") await updateBadgeCountdown();
  await updateActionIcon();
});

// DNR debug hits
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const { request = {}, rule = {} } = info || {};
    await pushLog({
      ts: Date.now(),
      url: request.url || "",
      method: request.method || "",
      resourceType: request.resourceType || "",
      ruleId: rule.id || 0
    });
  });
}

// webRequest onCompleted to capture status codes for logs and hint preflight issues
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { url, statusCode, method, type } = details;
    const store = await chrome.storage.local.get({ logs: [] });
    const idx = store.logs.findIndex(l => l.url === url && l.method === method);
    if (idx >= 0) {
      store.logs[idx].status = statusCode;
      store.logs[idx].resourceType = type || store.logs[idx].resourceType;
      if (method === "OPTIONS") store.logs[idx].hint = labelPreflight(statusCode);
      await chrome.storage.local.set({ logs: store.logs });
    } else {
      await pushLog({ ts: Date.now(), url, method, status: statusCode, resourceType: type||"", ruleId: 0, hint: method==="OPTIONS" ? labelPreflight(statusCode) : null });
    }
  },
  { urls: ["<all_urls>"] }
);

// Messages
async function handleRuntimeMessage(msg) {
  const state = await getState();

  if (msg && msg.type === "GET_STATE") {
    return state;

  } else if (msg && msg.type === "SET_ENABLED") {
    if (msg.enabled) {
      const list = state.profiles?.[state.activeProfile]?.allowlist || [];
      const isGlobal = !list.length;
      const dur = Number(msg.durationMinutes || 0);
      const forceInfinite = !!msg.forceInfinite;
      if (forceInfinite) {
        await enable(0);
        return { ok: true, enabled: true, appliedMinutes: 0, forced: true };
      } else {
        const applied = (isGlobal && dur === 0) ? 10 : dur;
        await enable(applied);
        return { ok: true, enabled: true, appliedMinutes: applied, forced: false };
      }
    } else {
      await disable();
      return { ok: true, enabled: false };
    }

  } else if (msg && msg.type === "SET_PROFILE") {
    const { name } = msg;
    ensureProfile(state, name);
    await setSync({ activeProfile: name, profiles: state.profiles });
    await applyRules();
    return { ok: true };

  } else if (msg && msg.type === "SAVE_PROFILES") {
    await setSync({ profiles: msg.profiles, activeProfile: msg.activeProfile });
    await applyRules();
    return { ok: true };

  } else if (msg && msg.type === "GET_LOGS") {
    const { logs = [] } = await chrome.storage.local.get({ logs: [] });
    return { logs };

  } else if (msg && msg.type === "CLEAR_LOGS") {
    await chrome.storage.local.set({ logs: [] });
    return { ok: true };

  } else if (msg && msg.type === "SEEN_ONBOARDING") {
    await setSync({ seen_onboarding: true });
    return { ok: true };
  }

  return { ok: false, error: "unknown" };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleRuntimeMessage(msg)
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok:false, error: String(err && err.message || err) }));
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "expire") await disable();
  if (alarm.name === "tick") await updateBadgeCountdown();
  await updateActionIcon();
});

// DNR debug hits
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const { request = {}, rule = {} } = info || {};
    await pushLog({
      ts: Date.now(),
      url: request.url || "",
      method: request.method || "",
      resourceType: request.resourceType || "",
      ruleId: rule.id || 0
    });
  });
}

// webRequest onCompleted to capture status codes for logs and hint preflight issues
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { url, statusCode, method, type } = details;
    const store = await chrome.storage.local.get({ logs: [] });
    const idx = store.logs.findIndex(l => l.url === url && l.method === method);
    if (idx >= 0) {
      store.logs[idx].status = statusCode;
      store.logs[idx].resourceType = type || store.logs[idx].resourceType;
      if (method === "OPTIONS") store.logs[idx].hint = labelPreflight(statusCode);
      await chrome.storage.local.set({ logs: store.logs });
    } else {
      await pushLog({ ts: Date.now(), url, method, status: statusCode, resourceType: type||"", ruleId: 0, hint: method==="OPTIONS" ? labelPreflight(statusCode) : null });
    }
  },
  { urls: ["<all_urls>"] }
);

// Messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const state = await getState();

    if (msg && msg.type === "GET_STATE") {
      sendResponse(state);

    } else if (msg && msg.type === "SET_ENABLED") {
      if (msg.enabled) {
        const list = state.profiles?.[state.activeProfile]?.allowlist || [];
        const isGlobal = !list.length;
        const dur = Number(msg.durationMinutes || 0);
        const forceInfinite = !!msg.forceInfinite;

        if (forceInfinite) {
          await enable(0); // explicit no-timer
          sendResponse({ ok: true, enabled: true, appliedMinutes: 0, forced: true });
        } else {
          const applied = (isGlobal && dur === 0) ? 10 : dur;
          await enable(applied);
          sendResponse({ ok: true, enabled: true, appliedMinutes: applied, forced: false });
        }
      } else {
        await disable();
        sendResponse({ ok: true, enabled: false });
      }

    } else if (msg && msg.type === "SET_PROFILE") {
      const { name } = msg;
      ensureProfile(state, name);
      await setSync({ activeProfile: name, profiles: state.profiles });
      await applyRules();
      sendResponse({ ok: true });

    } else if (msg && msg.type === "SAVE_PROFILES") {
      await setSync({ profiles: msg.profiles, activeProfile: msg.activeProfile });
      await applyRules();
      sendResponse({ ok: true });

    } else if (msg && msg.type === "GET_LOGS") {
      const { logs = [] } = await chrome.storage.local.get({ logs: [] });
      sendResponse({ logs });

    } else if (msg && msg.type === "CLEAR_LOGS") {
      await chrome.storage.local.set({ logs: [] });
      sendResponse({ ok: true });

    } else if (msg && msg.type === "SEEN_ONBOARDING") {
      await setSync({ seen_onboarding: true });
      sendResponse({ ok: true });

    } else {
      sendResponse({ ok: false, error: "unknown" });
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "expire") await disable();
  if (alarm.name === "tick") await updateBadgeCountdown();
  await updateActionIcon();
});

// DNR debug hits
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const { request = {}, rule = {} } = info || {};
    await pushLog({
      ts: Date.now(),
      url: request.url || "",
      method: request.method || "",
      resourceType: request.resourceType || "",
      ruleId: rule.id || 0
    });
  });
}

// webRequest onCompleted to capture status codes for logs and hint preflight issues
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    const { url, statusCode, method, type } = details;
    const store = await chrome.storage.local.get({ logs: [] });
    const idx = store.logs.findIndex(l => l.url === url && l.method === method);
    if (idx >= 0) {
      store.logs[idx].status = statusCode;
      store.logs[idx].resourceType = type || store.logs[idx].resourceType;
      if (method === "OPTIONS") store.logs[idx].hint = labelPreflight(statusCode);
      await chrome.storage.local.set({ logs: store.logs });
    } else {
      await pushLog({ ts: Date.now(), url, method, status: statusCode, resourceType: type||"", ruleId: 0, hint: method==="OPTIONS" ? labelPreflight(statusCode) : null });
    }
  },
  { urls: ["<all_urls>"] }
);

// Messages
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const state = await getState();
    if (msg?.type === "GET_STATE") {
      sendResponse(state);
    } 

else if (msg?.type === "SET_ENABLED") {
  if (msg.enabled) {
    const list = state.profiles?.[state.activeProfile]?.allowlist || [];
    const isGlobal = !list.length;
    const dur = Number(msg.durationMinutes || 0);
    const forceInfinite = !!msg.forceInfinite;
    if (forceInfinite) {
      await enable(0); // explicit user choice: no timer
      sendResponse({ ok: true, enabled: true, appliedMinutes: 0, forced: true });
    } else {
      await enable(isGlobal && dur === 0 ? 10 : dur); // safety default for global
      sendResponse({ ok: true, enabled: true, appliedMinutes: isGlobal && dur === 0 ? 10 : dur, forced: false });
    }
  } else {
    await disable();
    sendResponse({ ok: true, enabled: false });
  }
}
 else if (msg?.type === "SET_PROFILE") {
      const { name } = msg;
      ensureProfile(state, name);
      await setSync({ activeProfile: name, profiles: state.profiles });
      await applyRules();
      sendResponse({ ok: true });
    } else if (msg?.type === "SAVE_PROFILES") {
      await setSync({ profiles: msg.profiles, activeProfile: msg.activeProfile });
      await applyRules();
      sendResponse({ ok: true });
    } else if (msg?.type === "GET_LOGS") {
      sendResponse({ logs: state.logs || [] });
    } else if (msg?.type === "CLEAR_LOGS") {
      await setLocal({ logs: [] });
      sendResponse({ ok: true });
    } else if (msg?.type === "SEEN_ONBOARDING") {
      await setSync({ seen_onboarding: true });
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "unknown" });
    }
  })();
  return true;
});