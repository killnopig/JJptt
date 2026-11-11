// Clicking the toolbar icon opens JJptt in a new tab. The page then offers
// to close JJptt tabs that are already open (see checkOtherTabs).
chrome.action.onClicked.addListener(function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html?opened=icon') });
});

// After an update (the "套用更新" button or ↻ on chrome://extensions) the
// JJptt tabs are closed by Chrome: open one again.
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'update') {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  }
});
