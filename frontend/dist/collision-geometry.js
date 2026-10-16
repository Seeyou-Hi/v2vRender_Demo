import * as T from './vendor/three.module.js';
import {OBB} from './vendor/OBB.js';
const cache=new WeakMap();
function treeFor(geometry){
 if(cache.has(geometry))return cache.get(geometry);
 const p=geometry.attributes.position,index=geometry.index,triangles=[];
 for(let i=0;i<(index?index.count:p.count);i+=3){const t=[];for(let j=0;j<3;j++)t.push(new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j));triangles.push({v:t,box:new T.Box3().setFromPoints(t),center:t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1/3)});}
 const build=list=>{const box=new T.Box3();list.forEach(t=>box.union(t.box));if(list.length<=16)return {box,list};const size=box.getSize(new T.Vector3()),axis=size.x>size.y?(size.x>size.z?'x':'z'):(size.y>size.z?'y':'z');list.sort((a,b)=>a.center[axis]-b.center[axis]);const mid=list.length>>1;return {box,left:build(list.slice(0,mid)),right:build(list.slice(mid))};};
 const tree=build(triangles);cache.set(geometry,tree);return tree;
}
// OBBs remain the cheap broad phase. For grippers only, verify the real STL
// surface against the other object's collision volume, including containment.
export function preciseMeshBoxOverlap(mesh,worldBox){
 const tree=treeFor(mesh.geometry),inverse=mesh.matrixWorld.clone().invert(),query=worldBox.clone().applyMatrix4(inverse);query.center.copy(worldBox.center).applyMatrix4(inverse);
 const rotation=new T.Matrix4().setFromMatrix3(worldBox.rotation),worldToBox=rotation.clone().transpose();worldToBox.setPosition(worldBox.center.clone().applyMatrix4(worldToBox).negate());
 const transform=worldToBox.multiply(mesh.matrixWorld),half=worldBox.halfSize,box=new T.Box3(half.clone().negate(),half.clone()),triangle=new T.Triangle();
 const visit=node=>{if(!query.intersectsBox3(node.box))return false;if(node.list){for(const t of node.list){triangle.set(...t.v.map(v=>v.clone().applyMatrix4(transform)));if(box.intersectsTriangle(triangle))return true;}return false;}return visit(node.left)||visit(node.right);};
 if(visit(tree))return true;
 // A small solid can be wholly inside the palm without crossing a triangle.
 const ray=new T.Ray(query.center,new T.Vector3(1,.3713907,.1299703).normalize()),hits=[],point=new T.Vector3();
 const inside=node=>{if(!ray.intersectsBox(node.box))return;if(node.list){for(const t of node.list)if(ray.intersectTriangle(...t.v,false,point)){const d=point.distanceToSquared(ray.origin);if(d>1e-16&&!hits.some(x=>Math.abs(x-d)<1e-12))hits.push(d);}}else{inside(node.left);inside(node.right);}};
 inside(tree);return hits.length%2===1;
}
// Both curved original objects and gripper parts can request a surface-to-
// surface test. This avoids treating the corners of a fruit's box as fruit.
function triangleOverlap(a,b){
 const ea=[a[1].clone().sub(a[0]),a[2].clone().sub(a[1]),a[0].clone().sub(a[2])],eb=[b[1].clone().sub(b[0]),b[2].clone().sub(b[1]),b[0].clone().sub(b[2])],na=ea[0].clone().cross(ea[1]),nb=eb[0].clone().cross(eb[1]),axes=[na,nb];
 ea.forEach(x=>eb.forEach(y=>axes.push(x.clone().cross(y))));ea.forEach(x=>axes.push(na.clone().cross(x)));eb.forEach(x=>axes.push(nb.clone().cross(x)));
 for(const axis of axes){if(axis.lengthSq()<1e-24)continue;axis.normalize();const pa=a.map(v=>v.dot(axis)),pb=b.map(v=>v.dot(axis));if(Math.max(...pa)<Math.min(...pb)-1e-9||Math.max(...pb)<Math.min(...pa)-1e-9)return false;}return true;
}
function pointInside(tree,origin){const ray=new T.Ray(origin,new T.Vector3(1,.3713907,.1299703).normalize()),point=new T.Vector3(),hits=[];const visit=node=>{if(!ray.intersectsBox(node.box))return;if(node.list){for(const t of node.list)if(ray.intersectTriangle(...t.v,false,point)){const d=point.distanceToSquared(origin);if(d>1e-16&&!hits.some(x=>Math.abs(x-d)<1e-12))hits.push(d);}}else{visit(node.left);visit(node.right);}};visit(tree);return hits.length%2===1;}
export function preciseMeshesOverlap(a,b){
 const ta=treeFor(a.geometry),tb=treeFor(b.geometry),transform=a.matrixWorld.clone().invert().multiply(b.matrixWorld),boxes=new Map(),triangles=new Map();
 const bBox=node=>{if(!boxes.has(node)){const local=new OBB().fromBox3(node.box),box=local.clone().applyMatrix4(transform);box.center.copy(local.center).applyMatrix4(transform);boxes.set(node,box);}return boxes.get(node);};
 const visit=(one,two)=>{if(!bBox(two).intersectsBox3(one.box))return false;if(one.list&&two.list){for(const y of two.list){if(!triangles.has(y)){const v=y.v.map(p=>p.clone().applyMatrix4(transform));triangles.set(y,{v,box:new T.Box3().setFromPoints(v)});}const t=triangles.get(y);for(const x of one.list)if(x.box.intersectsBox(t.box)&&triangleOverlap(x.v,t.v))return true;}return false;}if(one.list)return visit(one,two.left)||visit(one,two.right);if(two.list)return visit(one.left,two)||visit(one.right,two);return visit(one.left,two.left)||visit(one.left,two.right)||visit(one.right,two.left)||visit(one.right,two.right);};
 if(visit(ta,tb))return true;
 const vertex=tree=>{while(!tree.list)tree=tree.left;return tree.list[0].v[0].clone();};
 return pointInside(ta,vertex(tb).applyMatrix4(transform))||pointInside(tb,vertex(ta).applyMatrix4(transform.clone().invert()));
}

// Exact triangle clipping against a convex contact prism, with the gripper BVH
// as broad phase. Avoid pairwise triangle traversal for every thin asset layer.
export function preciseMeshPrismOverlap(mesh,prism){
 const {polygon,lo,hi}=prism.geometry.userData.contactPrism,tree=treeFor(mesh.geometry),toPrism=prism.matrixWorld.clone().invert().multiply(mesh.matrixWorld),toMesh=toPrism.clone().invert(),local=new OBB().fromBox3(prism.geometry.boundingBox),query=local.clone().applyMatrix4(toMesh);query.center.copy(local.center).applyMatrix4(toMesh);
 const planes=[[0,1,0,-lo],[0,-1,0,hi]];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1];planes.push([-dz,0,dx,dz*a[0]-dx*a[1]]);}
 const triangleFits=vertices=>{let poly=vertices.map(v=>v.clone().applyMatrix4(toPrism));for(const [x,y,z,w] of planes){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=x*a.x+y*a.y+z*a.z+w,db=x*b.x+y*b.y+z*b.z+w;if(da>=-1e-10)out.push(a);if(da*db<0)out.push(a.clone().lerp(b,da/(da-db)));}if(!out.length)return false;poly=out;}return true;};
 const visit=node=>{if(!query.intersectsBox3(node.box))return false;if(node.list)return node.list.some(t=>triangleFits(t.v));return visit(node.left)||visit(node.right);};
 if(visit(tree))return true;
 const center=new T.Vector3(polygon.reduce((s,p)=>s+p[0],0)/polygon.length,(lo+hi)/2,polygon.reduce((s,p)=>s+p[1],0)/polygon.length).applyMatrix4(toMesh);return pointInside(tree,center);
}
