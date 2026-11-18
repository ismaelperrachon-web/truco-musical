import test from 'node:test';
import assert from 'node:assert/strict';

function audioHarness(t, deferred=false) {
  const previous=globalThis.window, gains=[], sources=[];
  let ctx, resolveResume;
  class Param {
    value=0;
    setValueAtTime(value){this.value=value;}
    exponentialRampToValueAtTime(value){this.value=value;}
    setTargetAtTime(value){this.value=value;}
  }
  class Node {
    gain=new Param();frequency=new Param();disconnected=false;
    connect(){} disconnect(){this.disconnected=true;}
    start(at){assert.ok(Number.isFinite(at));this.started=at;}
    stop(at){assert.ok(Number.isFinite(at));this.stopped=at;}
  }
  class Context {
    currentTime=0;sampleRate=8000;state='suspended';destination={};
    constructor(){ctx=this;}
    createGain(){const node=new Node();gains.push(node);return node;}
    createBiquadFilter(){return new Node();}
    createOscillator(){const node=new Node();sources.push(node);return node;}
    createBufferSource(){const node=new Node();sources.push(node);return node;}
    createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
    resume(){if(deferred)return new Promise(resolve=>{resolveResume=()=>{this.state='running';resolve();};});this.state='running';return Promise.resolve();}
  }
  globalThis.window={AudioContext:Context};
  t.after(()=>{globalThis.window=previous;});
  return {gains,sources,getContext:()=>ctx,resolve:()=>resolveResume()};
}

test('música y efectos tienen volúmenes independientes; apagar cumbia conserva el sonido de carta', async t=>{
  const harness=audioHarness(t), audio=await import('../src/sound.js?independent');
  t.after(()=>audio.setMusic(false));
  assert.equal(await audio.setMusic(true),true);
  const [effects,music]=harness.gains;
  assert.equal(music.gain.value,.3);
  audio.setSound(false);assert.equal(effects.gain.value,0);assert.equal(music.gain.value,.3);
  audio.setMusicVolume(5);assert.equal(music.gain.value,1);assert.equal(effects.gain.value,0);
  audio.setMusicVolume(-3);assert.equal(music.gain.value,0);
  audio.setMusicVolume(.2);assert.equal(music.gain.value,.2);
  audio.setSound(true);assert.equal(effects.gain.value,.7);
  const before=harness.sources.length;audio.sound('card');assert.equal(harness.sources.length-before,3);
  await audio.setMusic(false);assert.equal(music.gain.value,0);assert.equal(effects.gain.value,.7);
  const after=harness.sources.length;audio.sound('card');assert.equal(harness.sources.length-after,3);
  assert.equal(harness.getContext().state,'running');
  for(const source of harness.sources) { source.onended();assert.equal(source.disconnected,true); }
});

test('apagar música mientras se desbloquea el audio evita iniciar una pista atrasada', async t=>{
  const harness=audioHarness(t,true), audio=await import('../src/sound.js?race');
  t.after(()=>audio.setMusic(false));
  const enabling=audio.setMusic(true);await audio.setMusic(false);harness.resolve();
  assert.equal(await enabling,false);assert.equal(harness.sources.length,0);
});
