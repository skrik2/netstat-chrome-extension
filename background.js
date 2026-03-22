// tabId -> { domains: Set, ips: Set }
const tabConnections = new Map();

// tabId -> requestId -> domain（用于补全 IP）
const requestDomainMap = new Map();

function getOrCreateTab(tabId) {
  if (!tabConnections.has(tabId)) {
    tabConnections.set(tabId, {
      domains: new Set(),
      ips: new Set()
    });
  }
  return tabConnections.get(tabId);
}

function getOrCreateReq(tabId) {
  if (!requestDomainMap.has(tabId)) {
    requestDomainMap.set(tabId, new Map());
  }
  return requestDomainMap.get(tabId);
}

// 1️⃣ 记录 domain（早期事件，保证不丢）
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { tabId, requestId, url } = details;
    if (tabId < 0) return;

    try {
      const domain = new URL(url).hostname;

      const tabStat = getOrCreateTab(tabId);
      tabStat.domains.add(domain);

      const reqMap = getOrCreateReq(tabId);
      reqMap.set(requestId, domain);

    } catch (e) {}
  },
  { urls: ["<all_urls>"] }
);

// 2️⃣ 记录 IP（晚期事件）
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const { tabId, requestId, ip } = details;
    if (tabId < 0) return;

    const tabStat = getOrCreateTab(tabId);

    if (ip) {
      tabStat.ips.add(ip);
    }

    // 清理 request map（避免泄漏）
    const reqMap = requestDomainMap.get(tabId);
    if (reqMap) {
      reqMap.delete(requestId);
    }
  },
  { urls: ["<all_urls>"] }
);

// 3️⃣ tab 关闭清理
chrome.tabs.onRemoved.addListener((tabId) => {
  tabConnections.delete(tabId);
  requestDomainMap.delete(tabId);
});

// 4️⃣ tab 刷新清理
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabConnections.set(tabId, {
      domains: new Set(),
      ips: new Set()
    });
    requestDomainMap.set(tabId, new Map());
  }
});

// 5️⃣ 提供给 popup 查询
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TAB_DATA") {
    const tabId = msg.tabId;
    const stat = tabConnections.get(tabId) || { domains: [], ips: [] };

    sendResponse({
      domains: Array.from(stat.domains),
      ips: Array.from(stat.ips)
    });
  }
});
