$(document).ready(function() {
  var site = getQueryVariable('site');
  var from = getQueryVariable('from');
  var keepAlive = getQueryVariable('keepAlive');
  setupI18n();

  pttchrome.app = new pttchrome.App(function(app) {
    if (app.mobile && app.mobile.enabled()) {
      // the Android app reads PTT's web pages: no terminal (js/mobile.js)
      app.mobile.start();
      return;
    }
    app.setInputAreaFocus();
    if (!site) {
      site = 'ptt.cc';
    }
    app.connect(site);
    $('#BBSWindow').show();
    //$('#sideMenus').show();
    app.onWindowResize();
  }, { from: from, keepAlive: keepAlive, ssh: !site || site === 'ptt.cc' });
});

function setTimer(repeat, func, timelimit) {
  if(repeat) {
	  return {
		  timer: setInterval(func, timelimit),
		  cancel: function() {
			  clearInterval(this.timer);
		  }
	  };
  } else {
	  return {
		  timer: setTimeout(func, timelimit),
		  cancel: function() {
			  clearTimeout(this.timer);
		  }
	  };
  }
}

function openURI(uri, activate, postData) {
  window.open(uri, '_blank');
}
function getQueryVariable(variable) {
  var query = window.location.search.substring(1);
  var vars = query.split("&");
  for (var i=0;i<vars.length;i++) {
    var pair = vars[i].split("=");
    if (pair[0] == variable) {
      return pair[1];
    }
  }
  return null;
}

function dumpLog(type, string) {
	switch(type){
		case DUMP_TYPE_LOG: 	 console.log(string); break;
		case DUMP_TYPE_WARN: 	 console.warn(string); break;
		case DUMP_TYPE_ERROR: 	 console.error(string); break;
		default: console.log(string); break;
	}
}

