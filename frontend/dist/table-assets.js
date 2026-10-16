import {layeredContactGeometry} from './contact-geometry.js';
import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
const catalog={apples:{folder:'035_apple',width:.19},bottles:{folder:'001_bottle',width:.205,height:.64},cans:{folder:'071_can',width:.19,height:.38}};
const cache=new Map();
export async function loadTableAssets(kind,loader=new GLTFLoader()){
 const types=kind==='mixed'?['apples']:kind==='drinks'?['bottles','cans']:[kind];
 await Promise.all(types.filter(type=>catalog[type]).flatMap(type=>[0,1].map(async index=>{
  const key=type+index;if(cache.has(key)){await cache.get(key);return;}
  const pending=loader.loadAsync(new URL(`./models/robotwin/${catalog[type].folder}/visual/base${index}-web.glb`,import.meta.url).href).then(gltf=>prepareTableAsset(gltf.scene,type));
  cache.set(key,pending);try{cache.set(key,await pending);}catch(e){cache.delete(key);throw e;}
 })));
}
export function prepareTableAsset(scene,type){
 const group=new T.Group();group.add(scene);
 let bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3());
 group.scale.setScalar(Math.min(catalog[type].width/Math.max(size.x,size.z),(catalog[type].height||Infinity)/size.y));group.updateWorldMatrix(true,true);
 bounds=new T.Box3().setFromObject(group);group.position.sub(bounds.getCenter(new T.Vector3()));group.updateWorldMatrix(true,true);
 const points=[],point=new T.Vector3();group.traverse(node=>{if(!node.isMesh)return;node.castShadow=node.receiveShadow=true;node.userData.collisionSkip=true;node.userData.assetShared=true;
  const attr=node.geometry.attributes.position;for(let i=0;i<attr.count;i++)points.push(point.fromBufferAttribute(attr,i).applyMatrix4(node.matrixWorld).clone());
 });
 bounds=new T.Box3().setFromPoints(points);size=bounds.getSize(new T.Vector3());
 return {group,size,contactGeometries:layeredContactGeometry(points,bounds)};
}
export function createAssetModel(type,index){
 const entry=cache.get(type+index);if(!entry||entry.then)return null;
 const group=new T.Group();group.add(entry.group.clone(true));
 const hidden=new T.MeshBasicMaterial({visible:false});
 for(const geometry of entry.contactGeometries){const mesh=new T.Mesh(geometry,hidden);mesh.userData.contactSurface=true;mesh.userData.collisionPrecise=true;mesh.userData.assetShared=true;group.add(mesh);}
 return group;
}
export function hasTableAsset(type){return !!catalog[type];}
