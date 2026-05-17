// Background service worker — handles system notifications from popup

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'SLOUCH_ALERT') return;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'PostureGuard 🚨',
    message: msg.message || 'You\'re slouching! Sit up and pull your shoulders back.',
    priority: 2,
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('PostureGuard installed.');
});
