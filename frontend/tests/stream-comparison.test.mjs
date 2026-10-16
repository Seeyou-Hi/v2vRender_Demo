import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamComparison } from '../dist/stream-comparison.js';
test('matching output paints exact captured pixels, frees old frames and bounds pending inputs',()=>{
 const elements=new Map();globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',getContext(){return {clearRect(){},putImageData:data=>{this.image=data;}};}});return elements.get(id);}};
 globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 const c=new StreamComparison();c.limit=2;c.reset('depth');
 const rgb=new Uint8Array([10,20,30,255]),depth=new Uint8Array([42,42,42,255]);
 c.add(0,rgb,depth,{frame:0});rgb[0]=99;c.add(1,rgb,depth,{frame:1});
 assert.equal(c.full,true);assert.throws(()=>c.add(2,rgb,depth,{}),/已满/);
 c.draw(0);assert.equal(elements.get('stream-source').image.data[0],10);
 assert.equal(elements.get('stream-control').image.data[0],42);
 assert.equal(elements.get('stream-control').dataset.frameIndex,'0');assert.equal(c.full,false);
 c.draw(1);assert.equal(elements.get('stream-source').image.data[0],99);assert.equal(c.frames.size,0);
 assert.deepEqual(c.lastCamera,{frame:1});assert.throws(()=>c.draw(2),/缺少/);
 c.reset('canny');assert.equal(c.played,-1);assert.match(elements.get('stream-control-title').textContent,/后端转 Canny/);
});

test('upload release keeps latest previews, tolerates delayed output, and supports long streams',()=>{
 const elements=new Map();globalThis.document={getElementById(id){if(!elements.has(id))elements.set(id,{dataset:{},textContent:'',getContext(){return {clearRect(){},putImageData:data=>{this.image=data;}};}});return elements.get(id);}};
 globalThis.ImageData=class{constructor(data,width,height){Object.assign(this,{data,width,height});}};
 const c=new StreamComparison();c.reset('depth',true);
 const pixels=new Uint8Array([42,42,42,255]);
 // Upload hundreds of frames without any output playback; the cache must drain.
 for(let i=0;i<240;i++){
  c.add(i,pixels,pixels,{frame:i});assert.equal(c.full,false);
  if(i===8||i>8&&(i-8)%12===0)c.releaseUploaded(i);
 }
 c.releaseUploaded(239);assert.equal(c.frames.size,0);
 assert.equal(elements.get('stream-source').dataset.frameIndex,'239');
 assert.doesNotThrow(()=>c.draw(0));
 assert.equal(elements.get('stream-source').dataset.frameIndex,'239');
 assert.match(elements.get('stream-comparison-status').textContent,/非同帧对照/);
 c.reset('depth');c.add(0,pixels,pixels,{});c.releaseUploaded(0);
 assert.equal(c.frames.size,1);c.draw(0);assert.equal(c.frames.size,0);
});
