const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('native/Stash/Watch/PlayerController.swift', 'utf8');
const script = source.slice(source.indexOf("const ORIGIN ="), source.indexOf('</script>', source.indexOf("const ORIGIN =")))
  .replaceAll('\\(origin)', 'https://www.youtube-nocookie.com')
  .replaceAll('\\(videoID)', 'first-video');
const commands = [], messages = [], listeners = {};
const frame = {contentWindow: {postMessage: (message) => commands.push(JSON.parse(message))}, addEventListener() {}};
const window = {
  webkit: {messageHandlers: {player: {postMessage: message => messages.push(message)}}},
  addEventListener: (event, callback) => { listeners[event] = callback; },
};
vm.runInNewContext(script, {window, document: {getElementById: () => frame}, setInterval() {}, clearInterval() {}});
const deliver = data => listeners.message({origin: 'https://www.youtube-nocookie.com', source: frame.contentWindow, data});
const resets = () => commands.filter(command => command.func === 'unloadModule').length;
deliver({event: 'onReady'});
assert.equal(resets(), 1);
assert.equal(commands[0].args[0], 'captions');
deliver({event: 'initialDelivery', info: {videoData: {video_id: 'first-video'}, playerState: 1}});
assert.equal(resets(), 2, 'Reset once playback is ready, after YouTube has applied its saved preferences');
// A viewer can enable CC: progress updates and pause/resume must not reset it again.
deliver({event: 'infoDelivery', info: {playerState: 2, currentTime: 5}});
deliver({event: 'infoDelivery', info: {playerState: 1, currentTime: 8}});
assert.equal(resets(), 2);
window.stashPlayer.command('seekTo', [30, true]);
deliver({event: 'infoDelivery', info: {playerState: 1, currentTime: 30}});
assert.equal(resets(), 2);
window.stashPlayer.command('loadVideoById', [{videoId: 'next-video', startSeconds: 10}]);
assert.equal(resets(), 3, 'Clear the previous video caption selection before loading the next');
deliver({event: 'infoDelivery', info: {playerState: 1}});
assert.equal(resets(), 3, 'Late messages from the previous video must not consume the new default');
deliver({event: 'infoDelivery', info: {videoData: {video_id: 'next-video'}, playerState: 1}});
assert.equal(resets(), 4);
deliver({event: 'infoDelivery', info: {playerState: 1, currentTime: 11}});
assert.equal(resets(), 4);
assert.ok(messages.some(message => message.event === 'ready'));
assert.ok(messages.some(message => message.event === 'info' && message.time === 11));
console.log('PASS: Watch resets captions for new videos while preserving manual CC, seeking and pause/resume');
