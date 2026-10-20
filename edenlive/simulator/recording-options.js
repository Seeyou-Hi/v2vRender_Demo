export const recordingViews={ext1:'ext1 · 正面',ext2:'ext2 · 斜侧',wrist:'wrist · 腕部',viewport:'当前网页视角 · 随拖动',all:'三视角同时'};
export function selectedViews(value){if(!Object.hasOwn(recordingViews,value))throw Error('无效的录制视角');return value==='all'?['ext1','ext2','wrist']:[value];}
export const depthVideoRange={near_m:0,far_m:5,invalid_rgb:[0,0,0],mapping:'valid depth: round(255 * (1 - clamp(depth_m / 5, 0, 1))); near is bright, far is dark; invalid=black; display only, use depth_m.npy for metric values'};
export function depthRGBA(values){const pixels=new Uint8Array(values.length*4);for(let i=0;i<values.length;i++){const d=values[i],v=Number.isFinite(d)&&d>0?Math.round(255*(1-Math.min(d/depthVideoRange.far_m,1))):0;pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=v;pixels[i*4+3]=255;}return pixels;}
