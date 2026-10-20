import * as T from './vendor/three.module.js';
// Preserve the live viewport's entire projection; letterbox rather than crop/stretch.
export function makeViewportCaptureCamera(source,width,height){
 if(!source?.isPerspectiveCamera)throw Error('当前网页相机尚未准备好');
 source.updateWorldMatrix(true,false);const camera=source.clone(false);
 camera.position.copy(source.getWorldPosition(new T.Vector3()));camera.quaternion.copy(source.getWorldQuaternion(new T.Quaternion()));camera.scale.set(1,1,1);camera.updateMatrixWorld(true);
 const contentWidth=Math.min(width,Math.max(1,Math.round(height*source.aspect))),contentHeight=Math.min(height,Math.max(1,Math.round(width/source.aspect)));
 const rect={x:Math.floor((width-contentWidth)/2),y:Math.floor((height-contentHeight)/2),width:contentWidth,height:contentHeight};
 camera.userData.mount={type:'live_viewport',follows:'current webpage camera each captured frame',source_aspect:source.aspect,projection_policy:'contain with black padding; no crop or stretch',source_fov_deg:source.fov,source_zoom:source.zoom};
 return {camera,rect};
}
