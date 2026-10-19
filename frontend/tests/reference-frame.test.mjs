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
