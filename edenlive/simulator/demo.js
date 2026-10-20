import * as T from './vendor/three.module.js';
export class DemoController{
 constructor({arms,items,zones,grip,reset,planPickup=null,physicsMode=()=>false,onChange=()=>{},onFinish=()=>{}}){Object.assign(this,{arms,items,zones,grip,reset,planPickup,physicsMode,onChange,onFinish});this.state='idle';this.phase=0;this.elapsed=0;this.stable=0;this.loop=false;this.error='';}
 get active(){return this.state!=='idle';}
 get playing(){return this.state==='playing';}
 get title(){return this.error||this.phases?.[this.phase]?.title||'双臂拾取与放置';}
 get completed(){return this.items.filter(b=>{const zone=this.zones[b.zone];return !this.arms.some(a=>a.held===b)&&Math.hypot(b.mesh.position.x-zone.x,b.mesh.position.z-zone.z)<.3&&b.mesh.position.y<b.halfHeight+.04;}).length;}
 get progress(){return this.state==='done'?1:this.phase/8;}
 start(){
  this.reset();this.error='';this.state='playing';
  const object=this.arms.map(a=>this.items.find(b=>b.zone===a.index));
  const pickup=object.map((b,i)=>this.planPickup?this.planPickup(this.arms[i],b):[b.mesh.position.x,Math.max(.05,b.mesh.position.y-this.arms[i].gripper.graspHeight(b)+.065),b.mesh.position.z]);
  if(this.physicsMode())pickup.forEach(point=>{if(point)point[1]+=.004;});
  if(pickup.some(point=>!point)){this.fail('当前物品未找到安全夹持位置，请调整夹爪或物品');return;}
  const drop=object.map((b,i)=>{const zone=this.zones[b.zone];return [zone.x,Math.max(.16,b.halfHeight-.01-this.arms[i].gripper.graspHeight(b)+.08),zone.z];});
  const raised=points=>points.map(([x,y,z])=>[x,.85,z]);
  this.phases=[
   {title:'接近目标',goals:raised(pickup)},
   {title:'下降并对齐',goals:pickup},
   {title:'闭合夹爪',wait:.6,action:()=>{
    const success=this.arms.every((a,i)=>{const result=this.grip(a.index);return result.ok&&a.held===object[i];});
    if(success)this.phases[5].goals=object.map((b,i)=>{const a=this.arms[i],zone=this.zones[b.zone],bounds=new T.Box3().setFromObject(b.mesh),offset=b.mesh.getWorldPosition(new T.Vector3()).sub(a.actual);return [zone.x-offset.x,Math.max(.05,a.actual.y-bounds.min.y+.06),zone.z-offset.z];});
    return success;
   }},
   {title:'提起物品',goals:raised(pickup)},
   {title:'搬运至目标区',goals:raised(drop)},
   {title:'下降准备放置',goals:drop},
   {title:'释放物品',wait:.35,action:()=>this.arms.every(a=>this.grip(a.index).ok&&!a.held)},
   {title:'抬起并撤离',goals:raised(drop)},
   {title:'确认放置结果',wait:1.2,check:()=>this.completed===this.items.length}
  ];
  this.enter(0);
 }
 enter(index){this.phase=index;this.elapsed=0;this.stable=0;const phase=this.phases[index];this.goals=phase.goals?.map(point=>new T.Vector3(...point))||null;this.goals?.forEach((point,i)=>this.arms[i].target.copy(point));if(phase.action&&!phase.action()){this.fail('抓取或释放受阻，请重播或返回操作');return;}this.onChange(this);}
 fail(message){this.state='blocked';this.error=message;this.onChange(this);}
 pause(){if(this.playing){this.state='paused';this.onChange(this);}}
 resume(){if(this.state==='paused'){this.state='playing';this.onChange(this);}}
 stop(){this.state='idle';this.error='';this.arms.forEach(a=>{a.target.copy(a.actual);a.velocity.fill(0);a.cartesianVelocity?.set(0,0,0);});this.onChange(this);}
 tick(dt){
  if(!this.playing||!dt)return;
  if(this.arms.some(a=>a.collisionReport)){this.fail('触碰'+this.arms.find(a=>a.collisionReport).collisionReport.label+'，演示已停止');return;}
  this.elapsed+=dt;const phase=this.phases[this.phase];
  const ready=!this.goals||this.goals.every((point,i)=>this.arms[i].actual.distanceTo(point)<.012&&this.arms[i].velocity.every(v=>Math.abs(v)<.08));
  this.stable=ready?this.stable+dt:0;
  if(this.elapsed>25){this.fail('目标未能到达，请重播或返回操作');return;}
  if(this.stable<.15||this.elapsed<(phase.wait||.3)||phase.check&&!phase.check())return;
  if(this.phase<this.phases.length-1)this.enter(this.phase+1);
  else if(this.loop){this.onFinish(this);this.start();}
  else{this.state='done';this.onChange(this);this.onFinish(this);}
 }
}
export function drawDemoOverlay(ctx,width,height,meta){
 const scale=width/1920;ctx.save();ctx.scale(scale,scale);const h=height/scale;
 ctx.fillStyle='#172330';ctx.font='600 25px sans-serif';ctx.fillText('ARMATURE / BIMANUAL DEMO',56,67);
 ctx.font='22px sans-serif';ctx.fillStyle='#4c5967';ctx.fillText('双臂拾取与放置',56,104);
 ctx.textAlign='right';ctx.fillText(meta.completed+' / 2',1864,67);
 ctx.fillStyle='rgba(20,31,43,.82)';ctx.fillRect(530,h-122,860,76);
 ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='500 27px sans-serif';ctx.fillText(meta.caption,960,h-76);
 ctx.fillStyle='rgba(20,31,43,.18)';ctx.fillRect(56,h-25,1808,3);ctx.fillStyle='#ee9366';ctx.fillRect(56,h-25,1808*meta.progress,3);
 ctx.restore();
}