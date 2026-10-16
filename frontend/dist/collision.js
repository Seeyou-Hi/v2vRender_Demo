import {updateGripper,applyAngles} from './robot-model.js';
import {contactMeshes} from './contact-geometry.js';
import {inspectGraspGeometry} from './grasp-geometry.js';
import * as T from './vendor/three.module.js';
import {OBB} from './vendor/OBB.js';
import {preciseMeshBoxOverlap,preciseMeshesOverlap,preciseMeshPrismOverlap} from './collision-geometry.js';
import {bindGrasp} from './grasp-geometry.js';
const margin=.00001;
function shape(mesh,label,link=-1,compound=false){
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  const box=mesh.geometry.boundingBox;
  const children=compound?contactMeshes(mesh).map(node=>shape(node,label)):[];
  return {mesh,label,link,children,local:new OBB(box.getCenter(new T.Vector3()),box.getSize(new T.Vector3()).multiplyScalar(.5)),world:new OBB()};
}
function update(s){s.world.copy(s.local).applyMatrix4(s.mesh.matrixWorld);s.world.center.copy(s.local.center).applyMatrix4(s.mesh.matrixWorld);s.children?.forEach(update);return s;}
export function shapesOverlap(a,b){
 if(!a.world.intersectsOBB(b.world,1e-8))return false;
 const one=a.children?.length?a.children:[a],two=b.children?.length?b.children:[b];
 return one.some(x=>two.some(y=>{
  if(!x.world.intersectsOBB(y.world,1e-8))return false;
  if(x.mesh.userData.collisionPrecise&&y.mesh.geometry.userData.contactPrism&&!x.mesh.geometry.userData.contactPrism)return preciseMeshPrismOverlap(x.mesh,y.mesh);
  if(y.mesh.userData.collisionPrecise&&x.mesh.geometry.userData.contactPrism&&!y.mesh.geometry.userData.contactPrism)return preciseMeshPrismOverlap(y.mesh,x.mesh);
  if(x.mesh.userData.collisionPrecise&&y.mesh.userData.collisionPrecise)return preciseMeshesOverlap(x.mesh,y.mesh);
  if(x.mesh.userData.collisionPrecise)return preciseMeshBoxOverlap(x.mesh,y.world);
  if(y.mesh.userData.collisionPrecise)return preciseMeshBoxOverlap(y.mesh,x.world);
  return true;
 }));
}
const overlap=shapesOverlap;
export function followHeld(a){
  if(!a.held)return;
  if(a.grasp?.item!==a.held||!a.grasp.position)a.grasp=bindGrasp(a,a.held,a.gripper?.opening??0);
  {
    a.hand.updateWorldMatrix(true,false);
    const position=a.hand.localToWorld(a.grasp.position.clone()),quaternion=a.hand.getWorldQuaternion(new T.Quaternion()).multiply(a.grasp.quaternion);
    if(a.held.mesh.parent){a.held.mesh.parent.updateWorldMatrix(true,false);a.held.mesh.parent.worldToLocal(position);quaternion.premultiply(a.held.mesh.parent.getWorldQuaternion(new T.Quaternion()).invert());}
    a.held.mesh.position.copy(position);a.held.mesh.quaternion.copy(quaternion);a.held.mesh.updateWorldMatrix(true,false);return;
  }
}
export class CollisionWorld{
  constructor(arms,blocks,solids){
    this.arms=arms;this.blocks=blocks;
    this.static=solids.map(m=>shape(m,m.userData.collisionLabel||'工作台'));
    this.objects=new Map(blocks.map((b,i)=>[b,shape(b.mesh,b.label||((i?'蓝色':'橙色')+'物块'),-1,true)]));
    this.parts=new Map(arms.map(a=>{
      const parts=[];a.root.traverse(m=>{if(m.isMesh&&!m.userData.collisionSkip)parts.push(shape(m,m.userData.collisionLabel||'机械臂',m.userData.robotLink??-1));});
      return [a,parts];
    }));
    this.refresh();
  }
  rebuildParts(){this.parts=new Map(this.arms.map(a=>{const parts=[];a.root.traverse(m=>{if(m.isMesh&&!m.userData.collisionSkip)parts.push(shape(m,m.userData.collisionLabel||'机械臂',m.userData.robotLink??-1));});return [a,parts];}));this.refresh();}
  replaceObjects(){this.objects=new Map(this.blocks.map((b,i)=>[b,shape(b.mesh,b.label||((i?'蓝色':'橙色')+'物块'),-1,true)]));this.refresh();}
  refresh(){
    this.arms.forEach(a=>{a.root.updateWorldMatrix(true,true);followHeld(a);this.parts.get(a).forEach(update);});
    this.static.forEach(s=>{s.mesh.updateWorldMatrix(true,true);update(s);});
    this.objects.forEach(s=>{s.mesh.updateWorldMatrix(true,true);update(s);});
  }
  check(a){
    this.refresh();const parts=this.parts.get(a);
    const event=(label,part,kind)=>({label,part:part.label,kind});
    for(const part of parts){
      // Only the base mounting is intentionally connected to the tabletop.
      if(part.link!==0)for(const solid of this.static)if(overlap(part,solid))return event(solid.label,part,'static');
      for(const [block,object] of this.objects){
        if(a.held===block&&part.mesh.userData.contactRole==='pad')continue;
        const dynamic=this.physics?.enabled&&!this.physics.assistedApproach&&!this.arms.some(arm=>arm.held===block),compression=dynamic&&this.physics.blocksCompression(block,part);
        if((!dynamic||compression)&&overlap(part,object))return compression?{label:object.label,part:part.label,kind:'compression',detail:'物品已抵住桌面 · 已停止下压'}:event(object.label,part,'object');
      }
      for(const other of this.arms)if(other!==a)for(const b of this.parts.get(other))if(overlap(part,b))return event(other.index?'左臂':'右臂',part,'arm');
    }
    // Adjacent joints share their housings; test separated links for self contact.
    for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++){
      const one=parts[i],two=parts[j];
      if(Math.abs(one.link-two.link)<=2)continue;
      if(overlap(one,two))return event('自身连杆',one,'self');
    }
    if(a.held){
      const held=this.objects.get(a.held);
      for(const solid of this.static)if(overlap(held,solid))return {label:solid.label,part:'抓取物品',kind:'payload'};
      for(const [b,object] of this.objects)if(b!==a.held&&overlap(held,object))return {label:object.label,part:'抓取物品',kind:'payload'};
      for(const other of this.arms)if(other!==a)for(const part of this.parts.get(other))if(overlap(held,part))return {label:other.index?'左臂':'右臂',part:'抓取物品',kind:'payload'};
    }
    return null;
  }
  inspectGrasp(a,item){
    const result=inspectGraspGeometry(a,item);if(!result.ready||!a.gripper)return result;
    const opening=a.gripper.requested??a.gripper.opening;
    try{
      // Synchronous dry run: only finger articulation changes; no IK, physics step,
      // payload movement or recording callback runs before the original pose returns.
      a.gripper.setOpening(result.grasp.opening);this.refresh();
      const target=this.objects.get(item),parts=this.parts.get(a).filter(p=>p.link===7);
      const rejected=(part,label)=>({...result,status:'blocked',ready:false,message:part.label+'闭合时会碰到'+label+'，请调整夹持深度或高度'});
      for(const part of parts){
        if(target&&part.mesh.userData.contactRole!=='pad'&&overlap(part,target))return rejected(part,item.label);
        for(const solid of this.static)if(overlap(part,solid))return rejected(part,solid.label);
        for(const [other,shape] of this.objects)if(other!==item&&overlap(part,shape))return rejected(part,other.label);
        for(const other of this.arms)if(other!==a)for(const shape of this.parts.get(other))if(overlap(part,shape))return rejected(part,other.index?'左臂':'右臂');
      }
      return result;
    }finally{a.gripper.setOpening(opening);this.refresh();}
  }
  objectCollision(block){
    this.refresh();const object=this.objects.get(block);
    for(const solid of this.static)if(overlap(object,solid))return {label:solid.label};
    for(const [other,s] of this.objects)if(other!==block&&overlap(object,s))return {label:s.label};
    for(const arm of this.arms)for(const part of this.parts.get(arm))if(overlap(object,part))return {label:arm.index?'左臂':'右臂',arm};
    return null;
  }
  advanceGrasps(dt,onContact=()=>{}){
    if(dt<=0)return;
    // Fixed spatial microsteps keep a closing jaw from tunnelling through obstacles.
    for(const a of this.arms){
      if(!a.held||!a.grasp?.closing)continue;
      const grasp=a.grasp,c=grasp.closing,budget=Math.min(dt,.1)*.65;
      let remaining=budget;
      while(remaining>1e-9&&grasp.closing){
        const before=grasp.opening,position=grasp.position.clone(),next=Math.max(c.targetOpening,before-Math.min(.002,remaining));
        remaining-=before-next;grasp.opening=next;
        const push=Math.sign(c.center)*Math.min(Math.abs(c.center),Math.max(0,(c.contactOpening-next)/2));
        grasp.position.copy(c.start);grasp.position.x-=push/c.scale;
        updateGripper(a);applyAngles(a);followHeld(a);
        const hit=this.check(a);
        if(hit){
          grasp.opening=before;grasp.position.copy(position);grasp.closing=null;grasp.centeringBlocked=true;
          updateGripper(a);applyAngles(a);followHeld(a);a.target.copy(a.actual);
          onContact(a,{...hit,detail:'夹指推动物品受阻，已停止闭合'});break;
        }
        a.target.copy(a.actual);
        if(next<=c.targetOpening+1e-9)grasp.closing=null;
      }
    }
  }
  advanceObjects(dt,onContact=()=>{}){
    this.advanceGrasps(dt,onContact);
    const count=Math.max(1,Math.ceil(dt/(1/240))),step=dt/count;
    for(let sub=0;sub<count;sub++)for(const block of this.blocks){
      if(this.arms.some(a=>a.held===block))continue;
      const previous=block.mesh.position.y;
      block.fallSpeed=(block.fallSpeed||0)+3*step;
      const desired=previous-block.fallSpeed*step;
      block.mesh.position.y=desired;
      let hit=this.objectCollision(block);
      if(hit){
        // Keep the last non-overlapping fall position, including arm support.
        let safe=previous,bad=desired;
        for(let i=0;i<10;i++){const middle=(safe+bad)/2;block.mesh.position.y=middle;if(this.objectCollision(block))bad=middle;else safe=middle;}
        block.mesh.position.y=safe+margin;block.fallSpeed=0;
        if(hit.arm)onContact(hit.arm,{label:'落下的物品',part:'连杆',kind:'object'});
      }
    }
  }
}
