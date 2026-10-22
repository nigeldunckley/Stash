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
})().catch(error=>{console.error(error);process.exitCode=1});
