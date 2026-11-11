var PREFS_CATEGORIES = ['mouseBrowsing', 'appearance', 'listLayout', 'askAi', 'factLists', 'factDetect', 'autologinBox'];
var PREFS_NAV = ['general', 'layout', 'mouseBrowsing', 'autologin', 'blacklist', 'syncBackup', 'about'];
var DEFAULT_PREFS = {

  // general
  closeQuery            : false,
  //dbcsDetect    : false,
  openInPackagedApp     : false,
  enablePicPreview      : true,
  enableNotifications   : true,
  enableEasyReading     : false,  // JJptt: feature removed
  endTurnsOnLiveUpdate  : true,
  copyOnSelect          : true,
  antiIdleTime          : 100,
  lineWrap              : 78,
  enableDeleteDupLogin  : true,
  deleteDupLogin        : true,

  // mouse browsing
  useMouseBrowsing            : false,
  mouseBrowsingHighlight      : true,
  mouseBrowsingHighlightColor : 2,
  mouseLeftFunction           : 0,
  mouseMiddleFunction         : 0,
  mouseWheelFunction1         : 1,
  mouseWheelFunction2         : 2,
  mouseWheelFunction3         : 3,

  // displays
  fontFitWindowWidth: false,
  fontFace          : 'MingLiu,SymMingLiU,monospace',
  bbsMargin         : 0,

  // blacklist
  enableBlacklist : true,
  blacklistedUserIds  : '{}',
  hideBlacklisted : false,
  pushFilterDefault : 10,
  autoBlacklistSameUrl : true,
  tempBlacklist : '{}',
  listNewestFirst : true,
  hidePinned : true,
  blacklistedTitleKeywords : '',

  enablePushInsights : true,
  labelLayout : 2,
  enableReader : true,
  readerLowResImages : true,
  readerImageMaxPercent : 60,
  readerPrefetchCount : 5,
  colorRepeatPushers : true,
  factReport : true,
  factFastPush : true,
  factFastMinutes : 2,
  factBurst : true,
  factBurstMin : 6,
  factQuietMin : 5,
  factBoost : true,
  factBoostRun : 15,
  factCanned : true,
  factCannedMin : 3,
  factSubnet : true,
  factSubnetMin : 3,
  repeatPusherMin : 2,
  textColor : '#f7f7f7',
  floorColor : '#ffea00',
  countryDisplay : 1,
  suspectPrefix : '⚠',
  suspectSameIpText : '多',
  suspectAuthorIpText : '作',
  watchText : '觀',
  watchlistedUserIds : '{}',
  notedUserIds : '{}',
  customListName : '網軍',
  aiService : 0,
  aiCustomUrl : '',
  aiPrompt : '以下是 PTT 上的內容，請查證這是不是事實，說明哪些部分正確、哪些錯誤或無法證實，並附上可信的來源：「%s」',

  // quickSearch
  quickSearchList: '[]'
};

var PREF_OPTIONS = {
  mouseLeftFunction : [ 'options_none', 'options_enterKey', 'options_rightKey' ],
  mouseMiddleFunction : [ 'options_none', 'options_enterKey', 'options_leftKey', 'options_doPaste' ],
  mouseWheelFunction1 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  mouseWheelFunction2 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  mouseWheelFunction3 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  countryDisplay : [ 'options_countryText', 'options_countryFlag', 'options_countryBoth' ],
  labelLayout : [ 'options_labelLayoutFull', 'options_labelLayoutCompact', 'options_labelLayoutIpFlag' ],
  aiService : [ 'ai_chatgpt', 'ai_claude', 'ai_perplexity', 'ai_grok', 'ai_copilot', 'ai_custom' ],
};

// DUMP_TYPE
var DUMP_TYPE_LOG 	= 0;
var DUMP_TYPE_WARN 	= 1;
var DUMP_TYPE_ERROR = 2;

