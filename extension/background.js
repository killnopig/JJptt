// Clicking the toolbar icon opens JJptt in a new tab.
chrome.action.onClicked.addListener(function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
