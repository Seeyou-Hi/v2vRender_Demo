import {captureScene,rgbPNG,maskRGBA,createCaptureResources} from './data-capture.js';
import {alignmentInfo} from './aligned-capture.js';
import {selectedViews,recordingViews,depthVideoRange,depthRGBA} from './recording-options.js';
import {compressFile,zipFiles,grayPNG,npy} from './data-formats.js';
export async function frameFiles(result,width,height,index,options={rgb:true,depth:true,mask:true}){
 const prefix='frames/'+String(index).padStart(6,'0')+'/';const files=[];
 for(const frame of result.frames){const add=(name,data)=>files.push({name:prefix+frame.name+'/'+name,data});
  if(options.rgb)add('rgb.png',await rgbPNG(frame.rgb,width,height));if(options.mg4&&frame.mg4RGB)add('mg4_proxy.png',await rgbPNG(frame.mg4RGB,width,height));
  if(options.depth){if(frame.depthPreview)add('depth_preview.png',await rgbPNG(frame.depthPreview,width,height));add('depth_m.npy',npy(frame.depthM,width,height));add('depth_mm.png',grayPNG(frame.depthMM,width,height,16));}
  if(options.mask){if(frame.maskPreview){add('mask_preview.png',await rgbPNG(frame.maskPreview,width,height));add('mask_coverage_right.npy',npy(frame.coverageRight,width,height));add('mask_coverage_left.npy',npy(frame.coverageLeft,width,height));}add('mask_id.png',await rgbPNG(maskRGBA(frame.mask),width,height));add('mask_id_raw.png',grayPNG(frame.mask,width,height));add('mask_id.npy',npy(frame.mask,width,height));add('link_id.png',grayPNG(frame.links,width,height,16));}
 }
 for(const frame of result.frames)if(frame.sampleIndex&&(options.depth||options.mask))files.push({name:prefix+frame.name+'/sample_index.npy',data:npy(frame.sampleIndex,width,height)});
 files.push({name:prefix+'metadata.json',data:new TextEncoder().encode(JSON.stringify(result.metadata))});return files;
}
export function installSequenceCapture(context){
 const $=id=>document.querySelector(id),button=$('#record-video'),status=$('#sequence-status'),single=$('#capture-data'),size=$('#capture-size'),fps=$('#sequence-fps'),depthBox=$('#record-depth'),maskBox=$('#record-mask'),wrist=$('#wrist-arm'),viewBox=$('#record-view'),channel=$('#recorded-channel'),bundle=$('#video-bundle'),download=$('#download-video'),preview=$('#preview-video');
 const dialog=document.createElement('dialog');dialog.className='video-dialog';dialog.innerHTML='<button class="video-close" aria-label="关闭视频预览">×</button><h2>录制预览 · ext1 RGB</h2><video controls playsinline></video>';document.body.append(dialog);const video=dialog.querySelector('video');dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>video.pause());preview.onclick=()=>dialog.showModal();
 const supported=typeof MediaRecorder!=='undefined'&&typeof HTMLCanvasElement.prototype.captureStream==='function';
 const mime=supported?['video/mp4;codecs=avc1.424028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type)):null;
 let session=null,bundleURL=null,videoURL=null,completedVideos=[],completedStartedAt=null;
 function selectCompletedVideo(){const file=completedVideos[Number(channel.value)];if(!file)return;if(videoURL)URL.revokeObjectURL(videoURL);videoURL=URL.createObjectURL(file.blob);download.href=videoURL;download.download='armature-'+file.key.replace('/','-')+'-'+completedStartedAt.replace(/[:.]/g,'-')+'.'+file.name.split('.').at(-1);video.src=videoURL;dialog.querySelector('h2').textContent='录制预览 · '+file.key;}
 channel.onchange=selectCompletedVideo;
 const message=text=>status.textContent=text;
 function cleanup(s){s.resources.dispose();s.videos.forEach(v=>v.stream.getTracks().forEach(track=>track.stop()));s.controls.forEach(([el,disabled])=>el.disabled=disabled);button.disabled=!supported;button.textContent='⏺ 录制视频';button.setAttribute('aria-label','开始录制视频');button.classList.remove('recording');session=null;}
 function emitVideo(s,frame,kind,pixels){
  const key=frame.name+'/'+kind;let v=s.videos.find(item=>item.key===key);
  if(!v){const canvas=document.createElement('canvas');canvas.width=s.width;canvas.height=s.height;const ctx=canvas.getContext('2d',{alpha:false});ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),s.width,s.height),0,0);
   const stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];if(typeof track.requestFrame!=='function'){stream.getTracks().forEach(t=>t.stop());throw Error('浏览器不支持逐帧视频录制，请使用新版 Chrome 或 Edge');}
   const recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:8000000}),chunks=[];const actual=recorder.mimeType||mime||'video/webm';
   v={key,canvas,ctx,stream,track,recorder,chunks,mime:actual,ext:actual.includes('mp4')?'mp4':'webm',frames:0};v.done=new Promise(resolve=>{recorder.onstop=()=>resolve();});recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);s.videoBytes+=event.data.size;}};recorder.onerror=()=>{s.error='视频编码失败';finish('视频编码错误');};s.videos.push(v);recorder.start(1000);
  }
  v.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),s.width,s.height),0,0);v.track.requestFrame();v.frames++;
 }
 async function finish(reason='用户停止'){
  const s=session;if(!s||s.closing)return;s.closing=true;s.running=false;clearTimeout(s.timer);button.disabled=true;message('正在生成视频和录制包…');
  try{
   try{await s.inFlight;}catch(error){s.error=String(error.message||error);}
   await new Promise(resolve=>{const timer=setTimeout(resolve,100);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
   await Promise.all(s.videos.map(v=>{if(v.recorder.state!=='inactive')v.recorder.stop();return v.done;}));
   if(!s.frames.length||!s.videos.length)throw Error(s.error||'没有可保存的录制帧');
   const videoFiles=s.videos.map(v=>({name:'videos/'+v.key+'.'+v.ext,data:null,blob:new Blob(v.chunks,{type:v.mime}),key:v.key,frames:v.frames}));
   for(const file of videoFiles)s.entries.push({name:file.name,data:new Uint8Array(await file.blob.arrayBuffer())});
   const duration=s.frames.length>1?s.frames.at(-1).elapsed_s-s.frames[0].elapsed_s:0;
   const metadata={version:7,alignment:alignmentInfo,views:s.views,depth_video_visualization:s.depth?depthVideoRange:null,camera_tracking:s.views.includes('viewport')?'live webpage camera, sampled each frame; aspect preserved with letterbox padding':'configured capture views',wrist_arm_id:s.wristArm+1,type:'selected_view_video_with_optional_frame_arrays',started_at:s.startedAt,finished_at:new Date().toISOString(),requested_fps:s.fps,actual_fps:duration?(s.frames.length-1)/duration:0,frame_count:s.frames.length,width:s.width,height:s.height,saved_channels:{rgb_video:true,rgb_png:true,depth_video:s.depth,mask_video:s.mask,depth:s.depth,mask_id:s.mask},frames:s.frames,videos:videoFiles.map(f=>({path:f.name,submitted_frames:f.frames})),reason,error:s.error||null,mask_palette_rgb:{0:[0,0,0],1:[236,145,95],2:[102,176,216]},timing:'Each captured RGB frame is submitted once via requestFrame. Depth/IDs correspond to the same captured frame index; no repeated frames are added to fill timing gaps. elapsed_s excludes pauses. Video timing is variable-rate; actual timestamps are authoritative.'};
   s.entries.push(await compressFile('sequence.json',new TextEncoder().encode(JSON.stringify(metadata,null,2))));
   s.entries.push(await compressFile('README.txt',new TextEncoder().encode('videos/{selected view}/rgb, depth, mask.mp4 or .webm: synchronized videos of selected views only. Depth video is display-only grayscale: valid d maps to round(255*(1-clamp(d/5,0,1))), invalid=black; use depth_m.npy for exact metric values. Viewport view follows the current webpage camera per frame, including dragging and zooming; it preserves the entire source projection with letterbox padding. Per-frame camera K includes padding offsets. All preview channels share 2x2 supersampling and downsampling. Mask preview is coverage-weighted orange/blue. Raw depth/ID arrays use the same representative sample; sample_index.npy records it. RGB and preview PNGs are lossless; videos are lossy previews. mask_coverage_right/left.npy store fractional robot occupancy.\nframes/NNNNNN/{view}/depth_m.npy: float32 meters, only when save depth is checked. mask_id.npy: uint8 0/1/2, only when save Mask ID is checked. The same frame folder contains depth PNGs and colored/raw mask PNGs if selected.\nsequence.json lists submitted frame indices, timestamps, actual capture rate and selected channels. Each frame metadata contains camera parameters and robot/object state.\nUse frame indices to align data. Video uses variable capture timing; selected frame rate is a target, not guaranteed.\n')));
   if(bundleURL)URL.revokeObjectURL(bundleURL);bundleURL=URL.createObjectURL(new Blob([zipFiles(s.entries)],{type:'application/zip'}));bundle.href=bundleURL;bundle.download='armature-recording-'+s.startedAt.replace(/[:.]/g,'-')+'.zip';bundle.hidden=false;
   completedVideos=videoFiles;completedStartedAt=s.startedAt;channel.replaceChildren(...videoFiles.map((file,index)=>{const option=document.createElement('option');option.value=index;option.textContent=file.key;return option;}));channel.hidden=false;channel.value='0';selectCompletedVideo();download.hidden=false;preview.hidden=false;
   message(s.views.join(' / ')+' · '+(reason.includes('上限')?'达到录制上限 · ':'')+'视频已生成 · '+s.frames.length+' 帧 · '+(s.depth?'深度已保存 · ':'')+(s.mask?'Mask ID 已保存':'未选 Mask ID'));context.toast('视频已生成，点击下载视频或录制包保存');
  }catch(error){console.error(error);message('录制失败：'+error.message);context.toast('录制保存失败');}finally{cleanup(s);}
 }
 async function tick(s){
  if(!s.running||s.paused||s.busy)return;s.busy=true;
  const start=performance.now();s.inFlight=(async()=>{
   const result=await captureScene({...context,width:s.width,height:s.height,raw:true,views:s.views,wristArm:s.wristArm,resources:s.resources,saveDepth:s.depth,saveMask:s.mask});
   const index=s.frames.length,elapsed=(start-s.started-s.pauseTotal)/1000;result.metadata.frame_index=index;result.metadata.elapsed_s=elapsed;
   for(const frame of result.frames){emitVideo(s,frame,'rgb',frame.rgb);if(s.depth)emitVideo(s,frame,'depth',frame.depthPreview||depthRGBA(frame.depthM));if(s.mask)emitVideo(s,frame,'mask',frame.maskPreview||maskRGBA(frame.mask));}
   const files=await frameFiles(result,s.width,s.height,index,{rgb:true,depth:s.depth,mask:s.mask});const batch=await Promise.all(files.map(f=>compressFile(f.name,f.data)));
   s.entries.push(...batch);s.bytes+=batch.reduce((n,f)=>n+f.data.length,0);s.frames.push({index,path:'frames/'+String(index).padStart(6,'0'),timestamp:result.metadata.timestamp,elapsed_s:elapsed});
   const duration=s.frames.length>1?elapsed-s.frames[0].elapsed_s:0;if(!s.closing&&!s.paused)message('● 录制中 · '+s.frames.length+' 帧 · 实际 '+(duration?(s.frames.length-1)/duration:0).toFixed(1)+' fps'+(s.depth?' · 深度':'')+(s.mask?' · Mask ID':''));
  })();
  try{await s.inFlight;}catch(error){s.busy=false;s.error=String(error.message||error);if(!s.closing)await finish('采集错误');return;}
  s.busy=false;if(!s.running||s.paused)return;
  if(s.bytes+s.videoBytes>=64*1048576||(s.depth||s.mask)&&s.frames.length>=300||performance.now()-s.started-s.pauseTotal>=300000){await finish('达到录制大小/时长上限');return;}
  s.timer=setTimeout(()=>tick(s),Math.max(0,1000/s.fps-(performance.now()-start)));
 }
 function start(){
  if(session||!supported)return;const views=selectedViews(viewBox.value);const [width,height]=size.value.split('x').map(Number);const controls=[size,fps,depthBox,maskBox,wrist,viewBox,single].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
  session={running:true,closing:false,paused:false,pauseTotal:0,views,wristArm:Number(wrist.value),width,height,fps:Number(fps.value),depth:depthBox.checked,mask:maskBox.checked,resources:createCaptureResources(width,height),started:performance.now(),startedAt:new Date().toISOString(),entries:[],frames:[],videos:[],bytes:0,videoBytes:0,controls};
  button.textContent='■ 停止录制';button.setAttribute('aria-label','停止录制视频');button.classList.add('recording');download.hidden=true;bundle.hidden=true;preview.hidden=true;channel.hidden=true;$('#mask-preview').hidden=!session.mask;message('开始录制 '+recordingViews[viewBox.value]+' · RGB'+(session.depth?' / 深度':'')+(session.mask?' / Mask':''));tick(session);context.viewport?.focus();
 }
 function pause(){const s=session;if(!s||s.paused||s.closing)return;s.paused=true;s.pauseAt=performance.now();clearTimeout(s.timer);s.pauseFlight=Promise.resolve(s.inFlight).catch(()=>{}).then(()=>new Promise(resolve=>{const t=setTimeout(resolve,100);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(t);resolve();}));})).then(()=>{if(s.paused&&!s.closing)s.videos.forEach(v=>{if(v.recorder.state==='recording')v.recorder.pause();});});message('录制已暂停');}
 function resume(){const s=session;if(!s||!s.paused||s.closing)return;s.pauseTotal+=performance.now()-s.pauseAt;s.paused=false;Promise.resolve(s.pauseFlight).then(()=>{if(!s.running)return;s.videos.forEach(v=>{if(v.recorder.state==='paused')v.recorder.resume();});return Promise.resolve(s.inFlight).then(()=>{if(s.running&&!s.paused)tick(s);});});}
 button.onclick=()=>session?finish():start();button.disabled=!supported;
 if(!supported)message('当前浏览器不支持录制视频');
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&session){pause();session.hiddenPause=true;}else if(session?.hiddenPause){session.hiddenPause=false;if(!context.isDemoPaused?.())resume();}});
 window.addEventListener('beforeunload',event=>{if(session){event.preventDefault();event.returnValue='';}});
 const draw=()=>{};Object.assign(draw,{supported,start,stop:finish,pause,resume,isRecording:()=>!!session&&!session.closing});return draw;
}



