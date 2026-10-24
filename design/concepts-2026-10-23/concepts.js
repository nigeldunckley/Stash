(() => {
  'use strict';
  const $ = (s, parent = document) => parent.querySelector(s);
  const $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const app = $('#app'), device = $('#device'), stage = $('#stage');
  const shapes = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    read: '<path d="M4 5h16M4 10h16M4 15h11M4 20h13"/>',
    watch: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="m10 8 5 3-5 3zM8 21h8m-4-4v4"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    archive: '<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M9 11h6"/>',
    rss: '<path d="M4 4a16 16 0 0 1 16 16M4 11a9 9 0 0 1 9 9"/><circle cx="5" cy="19" r="1"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    highlight: '<path d="m14 3 7 7-11 11H3v-7zM11 6l7 7M5 12l7 7"/>',
    folder: '<path d="M3 6h6l2 2h10v12H3z"/>',
    settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3 3-1 3 1 1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3-3 1z"/><circle cx="12" cy="12" r="3"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M6 8h0m0 4h0"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    left: '<path d="m14 5-7 7 7 7"/>',
    right: '<path d="m10 5 7 7-7 7"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    arrowUp: '<path d="M12 20V4M6 10l6-6 6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    share: '<path d="M7 8H4v13h16V8h-3M12 16V3m-4 4 4-4 4 4"/>',
    focus: '<path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6"/>',
    expand: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
    list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h0m0 7h0m0 7h0"/>',
    type: '<path d="m3 19 6-15 6 15M5 14h8m3 5 3-8 3 8m-5-3h4"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 4H3v17h17v-7"/>',
    play: '<path d="m9 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    back10: '<path d="M4 10a8 8 0 1 1 0 5M3 4v6h6"/><path d="M9 13v5m3-5h3v5h-3z"/>',
    forward10: '<path d="M20 10a8 8 0 1 0 0 5m1-11v6h-6"/><path d="M9 13v5m3-5h3v5h-3z"/>',
    pip: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
    mini: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18m-9-6v4m-3-2 3 3 3-3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l1 1m14 14 1 1M4 20l1-1M19 5l1-1"/>',
    moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h0"/>',
    signal: '<path d="M4 19v-3m5 3v-6m5 6v-10m5 10V5"/>',
    wifi: '<path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0m-9 4a4 4 0 0 1 6 0m-3 4h0"/>',
    battery: '<rect x="2" y="7" width="18" height="10" rx="2"/><path d="M23 10v4M5 10h12v4H5z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2"/>',
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.read}</svg>`;
  const ib = (name, label, action, cls = '') => `<button class="icon-button ${cls}" aria-label="${label}" title="${label}" data-action="${action}">${icon(name)}</button>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const articles = [
    { id: 'coast', title: 'A walk along the coast', source: 'Fieldnotes', image: 'coast', minutes: 8, detail: 'A different pace, just a train ride away. On finding a little room to think at the edge of the water.' },
    { id: 'album', title: 'How the album was recorded', source: 'The Listening Room', image: 'studio', minutes: 12, detail: 'The small decisions that give a record its own world.' },
    { id: 'city', title: 'A new route through the city', source: 'Open House', image: 'city', minutes: 6, detail: 'What happens when you take the long way home.' },
    { id: 'cinema', title: 'The last night at the cinema', source: 'The Sunday Edit', image: 'cinema', minutes: 9, detail: 'A familiar place, and the people who made it matter.' },
    { id: 'bookshop', title: 'The bookshop on the corner', source: 'Fieldnotes', image: 'books', minutes: 5, detail: 'Some things are better found by chance.' },
  ];
  const videos = [
    { id:'studio', title:'Behind the scenes at the studio', channel:'The Listening Room', image:'studio', duration:1464 },
    { id:'park', title:'A visit to the park', channel:'A Different Weekend', image:'park', duration:1125 },
    { id:'live', title:'The sound of a live room', channel:'The Listening Room', image:'concert', duration:1642 },
    { id:'railway', title:'An afternoon on the railway', channel:'A Different Weekend', image:'railway', duration:820 },
  ];
  const transcript = [
    [0,'A record starts long before anyone presses the red button. It starts with a room, and a conversation.'],
    [52,'We wanted you to hear the space around the instruments, rather than remove it.'],
    [144,'The room has a sound of its own. You can hear it in the way the guitar hangs in the air.'],
    [248,'For the first few days, we just played together. No headphones, no screens between us.'],
    [372,'This was the first take that felt like the record we had imagined.'],
    [440,'There is a moment where the whole band comes in a fraction late. We kept it.'],
    [482,'When you listen closely, you can hear the piano chair move. That is part of the performance too.'],
    [526,'The most important thing was leaving enough room for the song to breathe.'],
    [610,'We tried a smaller amplifier, and suddenly the guitar sat in exactly the right place.'],
    [725,'You can spend a long time trying to get back to something that happened in the first five minutes.'],
    [900,'The last song was recorded with everyone in the same room, late in the evening.'],
    [1120,'In the end, it is the small decisions that make it feel like something only this group could have made.'],
    [1320,'Thank you for spending some time with us. We hope you hear something different the next time you listen.'],
  ];
  const chapters = [[0,'Finding the room'],[144,'A space with its own sound'],[372,'The first take'],[610,'Getting the guitar right'],[900,'One last song'],[1320,'Listening back']];
  const copy = {
    home: { title:'Your front page. A little more personal.', description:'A considered balance of new discoveries and the things you want to return to.', hint:'Open a story, resume a video, or show the new arrivals.', notes:[['A clearer first look','Continuation moves into a compact band near the top. A leading article, supporting stories and a distinct Watch section give new reading and viewing equal care.'],['Made for each device','Mac opens a neighbouring preview. iPhone opens a full reading destination. iPad keeps an editorial two-column layout, with touch-sized controls and its own navigation.'],['Quietly responsive','New arrivals wait for you. Opening a story and going back preserves your place on Home. No automatic reshuffling, notification pressure, or invented recommendations.']] },
    reader: { title:'A reading experience with room to breathe.', description:'Better rhythm, quieter controls, and a continuous path from first line to last.', hint:'Try Focus, the contents, and reading appearance. Scroll to the end for the finish actions.', notes:[['The article comes first','A complete typographic hierarchy from source to headline, introduction, body and captions. A comfortable measure and more deliberate rhythm make long articles feel composed.'],['One continuous reading space','Focus expands the same article without losing your place. Contents opens beside it on Mac, in a popover on iPad, and in a sheet on iPhone. The finish offers Archive or Keep in Saved, with Undo.'],['Built on what exists','Uses the current reader, text settings, heading navigation and archive actions. This is a design evolution, not a new extraction engine. Sample article text and photography illustrate the layout.']] },
    watch: { title:'The video leads. Everything else is close.', description:'A stable stage, a useful transcript, and a queue that stays out of the way.', hint:'Try the context tabs, transcript search and Follow, queue reordering, and the mini player.', notes:[['A proper viewing space','The video keeps its dimensions when you change context. Mac has an optional side panel; iPad adapts it to the space available; iPhone keeps the video above its context.'],['Context you can use','Search the transcript and select a line to seek. Manual browsing suspends following; Follow playback restores it. Reorder Up next by dragging or using the arrow buttons. Chapters are immediately available.'],['Honest about the prototype','Playback is a local timed simulation over a still image, not a live video stream. Mini player and Focus transitions work here. System Picture in Picture and sharing are native handoffs, not browser promises.']] },
  };
  const defaults = () => ({concept:'home',screen:'home',device:'mac',theme:'dark',focus:false,sidebar:true,contents:false,appearance:false,article:'coast',font:'Newsreader',fontSize:20,width:690,context:'queue',contextShown:true,playing:false,time:482,rate:1,queue:['park','live','railway'],video:'studio',follow:true,search:'',saved:new Set(),archived:new Set(),newItems:3,mini:false,theatre:false,notes:false,demo:'normal',reduced:false,landscape:false,compact:false});
  let state = defaults();
  let homeScroll=0, articleScroll=0, toastTimer=null, videoClock=null, dragID=null, lastTick=performance.now();
  const times = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  const currentArticle = () => articles.find(a=>a.id===state.article) || articles[0];
  const currentVideo = () => videos.find(v=>v.id===state.video) || videos[0];
  const status = () => `<div class="mobile-status"><span>9:41</span><span class="island"></span><span class="status-icons">${icon('signal')}${icon('wifi')}${icon('battery')}</span></div>`;
  function sidebar() {
    const selected=state.screen==='home'?'Home':state.screen==='reader'?'Saved':'Latest';
    const row=(label,name,action,n='')=>`<button class="side-item ${selected===label?'selected':''}" data-action="${action}">${icon(name)}<span>${label}</span>${n?`<small>${n}</small>`:''}</button>`;
    return `<aside ${state.focus||state.theatre||!state.sidebar?'inert':''} class="sidebar ${!state.sidebar?'collapsed':''}" aria-label="Stash navigation"><div class="side-logo"><img src="assets/mark.png" alt="">Stash</div>${row('Home','home','home')}<div class="side-label">READ</div>${row('Feeds','rss','feeds','6')}${row('Saved','bookmark','reader','24')}${row('Highlights','highlight','highlights')}${row('Discover','compass','discover')}<div class="side-label">WATCH</div>${row('Latest','watch','watch','12')}${row('Saved videos','bookmark','saved-videos')}${row('Collections','folder','collections')}<div class="side-bottom">${row('Archive','archive','archive-list')}${row('Settings','settings','settings')}<div class="side-profile"><span class="profile-dot">N</span>Nigel’s Stash</div></div></aside>`;
  }
  function windowbar() {
    return `<div class="windowbar"><div class="window-left"><span class="traffic" aria-hidden="true"><span></span><span></span><span></span></span>${ib('sidebar','Toggle sidebar','sidebar')}</div><span class="window-name">${state.screen==='home'?'Home':state.screen==='reader'?currentArticle().title:currentVideo().title}</span><div class="window-right">${ib('search','Search Stash','search')}${ib('plus','Save a link (⌘N)','add')}</div></div>`;
  }
  function tabletbar() {
    return `<div class="ipad-topbar"><div class="ipad-brand"><img src="assets/mark.png" alt="">Stash</div><nav class="ipad-tabs" aria-label="Stash sections">${[['Home','home'],['Read','reader'],['Watch','watch']].map(([t,a])=>`<button data-action="${a}" class="${state.screen===a?'selected':''}">${t}</button>`).join('')}</nav><div class="toolbar-group">${ib('search','Search Stash','search')}${ib('plus','Save a link','add')}</div></div>`;
  }
  function mobilebar() {
    if(state.screen==='home')return `<div class="mobile-nav"><span class="mobile-brand"><img src="assets/mark.png" alt="">Stash</span><div class="toolbar-group">${ib('search','Search Stash','search')}${ib('plus','Save a link','add')}</div></div>`;
    return `<div class="mobile-nav"><button class="mobile-back" data-action="home">${icon('left')}Home</button><span class="mobile-source">${state.screen==='reader'?currentArticle().source:'Watch'}</span>${ib('more','More actions','more')}</div>`;
  }
  function bottomnav() {
    if(state.screen!=='home')return '';
    return `<nav class="app-bottom-nav" aria-label="Stash sections">${[['Home','home','home'],['Read','read','reader'],['Watch','watch','watch'],['Settings','settings','settings']].map(([label,i,a])=>`<button class="${state.screen===a?'selected':''}" data-action="${a}">${icon(i)}${label}</button>`).join('')}</nav>`;
  }
  function meta(source,detail){return `<div class="story-meta"><span class="unseen-dot"></span><span class="source">${source}</span><span>·</span><span>${detail}</span></div>`;}
  function home() {
    const saved=state.saved.has('coast');
    return `<div class="content home-scroll" id="home-scroll"><div class="home-topline"><div class="home-title"><h2>Home<span class="saved-dot">.</span></h2><p>FRIDAY 23 OCTOBER <span aria-hidden="true">·</span> YOUR FRONT PAGE</p></div><div class="topline-actions">${state.newItems?`<button class="new-pill" data-action="arrivals">${icon('arrowUp')}<span>${state.newItems} new</span></button>`:'<span class="toolbar-label">Up to date</span>'}<button class="text-button" data-action="add">${icon('plus')}Save a link</button></div></div>
    <section class="continue-band" aria-label="Continue reading and watching"><div class="continue-caption"><span>Pick up</span>where you left off</div><button class="continue-item" data-action="open-album"><img src="assets/studio.jpg" alt="Guitars and a mixing desk in a recording studio"><div><h3 class="continue-title">How the album was recorded</h3><div class="continue-detail"><span class="mini-track"><i></i></span><span>8 min left</span><span>·</span><span>Read</span></div></div></button><button class="continue-item" data-action="watch"><img src="assets/studio.jpg" alt="A recording studio"><div><h3 class="continue-title">Behind the scenes at the studio</h3><div class="continue-detail">${icon('play')}<span>16:22 left</span><span>·</span><span>Watch</span></div></div></button></section>
    <section class="lead-layout" aria-label="New reading and viewing"><article class="lead-story"><button class="image-button" data-action="open-coast" aria-label="Read A walk along the coast"><img class="story-image" src="assets/coast.jpg" alt="Blue waves in the pale evening light"></button>${meta('Fieldnotes','8 min read')}<h3><button class="headline-button" data-action="open-coast">A walk along the coast</button></h3><p>A different pace, just a train ride away. On finding a little room to think at the edge of the water.</p><div class="story-actions"><button class="text-button accent" data-action="open-coast">Read story ${icon('arrow')}</button><button class="text-button" data-action="save-home">${icon(saved?'check':'bookmark')}${saved?'Saved':'Save for later'}</button></div></article><div class="supporting-stories"><article class="home-video-feature"><button class="image-button" data-video="live" aria-label="Watch The sound of a live room"><div class="video-thumb"><img src="assets/concert.jpg" alt="A live performance in a warmly lit music venue"><span class="duration">27:22</span><span class="home-video-play">${icon('play')}</span></div></button>${meta('The Listening Room','New video')}<h3><button class="headline-button" data-video="live">The sound of a live room</button></h3><p>The spaces, the people, and the music between them.</p></article><article class="secondary-story with-image"><div>${meta('Open House','6 min read')}<h3><button class="headline-button" data-action="open-city">A new route through the city</button></h3><p>What happens when you take the long way home.</p></div><button class="image-button" data-action="open-city" aria-label="Read A new route through the city"><img src="assets/city.jpg" alt="Sculptural white architecture against a blue sky"></button></article></div></section>
    <div class="edition-invite"><div><strong>The Edition</strong>A few good things, brought together for the weekend.</div><button class="text-button" data-action="edition">Open this week’s ${icon('arrow')}</button></div>
    <section class="watch-shelf" aria-label="New videos"><div class="section-header"><h3>Watch <span>New from your channels</span></h3><button class="text-button" data-action="watch">All videos ${icon('arrow')}</button></div><div class="video-shelf-items">${videos.filter(v=>v.id!=='live').map(v=>`<button class="shelf-video" data-video="${v.id}"><div class="video-thumb"><img src="assets/${v.image}.jpg" alt=""><span class="duration">${times(v.duration)}</span></div><h4>${v.title}</h4><p>${v.channel}</p></button>`).join('')}</div></section></div>`;
  }
  function readingList() {
    return `<aside ${state.focus?'inert':''} class="reading-list" aria-label="Saved articles"><div class="list-heading"><strong>Saved</strong><span>${24-state.archived.size}</span></div><div class="list-subtitle">Something worth your time.</div>${articles.filter(a=>!state.archived.has(a.id)).map(a=>`<button class="reading-row ${state.article===a.id?'selected':''}" data-article="${a.id}" aria-current="${state.article===a.id?'true':'false'}"><div class="row-origin"><span>${a.source}</span>${state.article===a.id?icon('bookmark'):''}</div><h4>${a.title}</h4>${state.article===a.id?`<img src="assets/${a.image}.jpg" alt="">`:''}<p>${a.minutes} min read${a.id==='album'?'<span>·</span><span>In progress</span>':''}</p></button>`).join('')}</aside>`;
  }
  function articleText(a) {
    if(a.id==='coast')return `<p>We took the train to the coast on Saturday. It was quiet when we arrived, and the café by the station had just opened. For once, we had no particular plan.</p><p>The path followed the water for a mile before turning inland. We stopped at a bench to look at the map, then carried on towards the harbour.</p><h2 id="section-one">The long way round</h2><p>There is something about walking beside the sea that changes the shape of a day. The things that had felt urgent on the train seemed a little less so here. We put our phones away and followed the path.</p><p>A few boats were coming in. Two people were unloading boxes on the quay, and someone was washing the windows of the sailing club. Beyond the harbour wall, the water was almost perfectly still.</p><blockquote>There was no reason to hurry back.</blockquote><h2 id="section-two">A place to stop</h2><p>We bought lunch from the bakery and found a place to sit out of the wind. A dog was making a determined effort to retrieve a stick that was much too large for it. Its owner watched with patient amusement.</p><p>It wasn’t a remarkable afternoon. That was probably the point. There was time to notice the colour of the water, to finish a conversation, to sit for a while without deciding what came next.</p><h2 id="section-three">Taking it with you</h2><p>On the train home, the city slowly came back into view. We talked about coming again, perhaps when the weather turned. The coast would still be there.</p><p>I kept thinking about the bench above the harbour. How little it took to feel somewhere else. How easy it would have been not to go.</p>`;
    const openings={album:'Before the first note was recorded, there was a room full of instruments and a conversation about how the album should feel.',city:'We turned left instead of right. It was a small decision, but it gave us a completely different afternoon.',cinema:'The lights came up slowly. For a moment, nobody moved. Then someone at the back began to clap.',bookshop:'The window was small, the door was open, and there was a handwritten note beside the books.'};
    return `<p>${openings[a.id]}</p><p>It is easy to miss the things that are close to us. We get used to a route, a familiar sound, a place we pass without looking. Sometimes all it takes is a little more time.</p><h2 id="section-one">Looking a little closer</h2><p>What stayed with us was not the thing we had come to see. It was a detail in the background: the shape of a room, a pause in the conversation, something someone had made with care.</p><p>We stayed longer than we expected. There was no particular reason to leave, and plenty to notice once we stopped thinking about the next thing.</p><blockquote>The small decisions are often the ones that matter.</blockquote><h2 id="section-two">Making room</h2><p>By the afternoon, everything felt a little less hurried. We found somewhere to sit and talked about what we had seen. It was the kind of conversation that only happens when there is time.</p><p>Some experiences resist being summed up. They work on you quietly, leaving you with a different way of looking at something you thought you knew.</p><h2 id="section-three">Taking it with you</h2><p>On the way home, we found ourselves returning to the same detail. A small thing, but one that made the whole day feel different.</p><p>We made a note to come back. Not because there was anything left to finish, but because there was something worth spending time with again.</p>`;
  }
  function reader() {
    const a=currentArticle(),saved=state.saved.has(a.id),archived=state.archived.has(a.id);
    const pane=`<section class="reader-pane ${state.font==='Geist'?'serif-free':''}"><div class="reader-toolbar"><div class="toolbar-group">${ib('left','Back to Home','reader-back')}<span class="reader-source">${a.source}</span></div><div class="toolbar-group">${ib('list','Article contents','contents',state.contents?'active':'')}${ib('type','Reading appearance','appearance',state.appearance?'active':'')}<span class="toolbar-divider"></span>${ib(saved?'check':'bookmark',saved?'Remove from Saved':'Save article','save-reader',saved?'active':'')}${ib('archive',archived?'Restore article':'Archive article','archive-reader')}${ib('share','Share article','share')}${ib(state.focus?'expand':'focus',state.focus?'Leave Focus (Esc)':'Enter Focus (⌥⌘F)','focus',state.focus?'active':'')}</div></div><div class="reading-progress"><i id="reading-progress"></i></div><div class="reader-article-scroll" id="article-scroll" tabindex="0" aria-label="Article"><article class="article" style="--reading-size:${state.demo==='large-text'?28:state.fontSize+(state.device==='mac'?0:2)}px;max-width:${state.focus?state.width+45:state.width}px"><p class="article-source">${a.source}<span>·</span><span>${a.minutes} min read</span></p><h1>${a.title}</h1><p class="article-deck">${a.detail}</p><div class="byline">By the ${a.source} editors <span>·</span> 23 October 2026</div><figure><img src="assets/${a.image}.jpg" alt="${a.image==='coast'?'Soft blue ocean waves in the evening light':a.image==='studio'?'An intimate recording studio with guitars and a mixing desk':'Architecture and the spaces around it'}"><figcaption>${a.id==='coast'?'A little room to think, at the edge of the water.':'A closer look at the places and details that make a difference.'}</figcaption></figure><div class="article-body">${articleText(a)}</div><section class="article-finish" aria-label="Finish reading"><h3>A good place to pause.</h3><p>You’ve reached the end. Keep this in Saved, or put it away in your archive.</p><div class="finish-actions"><button class="primary-button" data-action="archive-reader">${icon(archived?'refresh':'archive')}${archived?'Restore article':'Archive article'}</button><button class="secondary-button" data-action="keep-saved">Keep in Saved</button></div><button class="next-article" data-article="${a.id==='album'?'city':'album'}"><div><small>Something else to read · ${a.id==='album'?'6':'12'} min</small><strong>${a.id==='album'?'A new route through the city':'How the album was recorded'}</strong></div><img src="assets/${a.id==='album'?'city':'studio'}.jpg" alt=""></button></section></article></div>${state.appearance?appearance():''}</section>`;
    return `<div class="reader-layout">${readingList()}${pane}${state.contents?contents():''}</div>`;
  }
  function contents() {
    return `<aside class="contents-panel" aria-label="Article contents"><h3>In this article ${ib('close','Close contents','contents')}</h3><button data-jump="top" class="current">${currentArticle().title}</button><button data-jump="section-one">${state.article==='coast'?'The long way round':'Looking a little closer'}</button><button data-jump="section-two">${state.article==='coast'?'A place to stop':'Making room'}</button><button data-jump="section-three">Taking it with you</button><button data-jump="end">Finish reading</button><small>${currentArticle().minutes} min read<br>Your place is saved as you go.</small></aside>`;
  }
  function appearance() {
    return `<section class="popover" aria-label="Reading appearance"><h3>Make yourself comfortable.</h3><label>Typeface</label><div class="font-options"><button data-font="Newsreader" class="${state.font==='Newsreader'?'selected':''}" style="font-family:Newsreader,Georgia,serif">Newsreader</button><button data-font="Geist" class="${state.font==='Geist'?'selected':''}">Geist</button></div><label>Text size</label><div class="size-control"><button data-action="smaller" aria-label="Smaller text">A−</button><span>${state.fontSize} pt</span><button data-action="larger" aria-label="Larger text">A+</button></div><label for="line-width">Line width <span>${state.width<640?'Narrow':state.width>710?'Wide':'Comfortable'}</span></label><input id="line-width" type="range" min="570" max="780" step="15" value="${state.width}"><button class="text-button" data-action="appearance">Done ${icon('check')}</button></section>`;
  }
  function watch() {
    const v=currentVideo();
    const poster=state.mini?`<div class="mini-placeholder">${icon('mini')}<p>Playing in the mini player</p><button class="secondary-button" data-action="expand-player">Bring video back</button></div>`:`<div class="video-stage"><img src="assets/${v.image}.jpg" alt="${v.image==='studio'?'A warm recording studio full of guitars and recording equipment':'A scene from the sample video'}"><button class="stage-play" data-action="play" aria-label="${state.playing?'Pause':'Play'} sample video">${icon(state.playing?'pause':'play')}</button><span class="video-state"><i></i><span id="video-state-label">${state.playing?'Playing':'Paused'} · Preview</span></span><span class="video-caption">${chapters.filter(c=>c[0]<=state.time).at(-1)?.[1]||'Finding the room'}</span></div>`;
    const layout=`<div class="watch-layout"><section class="watch-main"><div class="watch-breadcrumb"><div><button class="text-button" data-action="home">Watch</button>${icon('right')}<span>${v.channel}</span></div><button class="watch-context-button ${state.contextShown?'active':''}" data-action="toggle-context">${icon('sidebar')}${state.contextShown?'Hide context':'Show context'}</button></div>${poster}<div class="transport"><input class="seek-range" id="seek" aria-label="Video position" type="range" min="0" max="${v.duration}" value="${state.time}" style="--seek:${state.time/v.duration*100}%"><div class="transport-row"><div class="transport-buttons">${ib('back10','Back 10 seconds','back10')}${ib(state.playing?'pause':'play',state.playing?'Pause':'Play','play')}${ib('forward10','Forward 10 seconds','forward10')}<span class="transport-time"><span id="elapsed">${times(state.time)}</span> <span>/ ${times(v.duration)}</span></span></div><div class="playback-options"><button class="speed-button" data-action="speed" title="Playback speed">${state.rate}×</button>${ib('pip','Picture in Picture — native handoff','pip')}${ib('mini','Move to mini player','mini')}${ib(state.theatre?'expand':'focus',state.theatre?'Leave viewing Focus':'Viewing Focus','theatre',state.theatre?'active':'')}</div></div></div><div class="video-details"><h2>${v.title}</h2><p><span>${v.channel}</span><span>·</span><span>2 hours ago</span><span>·</span><span>${times(v.duration)}</span></p><div class="story-actions"><button class="text-button ${state.saved.has(v.id)?'accent':''}" data-action="save-video">${icon(state.saved.has(v.id)?'check':'bookmark')}${state.saved.has(v.id)?'Saved':'Save video'}</button><button class="text-button" data-action="share">${icon('share')}Share</button>${state.device==='mac'?`<button class="text-button" data-action="pop-out">${icon('external')}Float above other apps</button>`:''}</div><div class="video-description">A closer look at the rooms, the instruments, and the small decisions behind a record. Come in, take a seat, and listen.</div></div></section>${state.contextShown&&!state.theatre?watchPanel():''}</div>`;
    return state.device==='iphone'?`<div class="watch-mobile-layout">${poster}${layout.replace(poster,'')}</div>`:layout;
  }
  function watchPanel() {
    return `<aside class="watch-panel" aria-label="Video context"><div class="context-tabs" role="tablist" aria-label="Video context">${[['queue','Up next'],['transcript','Transcript'],['chapters','Chapters'],['about','About']].map(([id,label])=>`<button id="tab-${id}" role="tab" aria-selected="${state.context===id}" aria-controls="video-context" data-context="${id}" tabindex="${state.context===id?'0':'-1'}">${label}</button>`).join('')}</div><div id="video-context" class="context-body" role="tabpanel" aria-labelledby="tab-${state.context}">${panelContent()}</div></aside>`;
  }
  function panelContent() {
    if(state.context==='queue')return `<div class="queue-summary"><span>Next in this session</span><span>${state.queue.length} videos</span></div><div class="queue-list">${state.queue.map((id,index)=>{const v=videos.find(v=>v.id===id);return `<div class="queue-row" draggable="true" data-queue="${id}"><button class="queue-item-button" data-video="${id}" aria-label="Play ${v.title}"><img src="assets/${v.image}.jpg" alt=""></button><button class="queue-item-button" data-video="${id}"><h4>${v.title}</h4><p>${v.channel}<br>${times(v.duration)}</p></button><div class="queue-move"><button data-reorder="${id}" data-direction="-1" aria-label="Move ${v.title} earlier" ${index===0?'disabled':''}>${icon('up')}</button><button data-reorder="${id}" data-direction="1" aria-label="Move ${v.title} later" ${index===state.queue.length-1?'disabled':''}>${icon('down')}</button></div></div>`;}).join('')}</div><p class="panel-note">Drag to change the order, or use the arrows. Playback stops at the end of your queue.</p>`;
    if(state.context==='transcript')return `<div class="transcript-tools"><label class="transcript-search">${icon('search')}<input id="transcript-search" type="search" placeholder="Find in transcript" aria-label="Find in transcript" value="${esc(state.search)}"></label><button class="follow-button ${state.follow?'active':''}" data-action="follow" aria-pressed="${state.follow}">Follow${state.follow?'ing':''}</button></div><div id="transcript-lines">${transcriptLines()}</div>`;
    if(state.context==='chapters')return `<h3 class="about-heading">Find your place.</h3>${chapters.map(([t,text])=>`<button class="chapter-row" data-seek="${t}"><time>${times(t)}</time><span>${text}</span></button>`).join('')}`;
    return `<h3 class="about-heading">${currentVideo().channel}</h3><p class="about-copy">A closer look at the rooms, the instruments, and the small decisions behind a record.</p><p class="about-copy">This sample episode follows a recording session, from finding the right space to listening back to the final take.</p><p class="panel-note">Illustrative episode and transcript. Video playback is simulated for this design study.</p><button class="text-button" data-action="original">Open original ${icon('external')}</button>`;
  }
  function transcriptLines() {
    const current=transcript.findLastIndex(([t])=>t<=state.time),query=state.search.toLowerCase();
    const found=transcript.filter(([,s])=>s.toLowerCase().includes(query));
    if(!found.length)return `<p class="context-empty">No matches for “${esc(state.search)}”. Try another word.</p>`;
    return found.map(([t,text])=>{let content=esc(text);if(query){const escaped=esc(state.search).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');content=content.replace(new RegExp(escaped,'gi'),m=>`<mark>${m}</mark>`);}return `<button class="transcript-line ${transcript[current]?.[0]===t?'current':''}" data-seek="${t}"><time>${times(t)}</time><span>${content}</span></button>`;}).join('');
  }
  function mini() {
    const v=currentVideo();
    return `<section class="floating-mini" aria-label="Mini player"><div class="mini-image"><img src="assets/${v.image}.jpg" alt="Sample video">${ib('expand','Return to full video','expand-player')}</div><div class="mini-controls"><div><h4>${v.title}</h4><p><span id="mini-time">${times(state.time)}</span> · ${state.playing?'Playing':'Paused'}</p></div>${ib(state.playing?'pause':'play',state.playing?'Pause':'Play','play')}</div></section>`;
  }
  function emptyState() {
    if(state.demo==='loading')return `<div class="content"><div class="skeleton-wrap" aria-label="Loading sample content"><div class="skeleton short"></div><div class="skeleton"></div><div class="skeleton large"></div><div class="skeleton"></div><div class="skeleton short"></div></div></div>`;
    if(state.demo==='error')return `<div class="content"><div class="placeholder-state">${icon('wifi')}<h2>A little interruption.</h2><p>Stash couldn’t load this view. Your saved items and your place are still here.</p><button class="primary-button" data-action="retry">Try again ${icon('refresh')}</button></div></div>`;
    return `<div class="content"><div class="placeholder-state">${icon(state.screen==='watch'?'watch':'bookmark')}<h2>Make room for something good.</h2><p>${state.screen==='watch'?'Save a video or follow a channel to bring a little more of what you love here.':'Save an article you want to spend time with. It will be waiting here when you are ready.'}</p><button class="primary-button" data-action="add">${icon('plus')}Save a link</button><button class="text-button" style="display:block;margin:15px auto" data-action="retry">Explore sample content ${icon('arrow')}</button></div></div>`;
  }
  function render({preserve=false}={}) {
    const oldScroll=$('#article-scroll')?.scrollTop;
    if(preserve && oldScroll!==undefined)articleScroll=oldScroll;
    device.className=`device ${state.device} ${state.focus?'focus-mode':''} ${state.theatre?'theatre':''} ${state.demo==='large-text'?'large-text':''} ${state.demo==='no-images'?'no-images':''} ${state.landscape?'landscape':''} ${state.compact?'compact':''}`;
    device.dataset.theme=state.theme;device.dataset.screen=state.screen;
    document.documentElement.classList.toggle('reduced-motion',state.reduced);
    app.innerHTML=`${status()}${windowbar()}${tabletbar()}${mobilebar()}<div class="workspace">${sidebar()}${['empty','loading','error'].includes(state.demo)?emptyState():state.screen==='home'?home():state.screen==='reader'?reader():watch()}</div>${bottomnav()}<div class="home-indicator" aria-hidden="true"></div>${state.mini?mini():''}`;
    $('#home-scroll')?.scrollTo({top:homeScroll,behavior:'instant'});
    $('#article-scroll')?.scrollTo({top:articleScroll,behavior:'instant'});
    $('#article-scroll')?.addEventListener('scroll',updateProgress,{passive:true});
    $('#home-scroll')?.addEventListener('scroll',()=>homeScroll=$('#home-scroll').scrollTop,{passive:true});
    updateProgress(); updateReview(); fit();
  }
  function updateReview() {
    const c=copy[state.concept];$('#study-title').textContent=c.title;$('#study-description').textContent=c.description;$('#interaction-hint').textContent=c.hint;
    $$('[data-concept]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.concept===state.concept));
    $$('[data-device]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.device===state.device));
    const layout=$('#layout-toggle');layout.hidden=state.device==='iphone';layout.textContent=state.device==='ipad'?(state.landscape?'Portrait':'Landscape'):'Compact';layout.setAttribute('aria-label',state.device==='ipad'?`Switch iPad to ${state.landscape?'portrait':'landscape'}`:'Use compact Mac window');layout.setAttribute('aria-pressed',state.device==='ipad'?state.landscape:state.compact);
    $('#theme-toggle').innerHTML=icon(state.theme==='dark'?'sun':'moon');$('#theme-toggle').setAttribute('aria-label',`Switch to ${state.theme==='dark'?'light':'dark'} appearance`);
    $('#notes-toggle').innerHTML=icon('info');$('#notes-toggle').setAttribute('aria-expanded',state.notes);
    $('#notes-toggle').setAttribute('aria-label',`${state.notes?'Hide':'Show'} design notes`);
    $('#design-notes').hidden=!state.notes;
    $('#design-notes').innerHTML=c.notes.map(([title,text],i)=>`<div><h3>${title}</h3><p>${text}</p>${i===2?`<label class="demo-state-control">Inspect a state <select id="demo-state" aria-label="Inspect sample state">${[['normal','Normal'],['loading','Loading'],['empty','Empty'],['error','Connection error'],['large-text','Larger text'],['no-images','Missing images']].map(([v,t])=>`<option value="${v}" ${state.demo===v?'selected':''}>${t}</option>`).join('')}</select></label>`:''}</div>`).join('');
  }
  function fit() {
    const width=state.device==='mac'?(state.compact?800:1320):state.device==='ipad'?(state.landscape?1366:1024):402;
    const height=state.device==='mac'?870:state.device==='ipad'?(state.landscape?1024:1366):874;
    device.style.width=`${width}px`;device.style.height=`${height}px`;
    const available=stage.clientWidth;
    // Touch previews keep legible proportions. Tablet height is intentionally scrollable on a laptop.
    const capturing=document.body.classList.contains('capture');
    const scale=Math.min(1,available/width,capturing?(window.innerHeight-24)/height:state.device==='ipad'?0.73:1);
    device.style.transform=`scale(${scale})`;stage.style.height=`${height*scale+2}px`;
    device.style.marginLeft=`${-(width-width*scale)/2}px`;device.style.marginRight=`${-(width-width*scale)/2}px`;
  }
  function updateProgress(){const el=$('#article-scroll');if(!el)return;articleScroll=el.scrollTop;const p=el.scrollHeight>el.clientHeight?el.scrollTop/(el.scrollHeight-el.clientHeight):0;const bar=$('#reading-progress');if(bar)bar.style.width=`${Math.max(.015,p)*100}%`;}
  function announce(text){$('#live').textContent=text;}
  function toast(text,undo=null) {
    clearTimeout(toastTimer);$('.toast')?.remove();
    const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.innerHTML=`${icon('check')}<span>${esc(text)}</span>${undo?'<button data-action="undo">Undo</button>':''}<button data-action="dismiss-toast" aria-label="Dismiss message">${icon('close')}</button>`;
    app.append(el);if(undo)el.querySelector('[data-action=undo]').onclick=()=>{undo();el.remove();announce('Action undone');};
    announce(text);toastTimer=setTimeout(()=>el.remove(),8000);
  }
  function chooseConcept(name) {
    state.concept=name;state.screen=name;state.focus=false;state.theatre=false;state.appearance=false;state.contents=false;state.demo='normal';
    if(name==='reader'){state.article='coast';articleScroll=0;}if(name==='watch'){state.video='studio';state.context='queue';state.contextShown=true;state.time=482;state.playing=false;state.mini=false;}
    history.replaceState(null,'',`#${name}`);render();
  }
  function openArticle(id) {
    if($('#home-scroll'))homeScroll=$('#home-scroll').scrollTop;
    if(id!==state.article)articleScroll=0;
    state.article=id;state.screen='reader';state.focus=false;state.appearance=false;state.contents=false;state.theatre=false;render();announce(`Opened ${currentArticle().title}`);
  }
  function openVideo(id=state.video) {
    if($('#home-scroll'))homeScroll=$('#home-scroll').scrollTop;
    if(state.video!==id){state.video=id;state.time=0;state.playing=false;state.queue=state.queue.filter(v=>v!==id);}
    state.screen='watch';state.focus=false;state.theatre=false;state.mini=false;state.contextShown=true;render();
  }
  function saveArticle(id,force=false) {
    const was=state.saved.has(id);if(was&&!force)state.saved.delete(id);else state.saved.add(id);
    render({preserve:true});toast(was&&!force?'Removed from Saved':'Saved for a little later',()=>{was?state.saved.add(id):state.saved.delete(id);render({preserve:true});});
  }
  function archiveArticle() {
    const id=state.article,was=state.archived.has(id);if(was)state.archived.delete(id);else state.archived.add(id);
    render({preserve:true});toast(was?'Restored to Saved':'Article moved to Archive',()=>{was?state.archived.add(id):state.archived.delete(id);render({preserve:true});});
  }
  function setTime(value,{seek=false}={}) {
    state.time=Math.min(currentVideo().duration,Math.max(0,Number(value)));
    if(seek)announce(`Moved to ${times(state.time)}`);
    $('#elapsed') && ($('#elapsed').textContent=times(state.time));
    $('#mini-time') && ($('#mini-time').textContent=times(state.time));
    const range=$('#seek');if(range){range.value=state.time;range.style.setProperty('--seek',`${state.time/currentVideo().duration*100}%`);}
    const current=transcript.findLastIndex(([t])=>t<=state.time);
    $$('.transcript-line').forEach(el=>el.classList.toggle('current',Number(el.dataset.seek)===transcript[current]?.[0]));
    const caption=$('.video-caption');if(caption)caption.textContent=chapters.filter(([t])=>t<=state.time).at(-1)?.[1]||chapters[0][1];
    if(state.follow&&state.context==='transcript'&&!state.search){const line=$('.transcript-line.current'),container=$('#video-context');if(line&&container&&state.device==='mac'){const top=line.offsetTop-container.offsetTop-container.clientHeight/2+line.clientHeight/2;container.scrollTo({top:Math.max(0,top),behavior:state.reduced?'instant':'smooth'});}}
  }
  function updateFollow(){const el=$('.follow-button');if(el){el.classList.toggle('active',state.follow);el.setAttribute('aria-pressed',state.follow);el.textContent=state.follow?'Following':'Follow';}}
  function updateContext(){const panel=$('.watch-panel');if(panel)panel.outerHTML=watchPanel();setTime(state.time);}
  function showSheet(title,content,extra='') {
    $('.sheet-scrim')?.remove();const scrim=document.createElement('div');scrim.className='sheet-scrim';
    const previous=document.activeElement;
    scrim.innerHTML=`<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-heading"><h3 id="sheet-title">${title}</h3>${ib('close','Close dialog','close-sheet')}</div>${content}${extra}</section>`;
    app.append(scrim);scrim.addEventListener('click',e=>{if(e.target===scrim)closeSheet();});
    scrim.restoreFocus=()=>previous?.focus();
    scrim.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=$$('button,input,a,select',scrim).filter(x=>!x.disabled),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
    ($('input',scrim)||$('button',scrim)).focus();
  }
  function closeSheet(){const el=$('.sheet-scrim');el?.restoreFocus?.();el?.remove();}
  function infoSheet(title,text){showSheet(title,`<p>${text}</p><div class="sheet-actions"><button class="primary-button" data-action="close-sheet">Done</button></div>`);}
  function saveSheet(){showSheet('Save something good.',`<p>A link you’d like to come back to.</p><form id="save-form"><input type="url" id="save-url" aria-label="Website address" placeholder="Paste a website address" required><p id="save-message" class="sheet-error" aria-live="polite"></p><div class="sheet-actions"><button class="secondary-button" type="button" data-action="close-sheet">Cancel</button><button class="primary-button" type="submit">Save link ${icon('arrow')}</button></div></form>`);}
  function searchSheet(){showSheet('Find something good.',`<input type="search" id="global-search" aria-label="Search sample library" placeholder="Search your Stash"><div id="search-results">${searchResults('')}</div>`);}
  function searchResults(query){const results=articles.filter(a=>(a.title+' '+a.source).toLowerCase().includes(query.toLowerCase()));return results.length?results.map(a=>`<button class="search-result" data-article="${a.id}"><img src="assets/${a.image}.jpg" alt=""><span><strong>${a.title}</strong><small>${a.source} · ${a.minutes} min read</small></span></button>`).join(''):`<p class="context-empty">No matches. Try “coast”, “album”, or “city”.</p>`;}
  const actions={
    home:()=>{state.screen='home';state.focus=false;state.theatre=false;state.appearance=false;state.contents=false;render();},
    reader:()=>openArticle(state.article),watch:()=>openVideo(),
    'reader-back':()=>actions.home(),
    sidebar:()=>{state.sidebar=!state.sidebar;const side=$('.sidebar');side?.classList.toggle('collapsed',!state.sidebar);side?.toggleAttribute('inert',!state.sidebar||state.focus||state.theatre);},
    focus:()=>{
      const scroller=$('#article-scroll'),edge=scroller?.getBoundingClientRect().top||0;
      const anchor=$$('.article h1,.article figure,.article-body p,.article-body h2,.article-body blockquote,.article-finish').find(el=>el.getBoundingClientRect().bottom>edge+12);
      const anchorOffset=anchor?anchor.getBoundingClientRect().top-edge:0;
      if(scroller)scroller.scrollTo({top:scroller.scrollTop,behavior:'instant'});
      state.focus=!state.focus;state.appearance=false;$('.popover')?.remove();
      device.classList.toggle('focus-mode',state.focus);
      $('.sidebar')?.toggleAttribute('inert',state.focus||!state.sidebar);
      $('.reading-list')?.toggleAttribute('inert',state.focus);
      const article=$('.article');if(article)article.style.maxWidth=`${state.focus?state.width+45:state.width}px`;
      const button=$('[data-action="focus"]'),label=state.focus?'Leave Focus (Esc)':'Enter Focus (⌥⌘F)';
      button?.setAttribute('aria-label',label);button?.setAttribute('title',label);button?.classList.toggle('active',state.focus);
      if(button)button.innerHTML=icon(state.focus?'expand':'focus');
      if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:19,height:19,class:'icon'}});
      const started=performance.now(),duration=state.reduced||matchMedia('(prefers-reduced-motion: reduce)').matches?80:320;
      function keepReadingPlace(){if(!scroller||!anchor||!document.contains(scroller))return;const change=anchor.getBoundingClientRect().top-scroller.getBoundingClientRect().top-anchorOffset;const scale=device.getBoundingClientRect().width/device.offsetWidth||1;if(Math.abs(change)>.5)scroller.scrollTo({top:scroller.scrollTop+change/scale,behavior:'instant'});if(performance.now()-started<duration)requestAnimationFrame(keepReadingPlace);}
      keepReadingPlace();
      announce(state.focus?'Focus mode':'Split reading view');
    },
    contents:()=>{state.contents=!state.contents;state.appearance=false;render({preserve:true});if(state.contents)$('.contents-panel button')?.focus();},
    appearance:()=>{state.appearance=!state.appearance;render({preserve:true});},
    larger:()=>{state.fontSize=Math.min(32,state.fontSize+2);render({preserve:true});},
    smaller:()=>{state.fontSize=Math.max(16,state.fontSize-2);render({preserve:true});},
    'save-home':()=>saveArticle('coast'),'save-reader':()=>saveArticle(state.article),'keep-saved':()=>{state.archived.delete(state.article);saveArticle(state.article,true);},'archive-reader':archiveArticle,
    arrivals:()=>{state.newItems=0;render({preserve:true});toast('Front page updated. You’re all caught up.');},
    'open-album':()=>{openArticle('album');const heading=$('#section-one');if(heading)$('#article-scroll').scrollTo({top:heading.offsetTop-25,behavior:'instant'});updateProgress();},'open-coast':()=>openArticle('coast'),'open-city':()=>openArticle('city'),'open-cinema':()=>openArticle('cinema'),'open-bookshop':()=>openArticle('bookshop'),
    'toggle-context':()=>{state.contextShown=!state.contextShown;render();},
    play:()=>{state.playing=!state.playing;lastTick=performance.now();const scroll=$('.watch-main')?.scrollTop||0,contextScroll=$('#video-context')?.scrollTop||0;render({preserve:true});$('.watch-main')?.scrollTo(0,scroll);$('#video-context')?.scrollTo(0,contextScroll);},
    back10:()=>setTime(state.time-10,{seek:true}),forward10:()=>setTime(state.time+10,{seek:true}),
    speed:()=>{const rates=[1,1.25,1.5,2,.75];state.rate=rates[(rates.indexOf(state.rate)+1)%rates.length];$('.speed-button').textContent=`${state.rate}×`;toast(`Playback speed: ${state.rate}×`);},
    follow:()=>{state.follow=!state.follow;if(state.follow&&state.search){state.search='';const input=$('#transcript-search');if(input)input.value='';$('#transcript-lines').innerHTML=transcriptLines();}updateFollow();setTime(state.time);},
    mini:()=>{state.mini=true;render();toast('Same video. Same place.');},
    'expand-player':()=>{state.mini=false;state.screen='watch';render();},
    theatre:()=>{state.theatre=!state.theatre;device.classList.toggle('theatre',state.theatre);$('.sidebar')?.toggleAttribute('inert',state.theatre||!state.sidebar);$('.watch-panel')?.toggleAttribute('inert',state.theatre);const button=$('[data-action="theatre"]');button?.classList.toggle('active',state.theatre);button?.setAttribute('aria-label',state.theatre?'Leave viewing Focus':'Viewing Focus');if(button)button.innerHTML=icon(state.theatre?'expand':'focus');if(globalThis.lucide)globalThis.lucide.createIcons({attrs:{width:19,height:19,class:'icon'}});},
    pip:()=>infoSheet('A native viewing handoff.','In the native app, this control requests system Picture in Picture when the video provider supports it. This browser concept preserves your video position and illustrates the handoff without opening a fake system window.'),
    'pop-out':()=>infoSheet('Above your other windows.','The Mac app’s existing floating player keeps the same video and playback position in a separate window. In this concept, try the mini player to explore the transition within the preview.'),
    'save-video':()=>saveArticle(state.video),
    share:()=>infoSheet('Share, the familiar way.','This opens the native share sheet in Stash, with the original article or video link. The concept keeps this as a system handoff.'),
    original:()=>infoSheet('Back to the source.','Stash opens the original link in your default browser. The episode here is sample content, so this concept does not navigate to an invented source.'),
    add:saveSheet,search:searchSheet,'close-sheet':closeSheet,
    more:()=>showSheet('A few useful things.',`<button class="search-result" data-action="share">${icon('share')}Share original link</button><button class="search-result" data-action="original">${icon('external')}Open original</button><button class="search-result" data-action="${state.screen==='watch'?'mini':'contents'}">${icon(state.screen==='watch'?'mini':'list')}${state.screen==='watch'?'Move to mini player':'Article contents'}</button>`),
    edition:()=>showSheet('The weekend, considered.',`<p>A short selection from your Stash. Nothing to keep up with. Just a few things worth sitting down with.</p>${articles.slice(0,3).map(a=>`<button class="search-result" data-article="${a.id}"><img src="assets/${a.image}.jpg" alt=""><span><strong>${a.title}</strong><small>${a.minutes} min · ${a.source}</small></span></button>`).join('')}<p class="panel-note">Illustrative Edition preview.</p>`),
    feeds:()=>showSheet('New from your feeds.',`<p>A compact preview of the six new articles. The full Feeds redesign is outside these three studies.</p>${searchResults('')}`),
    highlights:()=>infoSheet('Words worth keeping.','Highlights stay available in Stash. These concepts focus on the front page, reading, and watching; the existing highlight library remains part of the app.'),
    discover:()=>infoSheet('More of what interests you.','Discover continues to offer sources to follow. This study uses sample content, so it does not change your subscriptions.'),
    'saved-videos':()=>{state.screen='watch';state.context='queue';state.contextShown=true;render();toast('Your saved video queue');},
    collections:()=>showSheet('Your collections.',`<p>Familiar collections, within reach.</p>${[['Music','studio'],['Architecture','park'],['A different weekend','railway']].map(([t,id])=>`<button class="search-result" data-video="${id}">${icon('folder')}<strong>${t}</strong></button>`).join('')}`),
    'archive-list':()=>showSheet('Put away, still here.',state.archived.size?articles.filter(a=>state.archived.has(a.id)).map(a=>`<button class="search-result" data-article="${a.id}">${icon('archive')}<span><strong>${a.title}</strong><small>Archived · Open to restore</small></span></button>`).join(''):'<p>Your archive is quiet for now. Finish an article and choose Archive to try it.</p>'),
    settings:()=>showSheet('Make Stash your own.',`<p>The native app keeps account, feeds and app preferences here. For this review, use the appearance and Reduce motion controls above the preview.</p><div class="sheet-actions"><button class="primary-button" data-action="close-sheet">Done</button></div>`),
    retry:()=>{state.demo='normal';render();toast('You’re back. Your place is still here.');},
    'dismiss-toast':()=>$('.toast')?.remove(),
  };
  document.addEventListener('click',e=>{
    const concept=e.target.closest('[data-concept]');if(concept){chooseConcept(concept.dataset.concept);return;}
    const dev=e.target.closest('[data-device]');if(dev){state.device=dev.dataset.device;state.appearance=false;render({preserve:true});return;}
    const ar=e.target.closest('[data-article]');if(ar){closeSheet();openArticle(ar.dataset.article);return;}
    const video=e.target.closest('[data-video]');if(video){closeSheet();openVideo(video.dataset.video);return;}
    const context=e.target.closest('[data-context]');if(context){state.context=context.dataset.context;updateContext();return;}
    const seek=e.target.closest('[data-seek]');if(seek){state.follow=false;updateFollow();setTime(seek.dataset.seek,{seek:true});return;}
    const jump=e.target.closest('[data-jump]');if(jump){const dest=jump.dataset.jump,el=$('#article-scroll');if(state.device!=='mac'){state.contents=false;render({preserve:true});}const scroll=$('#article-scroll');if(dest==='top')scroll.scrollTo({top:0,behavior:state.reduced?'instant':'smooth'});else if(dest==='end')scroll.scrollTo({top:scroll.scrollHeight,behavior:state.reduced?'instant':'smooth'});else{const node=$(`#${dest}`);scroll.scrollTo({top:node.offsetTop-30,behavior:state.reduced?'instant':'smooth'});}return;}
    const font=e.target.closest('[data-font]');if(font){state.font=font.dataset.font;render({preserve:true});return;}
    const order=e.target.closest('[data-reorder]');if(order){const i=state.queue.indexOf(order.dataset.reorder),j=i+Number(order.dataset.direction);if(j>=0&&j<state.queue.length){[state.queue[i],state.queue[j]]=[state.queue[j],state.queue[i]];updateContext();announce('Queue order updated');}return;}
    const action=e.target.closest('[data-action]');if(action&&action.dataset.action!=='undo'){if(action.closest('.sheet')&&!['close-sheet'].includes(action.dataset.action))closeSheet();actions[action.dataset.action]?.();}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='seek')setTime(e.target.value);
    if(e.target.id==='line-width'){state.width=Number(e.target.value);const a=$('.article');if(a)a.style.maxWidth=`${state.width}px`;}
    if(e.target.id==='transcript-search'){state.search=e.target.value;state.follow=false;updateFollow();$('#transcript-lines').innerHTML=transcriptLines();}
    if(e.target.id==='global-search')$('#search-results').innerHTML=searchResults(e.target.value);
  });
  for(const event of ['wheel','touchmove'])document.addEventListener(event,e=>{if(e.target.closest('#video-context')&&state.context==='transcript'&&state.follow){state.follow=false;updateFollow();}},{passive:true});
  document.addEventListener('change',e=>{if(e.target.id==='demo-state'){state.demo=e.target.value;render({preserve:true});}});
  document.addEventListener('submit',e=>{
    if(e.target.id!=='save-form')return;e.preventDefault();const input=$('#save-url');let url;
    try{url=new URL(input.value);if(!['https:','http:'].includes(url.protocol))throw Error();}catch{$('#save-message').textContent='Enter a complete website address, starting with https://.';input.focus();return;}
    const submit=$('button[type=submit]',e.target);submit.disabled=true;submit.textContent='Saving…';
    setTimeout(()=>{if(!document.contains(submit))return;closeSheet();state.saved.add('coast');render({preserve:true});toast('Link saved in this preview. Preparing your article.');},450);
  });
  document.addEventListener('dragstart',e=>{const row=e.target.closest('[data-queue]');if(!row)return;dragID=row.dataset.queue;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragID);});
  document.addEventListener('dragover',e=>{if(e.target.closest('[data-queue]')){e.preventDefault();e.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',e=>{const row=e.target.closest('[data-queue]');if(!row||!dragID)return;e.preventDefault();const from=state.queue.indexOf(dragID),to=state.queue.indexOf(row.dataset.queue);state.queue.splice(from,1);state.queue.splice(to,0,dragID);dragID=null;updateContext();announce('Queue order updated');});
  document.addEventListener('dragend',()=>{dragID=null;$$('.dragging').forEach(e=>e.classList.remove('dragging'));});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if($('.sheet-scrim'))closeSheet();else if(state.appearance||state.contents){state.appearance=false;state.contents=false;render({preserve:true});}else if(state.focus||state.theatre){state.focus=false;state.theatre=false;render({preserve:true});}return;}
    const isInput=e.target.matches('input,textarea,select');
    
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'&&!e.altKey){e.preventDefault();searchSheet();return;}
    if((e.metaKey||e.ctrlKey)&&e.altKey&&e.key.toLowerCase()==='f'){e.preventDefault();state.screen==='reader'?actions.focus():actions.theatre();return;}
    if(isInput)return;
    if(e.target.matches('[role=tab]')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const tabs=$$('[data-context]'),i=tabs.indexOf(e.target),next=tabs[(i+(e.key==='ArrowRight'?1:3))%4].dataset.context;state.context=next;updateContext();$(`[data-context=${next}]`).focus();return;}
    if(state.screen==='watch'&&!$('.sheet-scrim')&&!e.target.matches('button')){if(e.code==='Space'){e.preventDefault();actions.play();}if(e.key==='ArrowLeft'){e.preventDefault();actions.back10();}if(e.key==='ArrowRight'){e.preventDefault();actions.forward10();}}
  });
  $('#theme-toggle').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';device.dataset.theme=state.theme;updateReview();};
  $('#notes-toggle').onclick=()=>{state.notes=!state.notes;updateReview();};
  $('#layout-toggle').onclick=()=>{if(state.device==='ipad')state.landscape=!state.landscape;else state.compact=!state.compact;render({preserve:true});};
  $('#reduce-motion').onchange=e=>{state.reduced=e.target.checked;document.documentElement.classList.toggle('reduced-motion',state.reduced);};
  $('#reset').onclick=()=>{const keep={concept:state.concept,device:state.device,theme:state.theme,notes:state.notes,reduced:state.reduced};state={...defaults(),...keep};homeScroll=0;articleScroll=0;chooseConcept(keep.concept);};
  new ResizeObserver(fit).observe(stage);
  videoClock=setInterval(()=>{const now=performance.now(),elapsed=(now-lastTick)/1000;lastTick=now;if(!state.playing)return;if(state.time>=currentVideo().duration){if(state.queue.length){const next=state.queue.shift();state.video=next;state.time=0;render();announce(`Now playing ${currentVideo().title}`);}else{state.playing=false;render();toast('You’ve reached the end of your queue.');}return;}setTime(state.time+Math.min(elapsed,2)*state.rate);},500);
  const params=new URLSearchParams(location.search);
  if(['mac','ipad','iphone'].includes(params.get('device')))state.device=params.get('device');
  if(['dark','light'].includes(params.get('theme')))state.theme=params.get('theme');
  if(params.get('layout')==='landscape')state.landscape=true;
  if(params.get('layout')==='compact')state.compact=true;
  const hash=location.hash.slice(1);if(copy[hash]){state.concept=hash;state.screen=hash;}
  window.addEventListener('hashchange',()=>{const name=location.hash.slice(1);if(copy[name]&&name!==state.concept)chooseConcept(name);});
  if(params.get('capture')==='1'){document.body.classList.add('capture');}
  render();
})();
