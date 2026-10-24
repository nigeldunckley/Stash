const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('packages/appreader/src/index.jsx', 'utf8');
const bridge = source.slice(source.indexOf('const pendingRequests'), source.indexOf('const App ='));
const messages = [], timers = new Map(); let timerID = 0;
const window = {stashApp:true,webkit:{messageHandlers:{stashAction:{postMessage:message=>messages.push(message)}}}};
vm.runInNewContext(bridge + '\nwindow.testMutation = mutation;', {
  window, Date, Math, Map, Promise, Error,
  setTimeout:fn=>{timers.set(++timerID,fn);return timerID},
  clearTimeout:id=>timers.delete(id)
});
(async () => {
  const first = window.testMutation('createHighlight',{quote:'A saved sentence'});
  assert.equal(messages[0].documentID,window.stashDocumentID);
  window.stashReply(messages[0].requestId,{id:'highlight'});
  assert.equal((await first).id,'highlight');
  const failed = window.testMutation('articleReadingProgress',{id:'article'});
  const rejection = assert.rejects(failed,/Couldn't save/);
  window.stashReply(messages[1].requestId,null,"Couldn't save your changes. Try again.");
  await rejection;
  const timeout = window.testMutation('createHighlight',{});
  const timedOut = assert.rejects(timeout,/Couldn't save/);
  [...timers.values()][0](); await timedOut;
  window.stashReply(999,{});
  console.log('PASS: native reader replies, document correlation, failure rejection and timeout');

  // Exercise the production progress effect before WebKit can convert its values to NSNumber.
  const article = fs.readFileSync('packages/web/components/templates/article/Article.tsx', 'utf8');
  const progressEffect = article.slice(article.indexOf(';(async () => {'), article.indexOf('// We don\'t react to changes to readingAnchorIndex'));
  for (const anchor of [undefined, 'NaN', 'Infinity', '-1', '1.5', '12', '0']) {
    let saved;
    await vm.runInNewContext(progressEffect, {
      readingProgress: 100,
      articleContentRef: {current: {}},
      window: {scrollY: 930, document: {scrollingElement: {scrollHeight: 1000}}},
      getTopOmnivoreAnchorElement: () => anchor,
      clampToPercent: value => Math.floor(Math.max(0, Math.min(100, value))),
      props: {articleId: 'article', articleMutations: {articleReadingProgressMutation: input => { saved = input; }}},
    });
    assert.equal(saved.id, 'article');
    assert.equal(saved.readingProgressPercent, 100);
    assert.equal(saved.readingProgressTopPercent, 93);
    if (anchor === '12' || anchor === '0') assert.equal(saved.readingProgressAnchorIndex, Number(anchor));
    else assert.equal(Object.hasOwn(saved, 'readingProgressAnchorIndex'), false, `Invalid anchor ${anchor} must be omitted`);
  }
  console.log('PASS: missing and invalid reader anchors are omitted while valid progress and anchors are preserved');
})().catch(error=>{console.error(error);process.exitCode=1});
