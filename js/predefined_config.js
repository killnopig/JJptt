var PREFS_CATEGORIES = ['mouseBrowsing', 'appearance', 'listLayout'];
var PREFS_NAV = ['general', 'layout', 'autologin', 'blacklist', 'extensions', 'about'];
var DEFAULT_PREFS = {

  // general
  closeQuery            : false,
  //dbcsDetect    : false,
  openInPackagedApp     : false,
  enablePicPreview      : true,
  enableNotifications   : true,
  enableEasyReading     : false,  // JJptt: feature removed
  endTurnsOnLiveUpdate  : false,
  copyOnSelect          : false,
  antiIdleTime          : 0,
  lineWrap              : 78,
  enableDeleteDupLogin  : false,
  deleteDupLogin        : false,

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
  listNewestFirst : false,
  hidePinned : false,
  blacklistedTitleKeywords : '',

  enablePushInsights : true,
  labelLayout : 2,
  enableReader : true,
  readerLowResImages : true,
  readerImageMaxPercent : 40,
  textColor : '#c0c0c0',
  floorColor : '#8a8a8a',
  countryDisplay : 0,
  suspectPrefix : '⚠',
  suspectSameIpText : '同IP',
  suspectAuthorIpText : '與作者同IP',
  watchText : '觀察',
  watchlistedUserIds : '{}',
  notedUserIds : '{}',
  customListName : '網軍',

  // quickSearch
  quickSearchList: '[{"name":"goo.gl","url":"http://goo.gl/%s"}]'
};

var PREF_OPTIONS = {
  mouseLeftFunction : [ 'options_none', 'options_enterKey', 'options_rightKey' ],
  mouseMiddleFunction : [ 'options_none', 'options_enterKey', 'options_leftKey', 'options_doPaste' ],
  mouseWheelFunction1 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  mouseWheelFunction2 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  mouseWheelFunction3 : [ 'options_none', 'options_upDown' , 'options_pageUpDown', 'options_threadLastNext' ],
  countryDisplay : [ 'options_countryText', 'options_countryFlag', 'options_countryBoth' ],
  labelLayout : [ 'options_labelLayoutFull', 'options_labelLayoutCompact', 'options_labelLayoutIpFlag' ],
};

// DUMP_TYPE
var DUMP_TYPE_LOG 	= 0;
var DUMP_TYPE_WARN 	= 1;
var DUMP_TYPE_ERROR = 2;

