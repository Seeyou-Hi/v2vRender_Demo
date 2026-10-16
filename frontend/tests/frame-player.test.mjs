import test from 'node:test';
import assert from 'node:assert/strict';
import {FramePlayer} from '../dist/frame-player.js';
import {streamComparison} from '../dist/stream-comparison.js';

test('parallel image downloads preserve frame order and finish without debug inputs', async t => {
 t.mock.method(globalThis,'fetch',async url=>{await new Promise(r=>setTimeout(r,url.endsWith('0.jpg')?40:1));return {ok:true,blob:async()=>url};});
 const closed=[];globalThis.createImageBitmap=async blob=>({blob,close(){closed.push(blob);}});
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.document={hidden:false,getElementById:()=>null};
 streamComparison.reset('depth');assert.equal(streamComparison.full,false);
 for(let i=0;i<100;i++)streamComparison.add(i,[],[],{});
 assert.equal(streamComparison.frames.size,0);
 let requests=0,completed;const done=new Promise(r=>completed=r);
 const canvas={dataset:{},getContext:()=>({clearRect(){},drawImage(){}})};
 const player=new FramePlayer(canvas,'/api','test',async()=>{requests++;return {fps:5,available_frames:3,status:'completed',frames:[0,1,2].map(index=>({index,url:`/streams/test/frames/${index}.jpg`}))};},e=>{throw e;});
 for(let i=0;i<100&&!player.finished;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(requests,1);assert.deepEqual(player.queue.map(f=>f.index),[0,1,2]);
 player.tick(0);player.tick(200);player.tick(400);assert.equal(player.played,3);assert.equal(closed.length,3);
 player.stop();
});

test('playback maintains 5 FPS on a 59 Hz browser without accumulating drift', async () => {
 const player=Object.create(FramePlayer.prototype);
 Object.assign(player,{queue:Array.from({length:600},(_,index)=>({index,bitmap:{close(){}}})),fps:5,nextDraw:null,canvas:{dataset:{}},context:{drawImage(){}},tick(){},stopped:false});
 for(let i=0;i<59*60;i++)FramePlayer.prototype.tick.call(player,i*1000/59);
 assert.ok(player.played>=299 && player.played<=301,`played ${player.played} in 60 seconds`);
});

test('a slow later download does not block an already decoded first frame', async t => {
 let release;const delayed=new Promise(r=>release=r);
 t.mock.method(globalThis,'fetch',async url=>{if(url.endsWith('2.jpg'))await delayed;return {ok:true,blob:async()=>url};});
 globalThis.createImageBitmap=async()=>({close(){}});
 const player=new FramePlayer({dataset:{},getContext:()=>({clearRect(){},drawImage(){}})},'/api','test',async()=>({fps:5,status:'completed',available_frames:3,frames:[0,1,2].map(index=>({index,url:`/streams/test/frames/${index}.jpg`}))}),e=>{throw e;});
 await new Promise(r=>setTimeout(r,10));assert.deepEqual(player.queue.map(f=>f.index),[0,1]);
 release();await new Promise(r=>setTimeout(r,10));assert.deepEqual(player.queue.map(f=>f.index),[0,1,2]);player.stop();
});
