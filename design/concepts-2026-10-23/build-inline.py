"""Package the review into a self-contained, scoped in-chat mockup."""
import base64
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
OUTPUT = pathlib.Path(sys.argv[1])

def data(path, mime):
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()

assets = {}
for name in ['coast','city','studio','concert','park','railway','cinema','books']:
    output = pathlib.Path('/tmp/stash-inline-assets') / (name + '.webp')
    output.parent.mkdir(exist_ok=True)
    subprocess.run(['cwebp','-quiet','-q','68','-resize','840','0',str(HERE/'assets'/f'{name}.jpg'),'-o',str(output)],check=True)
    assets['assets/' + name + '.jpg'] = data(output,'image/webp')
assets['assets/mark.png'] = data(HERE/'assets/mark.png','image/png')
fonts = [
    ('StashConceptGeist', REPO/'packages/web/public/static/fonts/Geist/Geist-Variable.woff2', '100 900', 'normal','font/woff2'),
    ('StashConceptMono', REPO/'packages/web/public/static/fonts/Geist/GeistMono-Variable.woff2', '100 900', 'normal','font/woff2'),
    ('StashConceptNews', HERE/'assets/Newsreader-Regular.ttf','400','normal','font/ttf'),
    ('StashConceptNews', HERE/'assets/Newsreader-Medium.ttf','500','normal','font/ttf'),
    ('StashConceptNews', HERE/'assets/Newsreader-Italic.ttf','400','italic','font/ttf'),
]
font_css = ''.join("@font-face{font-family:'%s';src:url('%s');font-weight:%s;font-style:%s}"%(name,data(path,mime),weight,style) for name,path,weight,style,mime in fonts)
css = re.sub(r'@font-face\{[^}]+\}', '', (HERE/'concepts.css').read_text())
css = css.replace("'Geist Mono'", "'StashConceptMono'").replace('Newsreader','StashConceptNews').replace('Geist,','StashConceptGeist,').replace('font-family:Geist;','font-family:StashConceptGeist;')
css = css.replace(':root',':scope').replace('html.reduced-motion',':scope.reduced-motion')
css = re.sub(r'(?<![-\w])body(?=[.{])',':scope',css)
css += ":scope{display:block;background:transparent;color:light-dark(#27272a,#e5e3e0)}.review-main{padding:24px 10px 18px}.review-header{padding:0 10px;height:64px}.review-header,.design-notes{border-color:light-dark(#d8d5d0,#3b3936)}.review-brand span,.study-heading p,.review-footer,.design-notes p{color:light-dark(#6b655e,#b6b1ab)}.concept-tabs button{color:light-dark(#6b655e,#b6b1ab)}.concept-tabs button[aria-pressed=true]{color:light-dark(#242220,#f4f3ef)}.review-footer button{color:inherit}.study-heading h1{font-size:28px}.fixture-label{display:none}.device-tabs{background:light-dark(#dfdcd7,#363431)}.device-tabs button{color:light-dark(#635e58,#c5c0ba)}.device-tabs button[aria-pressed=true]{background:light-dark(#faf9f6,#514c46);color:light-dark(#22201e,#fff)}.review-icon:hover{background:light-dark(#dfdcd7,#393631)}"
html = (HERE/'index.html').read_text().split('<body>',1)[1].split('</body>',1)[0]
html = html.replace('src="assets/mark.png"','src="'+assets['assets/mark.png']+'"')
# The host provides the icon system. Keep authored vector paths in the standalone app only.
js = (HERE/'concepts.js').read_text()
start = js.index('  const shapes = {')
end = js.index('  const esc =',start)
icons={'home':'house','read':'align-left','watch':'monitor-play','bookmark':'bookmark','archive':'archive','rss':'rss','compass':'compass','highlight':'highlighter','folder':'folder','settings':'settings','sidebar':'panel-left','search':'search','plus':'plus','left':'chevron-left','right':'chevron-right','up':'chevron-up','down':'chevron-down','arrow':'arrow-right','arrowUp':'arrow-up','close':'x','check':'check','share':'share','focus':'minimize','expand':'maximize','list':'list','type':'type','external':'external-link','play':'play','pause':'pause','back10':'rotate-ccw','forward10':'rotate-cw','pip':'picture-in-picture-2','mini':'panel-bottom','sun':'sun','moon':'moon','info':'info','signal':'signal','wifi':'wifi','battery':'battery-full','clock':'clock','more':'ellipsis','refresh':'refresh-cw'}
js = js[:start] + '  const iconNames='+json.dumps(icons)+';\n  const icon=name=>`<i data-lucide="${iconNames[name]||\'align-left\'}" class="icon" aria-hidden="true"></i>`;\n  const ib=(name,label,action,cls=\'\')=>`<button class="icon-button ${cls} cursor-interaction" aria-label="${label}" title="${label}" data-action="${action}">${icon(name)}</button>`;\n' + js[end:]
js = js.replace("  const $ = (s, parent = document)","  const root = document.getElementById('stash-concepts');\n  const $ = (s, parent = root)")
js = js.replace('const $$ = (s, parent = document)','const $$ = (s, parent = root)')
js = js.replace("document.documentElement.classList",'root.classList').replace('document.body.classList','root.classList')
js = js.replace("document.addEventListener(","root.addEventListener(")
js = js.replace("history.replaceState(null,'',`#${name}`);",'persist();')
js = js.replace("  const params=new URLSearchParams(location.search);", "  const params=new URLSearchParams('');")
js = js.replace("const hash=location.hash.slice(1);", "const hash='';")
# Substitute assets at the points markup enters the document.
js = re.sub(r'app\.innerHTML=(.*);',r'app.innerHTML=withAssets(\1);',js)
js = re.sub(r'scrim\.innerHTML=(.*);',r'scrim.innerHTML=withAssets(\1);',js)
js = js.replace('panel.outerHTML=watchPanel()','panel.outerHTML=withAssets(watchPanel())')
js = js.replace("$('#search-results').innerHTML=searchResults(e.target.value)","$('#search-results').innerHTML=withAssets(searchResults(e.target.value))")
js = js.replace('updateProgress(); updateReview(); fit();','updateProgress(); updateReview(); fit(); refreshIcons();')
js = js.replace('app.append(el);if(undo)','app.append(el);refreshIcons();if(undo)')
js = js.replace('app.append(scrim);scrim.addEventListener','app.append(scrim);refreshIcons();scrim.addEventListener')
js = js.replace('setTime(state.time);}\n  function showSheet','setTime(state.time);refreshIcons();}\n  function showSheet')
js = js.replace('updateReview();\n  };','updateReview();refreshIcons();\n  };')
js = js.replace('  let state = defaults();', '''  let state = defaults();
+  const savedState=window.openai?.widgetState?.modelContent;
+  if(savedState){for(const key of ['concept','device','theme'])if(typeof savedState[key]==='string')state[key]=savedState[key];state.screen=copy[state.concept]?state.concept:'home';}
+  function persist(){window.openai?.setWidgetState?.({modelContent:{concept:state.concept,device:state.device,theme:state.theme},privateContent:null})?.catch(()=>{});}
+  root.addEventListener('click',e=>{if(e.target.closest('[data-device],#theme-toggle'))setTimeout(persist,0);});
+'''.replace('\n+','\n'))
# Avoid overriding unrelated host keyboard interactions.
js = js.replace("document.contains(submit)","root.contains(submit)")
js = js.replace("${a.image==='coast'?'Soft blue ocean waves in the evening light':a.image==='studio'?'An intimate recording studio with guitars and a mixing desk':'Architecture and the spaces around it'}", "${a.title}")
helper='  const inlineAssets='+json.dumps(assets,separators=(',',':'))+';\n  const withAssets=markup=>markup.replace(/assets\\/[a-z]+\\.(?:jpg|png)/g,path=>inlineAssets[path]||path);\n  const refreshIcons=()=>{root.querySelectorAll(\'button,a\').forEach(el=>el.classList.add(\'cursor-interaction\'));if(globalThis.lucide)lucide.createIcons({attrs:{width:19,height:19,class:\'icon\'}});};\n'
js=js.replace("  'use strict';","  'use strict';\n"+helper)
# All sources remain literal HTML/CSS/JS in the delivered fragment.
fragment='<div id="stash-concepts" aria-label="Stash interactive design concepts">\n<style>'+font_css+'\n@scope (#stash-concepts){'+css+'}\n</style>\n'+html+'\n</div>\n<script>\n'+js+'\n</script>\n'
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
OUTPUT.write_text(fragment)
print(OUTPUT)
print('Fragment bytes:',len(fragment.encode()))
if len(fragment.encode())>1000000:raise ValueError('Inline fragment exceeds 1 MB')
