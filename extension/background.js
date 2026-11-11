// Clicking the toolbar icon opens JJptt in a new tab. The page then offers
// to close JJptt tabs that are already open (see checkOtherTabs).
chrome.action.onClicked.addListener(function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html?opened=icon') });
});
