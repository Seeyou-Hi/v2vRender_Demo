import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReferenceImage} from '../dist/reference-frame.js';
import {makeCaptureCamera} from '../dist/data-capture.js';
import * as T from '../dist/vendor/three.module.js';

test('reference and native depth use identical normalized ext1 projection',()=>{
 const source=makeCaptureCamera('ext1',1280,768);
 const depth=makeCaptureCamera('ext1',640,384);
 assert.deepEqual(source.position.toArray(),depth.position.toArray());
 assert.deepEqual(source.projectionMatrix.elements,depth.projectionMatrix.elements);
 for(const point of [[0,0,0],[-1,1,.5],[1,.4,-1]]){
  assert.deepEqual(new T.Vector3(...point).project(source).toArray(),new T.Vector3(...point).project(depth).toArray());
 }
});

test('reference aspect validation prevents accidental stretching or cropping',()=>{
 for(const [w,h]of [[640,384],[1280,768],[2560,1536]])validateReferenceImage(w,h);
 for(const [w,h]of [[1280,720],[1024,1024],[1536,1024],[0,0]])assert.throws(()=>validateReferenceImage(w,h),/5:3/);
});

test('preset button loads the server image and starts with reference enabled',async t=>{
 const {installReferenceFrame}=await import('../dist/reference-frame.js');
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,checked:false,value:'',hidden:true});return nodes.get(id);};
 t.mock.method(globalThis,'fetch',async url=>{assert.match(String(url),/references\/ext1-reference-photoreal.png$/);return new Response(new Blob(['image'],{type:'image/png'}));});
 const previousBitmap=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>{};t.after(()=>{if(previousBitmap)globalThis.createImageBitmap=previousBitmap;else delete globalThis.createImageBitmap;});
 t.mock.method(globalThis,'createImageBitmap',async()=>({width:1619,height:971,close(){}}));
 const previous=globalThis.document;globalThis.document={getElementById:get};t.after(()=>globalThis.document=previous);
 let file,started=0,busy=false;
 get('stream-start').onclick=async()=>{assert.equal(file.name,'ext1-reference-photoreal.png');assert.equal(get('backend-reference-enabled').checked,true);assert.equal(get('reference-stream-start').disabled,false);busy=true;get('reference-stream-start').disabled=true;started++;};
 installReferenceFrame({canStart:()=>true,backend:{isBusy:()=>busy,setReference:f=>file=f,settings:()=>({referenceFile:file})}});
 await get('reference-stream-start').onclick();assert.equal(started,1);assert.equal(get('reference-stream-start').disabled,true);assert.equal(get('reference-preview').hidden,false);
});
