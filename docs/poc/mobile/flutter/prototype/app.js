/* Ruxt Flutter prototype renderer. Every screen mirrors the Dart source:
   destinations + governing order, placeholder chip bar (Content/Empty/
   Loading/Error/Offline), state views, and the code's own sample text. */
const PRIMARY=[['editor','Editor'],['sessions','Sessions'],['templates','Templates'],['profiles','Profiles'],['settings','Settings']];
const SECONDARY=[['providers','Providers'],['cloudData','Cloud data'],['about','About'],['login','Sign in']];
const CHIPSTATES=['Content','Empty','Loading','Error','Offline'];
function nav(active,wide){
  if(wide){
    let h='<nav class=\'rail\'>';
    for(const [id,lab] of PRIMARY) h+='<a class=\''+(id===active?'on':'')+'\' href=\'#\'><span class=\'dot\'></span>'+lab+'</a>';
    h+='<div class=\'sep\'></div>';
    for(const [id,lab] of SECONDARY) h+='<a class=\''+(id===active?'on':'')+'\' href=\'#\'><span class=\'dot\'></span>'+lab+'</a>';
    return h+'</nav>';
  }
  let h='<nav class=\'bottomnav\'>';
  for(const [id,lab] of PRIMARY) h+='<a class=\''+(id===active?'on':'')+'\' href=\'#\'><span>'+lab+'</span></a>';
  return h+'</nav>';
}
function chips(on){
  let h='<div class=\'chips\'>';
  for(const s of CHIPSTATES) h+='<span class=\'chip'+(s===on?' on':'')+'\'>'+s+'</span>';
  return h+'</div>';
}
function shell(o){
  const wide=!!o.wide;
  return '<div class=\'app'+(o.latte?' latte':'')+'\'>'
    +'<header class=\'appbar\'><span class=\'brand\'>Ruxt</span><span class=\'themesel\'>Theme: '+(o.latte?'Latte':'Mocha')+' \u25BE</span></header>'
    +'<div class=\'main\'>'+(wide?nav(o.active,true):'')
    +'<section class=\'content\'>'+(o.chips?chips(o.chips):'')+'<div class=\'posrel\'><div class=\'body\'>'+o.body+'</div>'+(o.toast?'<div class=\'toast\'>'+o.toast+'</div>':'')+'</div></section></div>'
    +(wide?'':nav(o.active,false))+'</div>';
}
function emptyState(icon,title,msg){return '<div class=\'state\'><div class=\'glyph\'>'+icon+'</div><h3>'+title+'</h3><p class=\'small\'>'+msg+'</p></div>';}
function loadingState(label){return '<div class=\'state\'><div class=\'spinner\'></div><p>'+label+'</p></div>';}
function errorState(msg){return '<div class=\'state\'><div class=\'glyph err\'>\u26A0</div><p>'+msg+'</p><button class=\'btn\'>Try again</button></div>';}
function offlineState(){return '<div class=\'state\'><div class=\'glyph err\'>\u26A0</div><p>You are offline. Changes stay on this device until you reconnect.</p><button class=\'btn\'>Try again</button></div>';}
const MD=['# Your name','','Write your CV in Markdown.'];
const MD_EDITED=MD.concat(['','## Experience','','Sample project \u2014 built with Markdown.','Sample project \u2014 exported as PDF.']);
function editorBody(edited,preview){
  const seg='<div class=\'seg\'><div class=\''+(preview?'':'on')+'\'>Source</div><div class=\''+(preview?'on':'')+'\'>Preview</div></div>';
  if(preview){
    let p='<h1>Your name</h1><p style=\'margin-top:12px\'>Write your CV in Markdown.</p>';
    if(edited) p+='<h3 style=\'margin-top:16px\'>Experience</h3><p class=\'small\' style=\'margin-top:8px\'>Sample project \u2014 built with Markdown.<br>Sample project \u2014 exported as PDF.</p>';
    p+='<p class=\'small\' style=\'margin-top:16px\'>Placeholder rendering; the full app renders the formatted document.</p>';
    return seg+p;
  }
  const lines=(edited?MD_EDITED:MD).join('<br>');
  return seg+'<div class=\'editorbox\'>'+lines+'<br><span class=\'hint\'>Write your CV in Markdown</span></div>';
}
function sessionsBody(){
  return '<h2>Sessions</h2><p class=\'small\' style=\'margin-top:8px\'>Your documents are grouped here, with Templates and Providers below them, as on the web dashboard.</p>'
    +'<div class=\'doc\'><strong>Your name</strong><span>Write your CV in Markdown.</span></div>'
    +'<p class=\'lab\'>Templates</p><p class=\'small\'>Classic \u00B7 Modern \u00B7 Compact</p>'
    +'<p class=\'lab\' style=\'margin-top:12px\'>Providers</p><p class=\'small\'>One section per provider group.</p>';
}
function templatesBody(){
  let h='<div class=\'grid\'>';
  for(const n of ['Classic','Modern','Compact']) h+='<div class=\'card\'><div class=\'thumb\'>\u25A4</div><h3>'+n+'</h3><p class=\'small\' style=\'margin-top:8px\'>Template preview placeholder.</p></div>';
  return h+'</div>';
}
function profilesBody(){
  let h='';
  for(const s of ['Identity','About','Contact','Experience','Skills','Education','Projects','Certifications']) h+='<div class=\'rowline\'><span>'+s+'</span><button class=\'addbtn\'>+ Add '+s+'</button></div>';
  return h;
}
function settingsBody(latte){
  const themes=[['Mocha',latte?0:1,''],['Latte',latte?1:0,''],['OpenCode',0,''],['System',0,'Follow the OS setting: light uses Latte, dark uses Mocha.']];
  let h='<h2 style=\'margin-bottom:8px\'>Theme</h2>';
  for(const [n,on,sub] of themes) h+='<div class=\'radio'+(on?' on':'')+'\'><span class=\'ring\'>'+(on?'\u25C9':'\u25CB')+'</span><span>'+n+(sub?'<br><span class=\'sub\'>'+sub+'</span>':'')+'</span></div>';
  h+='<h2 style=\'margin:16px 0 8px\'>Density</h2>';
  for(const [n,on] of [['Comfortable',1],['Compact',0]]) h+='<div class=\'radio'+(on?' on':'')+'\'><span class=\'ring\'>'+(on?'\u25C9':'\u25CB')+'</span><span>'+n+'</span></div>';
  h+='<h2 style=\'margin:16px 0 4px\'>More</h2>';
  for(const [,lab] of SECONDARY) h+='<div class=\'rowline\'><span>'+lab+'</span><span class=\'small\'>\u203A</span></div>';
  return h;
}
function providersBody(){return '<h2>Providers</h2><p class=\'small\' style=\'margin-top:8px\'>One section per provider group, headed by the provider name.</p>';}
function cloudBody(on){
  const sw=(t,p)=>'<div class=\'switchrow\'><div><strong>'+t+'</strong><p>'+p+'</p></div><span class=\'switch '+(on?'on':'off')+'\'></span></div>';
  return sw('Cloud session recovery','Consent loads from your account in the full app. Turning this off stops cloud recovery of your sessions.')
    +sw('Cloud templates','Turning this off keeps templates on this device only.')
    +'<p class=\'small\' style=\'margin-top:12px\'>A failed change shows the server message and returns the control to its previous state.</p>';
}
function aboutBody(){
  return '<h1>About Ruxt</h1><h3 style=\'margin-top:12px\'>Write your CV in Markdown</h3>'
    +'<p class=\'lab\' style=\'margin-top:16px\'>Local-first</p><p>Your documents and profiles stay on this device unless you choose otherwise.</p>'
    +'<p class=\'lab\' style=\'margin-top:12px\'>Optional cloud</p><p>Cloud recovery and templates are opt-in from Cloud data settings.</p>';
}
function loginBody(){
  return '<h1>Sign in</h1><p class=\'small\' style=\'margin:8px 0 16px\'>Create your account</p>'
    +'<span class=\'lab\'>Email</span><div class=\'input\'>Email</div>'
    +'<span class=\'lab\'>Password</span><div class=\'input\'>Password</div>'
    +'<button class=\'btn block\'>Sign in</button>'
    +'<p class=\'small\' style=\'margin-top:12px\'>Return to the editor</p>'
    +'<div class=\'snack\'>Sign-in is not wired in this shell.</div>';
}
const SCREENS={
  'editor':()=>shell({active:'editor',chips:'Content',body:editorBody(false,false)}),
  'editor-preview':()=>shell({active:'editor',chips:'Content',body:editorBody(false,true)}),
  'editor-export':()=>shell({active:'editor',chips:'Content',body:editorBody(true,true),toast:'Exported sample CV \u2014 PDF (full app)'}),
  'editor-edited':()=>shell({active:'editor',chips:'Content',body:editorBody(true,false)}),
  'editor-empty':()=>shell({active:'editor',chips:'Empty',body:emptyState('\u25A4','No document open','Open a session or start a new document to begin editing.')}),
  'sessions':()=>shell({active:'sessions',chips:'Content',body:sessionsBody()}),
  'sessions-empty':()=>shell({active:'sessions',chips:'Empty',body:emptyState('\u25A4','No sessions yet','Documents you create or open will be listed here.')}),
  'templates':()=>shell({active:'templates',chips:'Content',body:templatesBody()}),
  'templates-empty':()=>shell({active:'templates',chips:'Empty',body:emptyState('\u25A6','No templates','Templates will appear here when the catalog is available.')}),
  'profiles':()=>shell({active:'profiles',chips:'Content',body:profilesBody()}),
  'profiles-empty':()=>shell({active:'profiles',chips:'Empty',body:emptyState('\u25CB','No profile yet','Create a profile to reuse your details across documents.')}),
  'settings':()=>shell({active:'settings',body:settingsBody(false)}),
  'settings-latte':()=>shell({active:'settings',latte:true,body:settingsBody(true)}),
  'providers':()=>shell({active:'providers',chips:'Content',body:providersBody()}),
  'providers-empty':()=>shell({active:'providers',chips:'Empty',body:emptyState('\u25A9','No providers','Connected providers will be grouped here.')}),
  'cloud-data':()=>shell({active:'cloudData',chips:'Content',body:cloudBody(false)}),
  'cloud-data-consents':()=>shell({active:'cloudData',chips:'Content',body:cloudBody(true)}),
  'about':()=>shell({active:'about',body:aboutBody()}),
  'login':()=>shell({active:'login',body:loginBody()}),
  'loading':()=>shell({active:'sessions',chips:'Loading',body:loadingState('Loading sessions')}),
  'error':()=>shell({active:'sessions',chips:'Error',body:errorState('Sessions could not be loaded.')}),
  'offline':()=>shell({active:'sessions',chips:'Offline',body:offlineState()}),
  'wide-editor':()=>shell({active:'editor',wide:true,chips:'Content',body:editorBody(false,false)}),
  'wide-sessions':()=>shell({active:'sessions',wide:true,chips:'Content',body:'<div class=\'split\'><div class=\'listpane\'>'+sessionsBody()+'</div><div class=\'detail\'>'+emptyState('\u25A4','No session selected','Select a session to open it in the editor.')+'</div></div>'}),
  'wide-settings':()=>shell({active:'settings',wide:true,body:settingsBody(false)}),
  'wide-cloud-data':()=>shell({active:'cloudData',wide:true,chips:'Content',body:cloudBody(false)}),
};
document.body.innerHTML=SCREENS[document.body.dataset.screen]();
