/* Ruxt Android prototype renderer. Mirrors Screens.kt / Common.kt / RuxtNav.kt verbatim where text is quoted: 13 routes, TopDests bottom bar (4), AllDests rail (8, >=600dp), start=sessions, Settings lists + 2 consent switches off. Content lists use illustrative sample data (ViewModels return empty lists in this shell) - labelled in README. */
const TOP=[['sessions','Sessions'],['templates','Templates'],['profiles','Profiles'],['more','More']];
const ALL=[['sessions','Sessions'],['templates','Templates'],['profiles','Profiles'],['providers','Providers'],['dashboard','Dashboard'],['settings','Settings'],['about','About'],['login','Login']];
const MORE_ROUTES=['more','providers','dashboard','settings','about','login','plans','billing','iam'];
function bottom(active){let h='<div class="bottombar">';for(const [r,l] of TOP){const sel=r===active||(r==='more'&&MORE_ROUTES.includes(active));h+='<div class="item'+(sel?' sel':'')+'"><div class="ic">'+l[0]+'</div>'+l+'</div>';}return h+'</div>';}
function rail(active){let h='<div class="rail">';for(const [r,l] of ALL){h+='<div class="item'+(r===active?' sel':'')+'"><div>'+l[0]+'</div>'+l+'</div>';}return h+'</div>';}
function shell(o){const inner='<div class="main"><div class="content">'+o.body+'</div>'+(o.wide?'':bottom(o.active))+'</div>';return o.wide?'<div class="wide">'+rail(o.active)+inner+'</div>':'<div class="phone">'+inner+'</div>';}
function emptyState(t,b){return '<div class="card"><div class="t">'+t+'</div><p>'+b+'</p></div>';}
function loading(label){return '<div class="card"><div class="spinner"></div><p>'+label+'</p></div>';}
function errorCard(msg,retry){return '<div class="card"><div class="err-title">Something went wrong</div><p>'+msg+'</p>'+(retry?'<div class="btn primary">Retry</div>':'')+'</div>';}
function offline(){return errorCard('You appear to be offline. Local sessions, CVs, profiles and templates remain available on this device.',false);}
function planned(){return '<div class="badge">Planned</div>';}
function btn(t,primary,left){return '<div class="btn'+(primary?' primary':'')+(left?' left':'')+'">'+t+'</div>';}
const OFFLINE_MSG='You appear to be offline. Local sessions, CVs, profiles and templates remain available on this device.';
function sessionsBody(){return '<h1>Sessions</h1><p>CV sessions are local to this device in this shell. No server session list is called.</p>'+btn('Sample CV - 2026-11-05',false,true)+btn('Backend CV - 2026-11-02',false,true)+btn('Open editor placeholder',true);}
function editorBody(){return '<h1>Editor</h1><p>Contexts: cv and profiles only. The editor internals are not reimplemented in this shell.</p><h2>Sample CV</h2><div class="card"><div class="mono"># Sample CV\n\nWrite your CV in Markdown.\n\n## Experience\n\nSample project</div></div>'+btn('Save',true);}
function templatesBody(){return '<h1>Templates</h1><h2>Classic</h2><p>Clean single-column template. (sample data)</p><h2>Modern</h2><p>Two-column template. (sample data)</p>'+offline();}
function profilesBody(){return '<h1>Profiles</h1><p>Profiles are local to this device in this shell.</p><div class="card"><div class="t">Sample Profile</div><p>Software engineer (sample data)</p></div>';}
function settingsBody(){let h='<h1>Settings</h1><h2>Theme</h2>';for(const n of ['system','mocha','latte','opencode'])h+=btn(n==='mocha'?'mocha (current)':n);h+='<h2>Density</h2>';for(const n of ['comfortable','compact'])h+=btn(n==='comfortable'?'comfortable (current)':n);h+='<h2>Profile save mode</h2>';for(const n of ['auto','manual'])h+=btn(n==='manual'?'manual (current)':n);h+='<h2>Cloud consents</h2><div class="row"><p>Session recovery</p><div class="switch"></div></div><div class="row"><p>Templates</p><div class="switch"></div></div>';return h;}
function plannedBody(t){return '<h1>'+t+'</h1>'+planned()+emptyState(t+' is planned','This area is a Planned-only placeholder with no functionality in this shell.');}
const SCREENS={
'sessions':()=>shell({active:'sessions',body:sessionsBody()}),
'sessions-empty':()=>shell({active:'sessions',body:'<h1>Sessions</h1><p>CV sessions are local to this device in this shell. No server session list is called.</p>'+emptyState('No sessions yet','Start a session locally; it stays on this device until a later phase adds sync.')+btn('Open editor placeholder',true)}),
'editor':()=>shell({active:'editor',body:editorBody()}),
'editor-empty':()=>shell({active:'editor',body:'<h1>Editor</h1><p>Contexts: cv and profiles only. The editor internals are not reimplemented in this shell.</p>'+emptyState('No document open','Open a session (s=) or a template (t=), not both.')+btn('Save',true)}),
'templates':()=>shell({active:'templates',body:templatesBody()}),
'templates-empty':()=>shell({active:'templates',body:'<h1>Templates</h1>'+emptyState('No templates loaded','Templates are local in this shell; cloud template behaviour follows the templates consent in Settings.')+offline()}),
'profiles':()=>shell({active:'profiles',body:profilesBody()}),
'profiles-empty':()=>shell({active:'profiles',body:'<h1>Profiles</h1><p>Profiles are local to this device in this shell.</p>'+emptyState('No profiles yet','Create a profile locally; save mode (auto/manual) is set in Settings.')}),
'providers':()=>shell({active:'providers',body:'<h1>Providers</h1>'+planned()+emptyState('No providers connected','Provider connection is a placeholder in this shell; no network call is made.')}),
'dashboard':()=>shell({active:'dashboard',body:'<h1>Dashboard</h1>'+emptyState('Nothing to show yet','Dashboard summaries appear here in a later phase.')+btn('Plans - Planned')+btn('Billing - Planned')+btn('Account & IAM - Planned')}),
'settings':()=>shell({active:'settings',body:settingsBody()}),
'about':()=>shell({active:'about',body:'<h1>About</h1><p>Ruxt Android shell. Kotlin / Jetpack Compose, Material 3, design tokens from design/tokens.json.</p>'+emptyState('Shell only','No real API, auth or editor logic is included in this phase.')}),
'login':()=>shell({active:'login',body:'<h1>Sign in</h1><p>Login gate placeholder. Dual auth is supported by the contract in a later phase; no sign-in is performed here.</p>'+emptyState('Not signed in','Continue offline with local sessions, CVs, profiles and templates.')+btn('Sign in - Planned',true)}),
'more':()=>shell({active:'more',body:'<h1>More</h1>'+[['Providers'],['Dashboard'],['Settings'],['About'],['Login'],['Plans - Planned'],['Billing - Planned'],['Account & IAM - Planned']].map(x=>btn(x[0],true)).join('')}),
'plans':()=>shell({active:'plans',body:plannedBody('Plans')}),
'billing':()=>shell({active:'billing',body:plannedBody('Billing')}),
'iam':()=>shell({active:'iam',body:plannedBody('Account & IAM')}),
'loading':()=>shell({active:'sessions',body:'<h1>Sessions</h1>'+loading('Loading sessions')}),
'error':()=>shell({active:'sessions',body:'<h1>Sessions</h1><p>Sessions could not be loaded. (illustrative error text)</p>'+btn('Retry',true)}),
'offline':()=>shell({active:'templates',body:'<h1>Templates</h1>'+offline()}),
'wide-sessions':()=>shell({active:'sessions',wide:true,body:sessionsBody()}),
'wide-editor':()=>shell({active:'editor',wide:true,body:editorBody()}),
'wide-settings':()=>shell({active:'settings',wide:true,body:settingsBody()}),
'wide-dashboard':()=>shell({active:'dashboard',wide:true,body:'<h1>Dashboard</h1>'+emptyState('Nothing to show yet','Dashboard summaries appear here in a later phase.')+btn('Plans - Planned')+btn('Billing - Planned')+btn('Account & IAM - Planned')}),
'editor-offline':()=>shell({active:'editor',body:'<h1>Editor</h1><p>Contexts: cv and profiles only. The editor internals are not reimplemented in this shell.</p>'+offline()+'<div class="card"><div class="mono"># Sample CV\n\nWrite your CV in Markdown.</div></div>'+btn('Save',true)}),
'settings-consents':()=>shell({active:'settings',body:'<h1>Settings</h1><h2>Cloud consents</h2><div class="row"><p>Session recovery</p><div class="switch"></div></div><div class="row"><p>Templates</p><div class="switch"></div></div><p>Both switches are off by default in this shell.</p>'}),
'editor-edited':()=>shell({active:'editor',body:'<h1>Editor</h1><p>Contexts: cv and profiles only. The editor internals are not reimplemented in this shell.</p><h2>Sample CV</h2><div class="card"><div class="mono"># Sample CV\n\nWrite your CV in Markdown.\n\n## Experience\n\nSample project\nEdited sample line</div></div><p class="edited">Unsaved changes</p>'+btn('Save',true)}),
};
document.body.innerHTML=SCREENS[document.body.dataset.screen]();
