'use strict';
const $=id=>document.getElementById(id),viewport=$('viewport');
$('joints').innerHTML=['J1 基座','J2 肩部','J3 肘部','J4 腕部','J5 腕部','J6 法兰'].map((s,i)=>`<div class="joint"><span>${s}</span><input type="range" min="-360" max="360" step="0.1" value="0" aria-label="${s} 角度" data-joint="${i}"><b>0°</b></div>`).join('');
const ids=new Set(['help','close-help','reset','position-control','downward','grip','solver-kind','gripper-kind','item-kind','item-style','physics-enabled','hold-orientation','speed','trail-toggle','grid-toggle','demo-mode','demo-play','demo-replay','demo-exit','demo-loop','wrist-arm']);
function send(event){window.parent.armRemoteEvent?.(event);}
for(const type of ['click','input','change'])document.addEventListener(type,e=>{const el=e.target.closest('button,input,select');if(!el)return;
 if(el.dataset.view)return;
 if(!(ids.has(el.id)||el.dataset.arm!==undefined||el.dataset.joint!==undefined))return;
 if(type==='click'&&el.tagName!=='BUTTON'||type==='input'&&el.tagName==='SELECT'||type==='change'&&el.type==='range')return;
 if(!el.dataset.view){e.stopImmediatePropagation();if(type==='click')e.preventDefault();}
 const event={type};if(el.dataset.arm!==undefined)event.arm=+el.dataset.arm;else if(el.dataset.view)event.view=el.dataset.view;else if(el.dataset.joint!==undefined)event.joint=+el.dataset.joint;else event.id=el.id;
 if(type!=='click'){event.value=el.value;if(el.type==='checkbox')event.checked=el.checked;}
 send(event);
},true);
const supported=new Set('wasdqefijkluohr123'.split('').concat(['shift','tab','arrowup','arrowdown','arrowleft','arrowright','z','x']));
for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{const k=e.key.toLowerCase();if(type==='keyup'&&supported.has(k)){window.parent.armRemoteKey?.(k,false);return;}if(!supported.has(k)||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||$('guide').open)return;e.preventDefault();e.stopImmediatePropagation();if(type==='keydown'&&'123'.includes(k)){window.armature?.view(['perspective','wrist','front'][+k-1]);return;}window.parent.armRemoteKey?.(k,type==='keydown');});
window.addEventListener('blur',()=>window.parent.armRemoteClear?.());
window.armRemoteView={
 stream(){},
 applyState(s){window.armRemoteState=s;},
 apply(s){
  for(const [id,disabled]of Object.entries(s.disabled||{}))if($(id))$(id).disabled=disabled;
  for(const [id,v]of Object.entries(s.text||{})){const el=$(id);if(el&&id!=='view-name'){el.textContent=v.text;el.className=v.className;}}
  for(const [id,v]of Object.entries(s.values||{})){const el=$(id);if(el){if(document.activeElement!==el)el.value=v.value;if(v.checked!==undefined)el.checked=v.checked;el.disabled=v.disabled;}}
  for(const el of document.querySelectorAll('[data-arm]'))el.classList.toggle('active',+el.dataset.arm===s.active);

  document.querySelectorAll('[data-joint]').forEach((el,i)=>{const value=s.angles[s.active][i];if(document.activeElement!==el)el.value=value;if(s.jointDisabled)el.disabled=s.jointDisabled[i];el.parentElement.querySelector('b').textContent=Math.round(value)+'°';});
  $('grip').querySelector('span').textContent=s.grip;$('position-control').disabled=s.positionDisabled;$('demo-controls').hidden=!s.demo;$('progress').style.width=s.progress;$('demo-progress').style.width=s.demoProgress;
  if(s.guide&&!$('guide').open)$('guide').showModal();if(!s.guide&&$('guide').open)$('guide').close();
 },stop(){window.armRemoteState=null;}
};
$('guide').addEventListener('cancel',e=>{e.preventDefault();send({type:'click',id:'close-help'});});
window.parent.armRemoteReady?.();
