console.log('[OmniPilot] service worker ready');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[OmniPilot] installed');
});
