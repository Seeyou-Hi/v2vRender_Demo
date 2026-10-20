import {Output,Mp4OutputFormat,BufferTarget,CanvasSource,canEncodeVideo} from './vendor/mediabunny.js';
export async function selectEncoding(width,height,fps,probe=canEncodeVideo){
 const options={width,height,bitrate:8000000,framerate:fps,latencyMode:'quality'};
 for(const preference of ['prefer-hardware','no-preference']){try{if(await probe('avc',{...options,hardwareAcceleration:preference}))return preference;}catch{}}
 throw Error('此浏览器不支持当前尺寸的 H.264 编码，请降低分辨率或更换浏览器');
}
export class OfflineVideo{
 constructor(width,height,fps){this.width=width;this.height=height;this.fps=fps;this.channels=new Map();this.preference=null;}
 async createChannel(preference){
  const canvas=document.createElement('canvas');canvas.width=this.width;canvas.height=this.height;
  const ctx=canvas.getContext('2d',{alpha:false}),target=new BufferTarget(),output=new Output({format:new Mp4OutputFormat(),target});
  const v={canvas,ctx,target,output,frames:0,preference,fallback:false,config:null};
  v.source=new CanvasSource(canvas,{codec:'avc',bitrate:8000000,latencyMode:'quality',hardwareAcceleration:preference,onEncoderConfig:c=>{v.config={codec:c.codec,hardwareAcceleration:c.hardwareAcceleration,bitrate:c.bitrate};}});output.addVideoTrack(v.source,{frameRate:this.fps});await output.start();return v;
 }
 async add(name,pixels,time){
  let v=this.channels.get(name);if(!v){this.preference??=await selectEncoding(this.width,this.height,this.fps);v=await this.createChannel(this.preference);this.channels.set(name,v);}
  const draw=()=>v.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),this.width,this.height),0,0);draw();
  try{await v.source.add(time,1/this.fps);}catch(error){
   // If a driver rejects hardware initialization despite the capability probe,
   // recreate only the empty channel; never silently discard encoded frames.
   if(v.frames||v.preference!=='prefer-hardware')throw error;
   try{await v.output.cancel();}catch{}v=await this.createChannel('no-preference');v.fallback=true;this.channels.set(name,v);this.preference='no-preference';draw();await v.source.add(time,1/this.fps);
  }v.frames++;
 }
 async finish(){const files=[];for(const [key,v] of this.channels){await v.output.finalize();files.push({name:'videos/'+key+'.mp4',key,frames:v.frames,encoding:{requested:v.preference,fallback:v.fallback,config:v.config,note:'Hardware preference is a browser hint, not proof of physical GPU use.'},blob:new Blob([v.target.buffer],{type:'video/mp4'})});}return files;}
 async cancel(){for(const v of this.channels.values())try{await v.output.cancel();}catch{}}
}
