import * as T from './vendor/three.module.js';
import {GPUStreamResolver} from './gpu-frame-resolver.js';
// Geometry and object transforms are owned by the simulator. This pass only
// swaps their presentation synchronously and restores everything before yielding.
const controllers=new WeakMap();
const basic=color=>new T.MeshBasicMaterial({color,side:T.DoubleSide,toneMapped:false,fog:false});
function cluster(g){
 const q=g.index?g.toNonIndexed():g.clone(),p=q.attributes.position,b=new T.Box3().setFromBufferAttribute(p),v=b.getSize(new T.Vector3()),step=Math.max(v.x,v.y,v.z)/32;
 if(!step){q.dispose();return g.clone();}const vertices=[],index=[],map=new Map();
 for(let i=0;i<p.count;i++){const a=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x/step)*step),k=a.join(',');if(!map.has(k)){map.set(k,vertices.length/3);vertices.push(...a);}index.push(map.get(k));}
 const indices=[],z=new T.BufferGeometry();for(const group of q.groups.length?q.groups:[{start:0,count:index.length,materialIndex:0}]){const start=indices.length;for(let i=group.start;i+2<group.start+group.count;i+=3)if(index[i]!==index[i+1]&&index[i+1]!==index[i+2]&&index[i]!==index[i+2])indices.push(index[i],index[i+1],index[i+2]);z.addGroup(start,indices.length-start,group.materialIndex);}
 z.setAttribute('position',new T.Float32BufferAttribute(vertices,3));z.setIndex(indices);z.computeVertexNormals();q.dispose();return z;
}
function outlined(mesh){const e=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,35),new T.LineBasicMaterial({color:'#17191c',toneMapped:false}));e.userData.mg4Owned=true;mesh.add(e);return e;}
function semanticObject(item){
 const p=item.mesh.geometry?.parameters;if(!p?.height)return null;
 const root=new T.Group();root.userData.mg4Owned=true;root.visible=false;
 const H=p.height,R=Math.min(p.width,p.depth)/2;
 const cylinder=(rt,rb,h,y,color)=>{const m=new T.Mesh(new T.CylinderGeometry(rt,rb,h,12),basic(color));m.position.y=y;m.userData.mg4Owned=true;root.add(m);outlined(m);return m;};
 if(item.kind==='cans'){
  cylinder(R,R,H*.90,0,'#bb3028');cylinder(R*1.015,R*1.015,H*.045,H*.475,'#b9c3ca');cylinder(R*1.015,R*1.015,H*.045,-H*.475,'#9ca8b0');
  cylinder(R*1.006,R*1.006,H*.30,0,'#d7b66b');
  const tab=new T.Mesh(new T.BoxGeometry(R*.58,H*.025,R*.22),basic('#53616a'));tab.position.set(0,H*.502,0);tab.userData.mg4Owned=true;root.add(tab);
 }else if(item.kind==='bottles'){
  cylinder(R,R*.90,H*.59,-H*.195,'#91aaa7');cylinder(R*.36,R,H*.18,H*.19,'#b7c5bf');cylinder(R*.36,R*.36,H*.12,H*.34,'#b7c5bf');cylinder(R*.46,R*.46,H*.10,H*.45,'#b62925');
  cylinder(R*1.004,R*1.004,H*.25,-H*.10,'#bb3028');cylinder(R*1.007,R*1.007,H*.07,-H*.10,'#dbc491');
 }else return null;
 item.mesh.add(root);return root;
}
export function getMG4Proxy(scene,arms,items){
 if(controllers.has(scene))return controllers.get(scene);
 const cache=new WeakMap(),objectCache=new WeakMap(),owned=new Set(),ownMaterials=new WeakMap(),edges=new Set();
 function prepare(){
  const robot=new Set(),gripper=new Set(),objects=new Set();arms.forEach(a=>{a.root.traverse(n=>robot.add(n));a.gripper.root.traverse(n=>gripper.add(n));});
  for(const item of items){if(!objectCache.has(item.mesh)){const root=semanticObject(item);objectCache.set(item.mesh,root);if(root){owned.add(root);root.traverse(n=>{owned.add(n);if(n.material)ownMaterials.set(n,n.material);});}}item.mesh.traverse(n=>objects.add(n));}
  const nodes=[];scene.traverse(n=>nodes.push(n));
  for(const n of nodes){if(!n.isMesh||owned.has(n)||cache.has(n))continue;const mats=Array.isArray(n.material)?n.material:[n.material];if(!mats.some(m=>m?.visible))continue;
   let geometry=n.geometry;if(robot.has(n)&&!gripper.has(n))geometry=cluster(geometry);
   const mapped=mats.map(m=>basic(objects.has(n)?(m.color||'#ba3028'):robot.has(n)?(/blau/i.test(m.name)?'#658ba3':/Rohr/i.test(m.name)?'#a5adb3':/Scheibe|verbindung|SWMaterial/i.test(m.name)?'#252b32':m.color||'#a5adb3'):m.transparent?m.color:(n.geometry.parameters?.width>20?'#34383d':'#b5a392')));
   const edge=new T.LineSegments(new T.EdgesGeometry(geometry,gripper.has(n)?85:60),new T.LineBasicMaterial({color:'#17191c',toneMapped:false}));edge.visible=false;edge.userData.mg4Owned=true;n.add(edge);edges.add(edge);owned.add(edge);
   cache.set(n,{geometry,material:Array.isArray(n.material)?mapped:mapped[0],edge});
  }
 }
 function render(renderer,camera,target=null){
  prepare();const saved=[],old={target:renderer.getRenderTarget(),tone:renderer.toneMapping,color:renderer.outputColorSpace,shadow:renderer.shadowMap.enabled,bg:scene.background,fog:scene.fog,clear:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha()};
  scene.traverse(n=>{saved.push([n,n.visible,n.material,n.geometry]);if(n.isLine||n.isPoints||n.isSprite||n.userData.demoDecoration||arms.some(a=>n===a.ring))n.visible=false;if(ownMaterials.has(n))n.material=ownMaterials.get(n);const c=cache.get(n);if(c){n.material=c.material;n.geometry=c.geometry;}});
  try{
   for(const item of items){const proxy=objectCache.get(item.mesh);if(proxy){for(const child of item.mesh.children)child.visible=child===proxy;proxy.traverse(n=>n.visible=true);}}
   for(const edge of edges)edge.visible=true;
   renderer.shadowMap.enabled=false;renderer.toneMapping=T.NoToneMapping;renderer.outputColorSpace=T.SRGBColorSpace;scene.background=new T.Color('#000000');scene.fog=null;
   scene.updateMatrixWorld(true);renderer.setRenderTarget(target);renderer.render(scene,camera);
  }finally{for(const [n,visible,material,geometry]of saved){n.visible=visible;if(material)n.material=material;if(geometry)n.geometry=geometry;}scene.background=old.bg;scene.fog=old.fog;renderer.toneMapping=old.tone;renderer.outputColorSpace=old.color;renderer.shadowMap.enabled=old.shadow;renderer.setClearColor(old.clear,old.alpha);renderer.setRenderTarget(old.target);}
 }
 const resources=new Map();
 function capture(renderer,camera,width,height,rect=null){
  const key=width+'x'+height;let r=resources.get(key);if(!r){const target=new T.WebGLRenderTarget(width*2,height*2,{depthBuffer:true});target.texture.colorSpace=T.SRGBColorSpace;r={target,resolver:new GPUStreamResolver(width,height)};resources.set(key,r);}
  r.target.viewport.set(0,0,width*2,height*2);r.target.scissorTest=false;
  if(rect){r.target.viewport.set(rect.x*2,rect.y*2,rect.width*2,rect.height*2);r.target.scissor.copy(r.target.viewport);r.target.scissorTest=true;}
  render(renderer,camera,r.target);r.target.scissorTest=false;const old={target:renderer.getRenderTarget(),color:renderer.outputColorSpace,tone:renderer.toneMapping};try{renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NoToneMapping;return r.resolver.queue(renderer,r.target,r.target,false).then(x=>x.rgb);}finally{renderer.setRenderTarget(old.target);renderer.outputColorSpace=old.color;renderer.toneMapping=old.tone;}
 }
 const controller={render,capture,format:{version:1,channels:'RGB sRGB',width:864,height:480,proxy:'unlit 3D with black feature outlines; 12-sided cans/bottles and semantic subpart colors; exact simulator object root transforms',model_input:'864x480; first frame then chunks of four; reference is a separate initial image'}};controllers.set(scene,controller);return controller;
}
