import { inspectGif, GifSource } from './gif-source.js';
import { createComposer, paintComposition } from './composition.js?v=10.4';
const $ = id => document.getElementById(id);
const state = {file:null, url:null, mode:"video", gif:null, width:0, height:0, duration:0, busy:false, controller:null, gifUrl:null};
const video=$('video');
const composer=createComposer({onChange:()=>invalidate(),onStatus:status,isBusy:()=>state.busy});
const mb = n => n<1000000?(n/1000).toFixed(1)+' KB':(n/1000000).toFixed(2)+' MB';
const abortError = () => new DOMException('已取消','AbortError');
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function eventOnce(el,event,signal,timeout=20000){return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',fail);signal?.removeEventListener('abort',abort)};const ok=()=>{clean();resolve()};const fail=()=>{clean();reject(new Error('无法解码该视频，请尝试 H.264 MP4 或 WebM 格式。'))};const abort=()=>{clean();reject(abortError())};el.addEventListener(event,ok,{once:true});el.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{clean();reject(new Error('视频读取超时，请尝试其他视频。'))},timeout);if(signal?.aborted)abort()})}
async function sampler(signal){if(state.gif)return new GifSource(state.gif);const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';const ready=eventOnce(v,'loadeddata',signal);v.src=state.url;v.load();try{await ready;return v}catch(e){disposeVideo(v);throw e}}
function disposeVideo(v){if(v.dispose){v.dispose();return}v.pause();v.removeAttribute('src');v.load()}
async function seek(v,t,signal){if(v.seek)return v.seek(t,signal);if(signal?.aborted)throw abortError();t=Math.max(0,Math.min(t,Math.max(0,v.duration-.001)));if(Math.abs(v.currentTime-t)<.0001&&v.readyState>=2)return;const done=eventOnce(v,'seeked',signal);v.currentTime=t;await done;if(v.readyState<2)await eventOnce(v,'loadeddata',signal)}
function range(){if(!state.file)throw new Error('请先导入文件。');if(!Number.isFinite(state.duration)||state.duration<=0)throw new Error('文件时长无效。');return {start:0,end:state.duration,duration:state.duration}}
let estimateTimer, estimateController, estimateKey=null;
function stopEstimate(){clearTimeout(estimateTimer);estimateKey=null;if(estimateController){estimateController.abort();estimateController=null}}
function scheduleEstimate(){
  if(state.busy)return;
  let r,d,fps;
  try{r=range();d=composer.dimensions();composer.snapshot();fps=Number($('fpsRange').value)}catch{stopEstimate();estimateKey=null;$('sizeEstimate').textContent='—';$('estimateHint').textContent=state.file?'请设置有效的画布尺寸':'导入文件后，根据尺寸、帧率和素材内容预估';return}
  const key=JSON.stringify([state.url,r.start,r.end,d.width,d.height,fps,selectedColors(),composer.key()]);if(key===estimateKey)return;
  stopEstimate();estimateKey=key;
  $('sizeEstimate').textContent='正在预估…';$('estimateHint').textContent='正在采样素材画面，估算 GIF 编码体积';
  estimateTimer=setTimeout(()=>estimateSize(r,{...d,fps,colors:selectedColors(),layout:composer.snapshot()},key),400);
}
async function estimateSize(r,opts,key){
  const controller=new AbortController();estimateController=controller;const {signal}=controller;
  let v,worker;
  try{
    v=await sampler(signal);worker=new Worker(new URL('./encoder-worker.js?v=10.4',import.meta.url),{type:'module'});
    await workerCall(worker,{type:'init'},signal);
    const count=Math.max(1,Math.ceil(r.duration*opts.fps)),samples=Math.min(5,count);
    const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(let i=0;i<samples;i++){
      const frame=samples===1?0:Math.round((count-1)*i/(samples-1));
      await seek(v,r.start+frame*r.duration/count,signal);paintComposition(ctx,v,canvas.width,canvas.height,opts.layout);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await workerCall(worker,{type:'frame',pixels:pixels.buffer,width:canvas.width,height:canvas.height,colors:opts.colors,transparent:opts.layout.background==='transparent',delay:100,loop:true},signal,[pixels.buffer]);
    }
    const {bytes}=await workerCall(worker,{type:'finish'},signal);
    if(signal.aborted||key!==estimateKey)return;
    const estimate=Math.max(bytes.byteLength,Math.round((bytes.byteLength-32)*count/samples+32));
    $('sizeEstimate').textContent='约 '+mb(estimate);
    $('estimateHint').textContent='根据完整素材采样估算，实际大小以导出结果为准';
  }catch(e){if(e.name!=='AbortError'&&key===estimateKey){$('sizeEstimate').textContent='暂无法预估';$('estimateHint').textContent='可以直接生成 GIF 查看实际大小'}}
  finally{worker?.terminate();if(v)disposeVideo(v);if(estimateController===controller)estimateController=null}
}
function update(){
  scheduleEstimate();let r,d;try{r=range();d=composer.dimensions();composer.snapshot()}catch{}
  $('frameEstimate').textContent=r?Math.ceil(r.duration*Number($('fpsRange').value)):'—';
  $('fpsValue').innerHTML=$('fpsRange').value+' <span>FPS</span>';
  $('generateBtn').disabled=!state.file||state.busy||!r||!d||composer.pending;
  try{const size=composer.dimensions();$('dimensionHint').textContent=size.width+' × '+size.height}catch{$('dimensionHint').textContent='请填写有效宽高'}
}
function setBusy(busy){
  state.busy=busy;if(busy)stopEstimate();document.body.classList.toggle('busy',busy);
  for(const id of ['fileInput','replaceBtn','chooseBtn','fpsRange','loopToggle','colorsSelect','videoMode','gifMode'])$(id).disabled=busy;
  composer.setBusy();$('cancelBtn').hidden=!busy;$('progressWrap').hidden=!busy;update();
}
function progress(n,text){$('progressBar').style.width=Math.max(0,Math.min(100,n))+'%';status(text)}
function selectedColors(){return state.mode==='gif'?Number($('colorsSelect').value):256}
function setMode(mode){
  state.mode=mode;const gif=mode==='gif';
  $('videoMode').classList.toggle('selected',!gif);$('gifMode').classList.toggle('selected',gif);
  $('videoMode').setAttribute('aria-pressed',String(!gif));$('gifMode').setAttribute('aria-pressed',String(gif));
  $('workspaceTitle').textContent=gif?'GIF 工作区':'视频工作区';$('replaceBtn').textContent=gif?'↻ 更换 GIF':'↻ 更换视频';
  $('uploadTitle').textContent=gif?'把 GIF 拖到这里':'把视频拖到这里';
  $('uploadSubtitle').textContent=gif?'调整动画尺寸、帧率和颜色，改变文件大小':'或者点击选择一个视频，开始创作';
  $('chooseBtn').textContent=gif?'＋ 选择 GIF':'＋ 选择视频';$('dropzone').setAttribute('aria-label',gif?'选择或拖入 GIF 文件':'选择或拖入视频文件');
  $('uploadHint').textContent=gif?'支持动态及静态 GIF · 全部在设备本地处理':'MP4、MOV、WebM · 兼容性取决于浏览器解码支持';
  $('fileInput').accept=gif?'image/gif,.gif':'video/*,.mp4,.mov,.webm,.m4v';$('colorsBlock').hidden=!gif;
  $('stageBadge').textContent='导出画布';
}
function clearSource(){
  stopEstimate();video.pause();
  if(state.url)URL.revokeObjectURL(state.url);if(state.gifUrl)URL.revokeObjectURL(state.gifUrl);
  state.file=null;state.gif=null;state.url=null;state.gifUrl=null;state.width=0;state.height=0;state.duration=0;composer.setSource(0,0,false);
  video.removeAttribute('src');video.load();$('sourceGifPreview').removeAttribute('src');
  $('result').hidden=true;$('videoArea').hidden=true;$('dropzone').hidden=false;$('replaceBtn').hidden=true;$('emptyTag').hidden=false;
}
for(const [id,mode] of [['videoMode','video'],['gifMode','gif']])$(id).onclick=()=>{if(state.busy||state.mode===mode)return;clearSource();setMode(mode);setBusy(false);status(mode==='gif'?'导入 GIF 后，调整参数即可改变文件大小':'导入视频后，就可以开始了')};
async function loadFile(file){
  if(!file||state.busy)return;
  const isGif=file.type==='image/gif'||/\.gif$/i.test(file.name);
  if(!isGif&&!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v|ogg|ogv)$/i.test(file.name)){status('请选择视频或 GIF 文件。',true);return}
  clearSource();setMode(isGif?'gif':'video');state.url=URL.createObjectURL(file);
  state.controller=new AbortController();const {signal}=state.controller;setBusy(true);status(isGif?'正在读取 GIF 动画…':'正在读取视频…');
  try{
    if(isGif){
      const bytes=new Uint8Array(await file.arrayBuffer());if(signal.aborted)throw abortError();
      state.gif=inspectGif(bytes);state.width=state.gif.width;state.height=state.gif.height;state.duration=state.gif.duration;
      $('sourceGifPreview').src=state.url;$('sourceGifPreview').hidden=false;video.hidden=true;
      $('loopToggle').checked=state.gif.reader.loopCount()!==null;
    }else{
      const ready=eventOnce(video,'loadeddata',signal);video.src=state.url;await ready;
      if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw new Error('视频时长或画面无效，请使用有效的视频文件。');
      state.width=video.videoWidth;state.height=video.videoHeight;state.duration=video.duration;video.hidden=false;$('sourceGifPreview').hidden=true;
    }
    if(signal.aborted)throw abortError();state.file=file;composer.setSource(state.width,state.height,isGif);
    $('dropzone').hidden=true;$('videoArea').hidden=false;$('replaceBtn').hidden=false;$('emptyTag').hidden=true;
    $('fileName').textContent=file.name;$('fileMeta').textContent=state.width+' × '+state.height+' · '+state.duration.toFixed(2)+' 秒 · '+(isGif?state.gif.count+' 帧 · ':'')+mb(file.size);
    status(isGif?'GIF 已就绪，将转换完整动画，可调整画布与叠图':'视频已就绪，将转换完整视频，可调整画布与叠图');
  }catch(e){clearSource();status(e.name==='AbortError'?'已取消读取':isGif?'GIF 读取失败：'+e.message:e.message,e.name!=='AbortError')}
  finally{state.controller=null;setBusy(false)}
}
function invalidate(){if(state.busy)return;$('result').hidden=true;update()}
for(const id of ['fpsRange','loopToggle','colorsSelect'])$(id).addEventListener('input',invalidate);
$('dropzone').onclick=()=>{if(!state.busy)$('fileInput').click()};$('dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!state.busy)$('fileInput').click()}};$('chooseBtn').onclick=e=>{e.stopPropagation();$('fileInput').click()};$('replaceBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{loadFile(e.target.files[0]);e.target.value=''};
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragover')});for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('dragover')});$('dropzone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('cancelBtn').onclick=()=>state.controller?.abort();
function workerCall(worker,data,signal,transfer=[]){return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);signal.removeEventListener('abort',abort)};const message=e=>{cleanup();if(e.data.type==='error')reject(new Error(e.data.message));else resolve(e.data)};const error=e=>{cleanup();reject(new Error(e.message||'GIF 编码器无法启动，请刷新后重试。'))};const abort=()=>{cleanup();reject(abortError())};const timer=setTimeout(()=>{cleanup();reject(new Error('编码超时，请缩短片段或减小画面尺寸。'))},90000);worker.addEventListener('message',message,{once:true});worker.addEventListener('error',error,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}worker.postMessage(data,transfer)})}
async function encode(v,r,opts,signal){
  const worker=new Worker(new URL('./encoder-worker.js?v=10.4',import.meta.url),{type:'module'});
  const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const count=Math.max(1,Math.ceil(r.duration*opts.fps));
  try{
    await workerCall(worker,{type:'init'},signal);
    for(let i=0;i<count;i++){
      await seek(v,r.start+i*r.duration/count,signal);paintComposition(ctx,v,canvas.width,canvas.height,opts.layout);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await workerCall(worker,{type:'frame',pixels:pixels.buffer,width:canvas.width,height:canvas.height,colors:opts.colors,transparent:opts.layout.background==='transparent',delay:(Math.round((i+1)*r.duration*100/count)-Math.round(i*r.duration*100/count))*10,loop:opts.loop},signal,[pixels.buffer]);
      progress((i+1)/count*96,`正在转换 · ${i+1} / ${count} 帧`);
    }
    const response=await workerCall(worker,{type:'finish'},signal);
    return {bytes:response.bytes,size:response.bytes.byteLength,count,delay:r.duration*1000/count};
  }finally{worker.terminate()}
}
$('generateBtn').onclick=async()=>{
  let v;
  try{
    const r=range();const opts={...composer.dimensions(),layout:composer.snapshot(),fps:Number($('fpsRange').value),colors:selectedColors(),loop:$('loopToggle').checked};
    state.controller=new AbortController();const {signal}=state.controller;setBusy(true);$('result').hidden=true;video.pause();progress(0,state.gif?'正在准备 GIF 重新编码…':'正在准备视频抽帧…');
    v=await sampler(signal);const output=await encode(v,r,opts,signal);
    if(signal.aborted)throw abortError();if(state.gifUrl)URL.revokeObjectURL(state.gifUrl);
    state.gifUrl=URL.createObjectURL(new Blob([output.bytes],{type:'image/gif'}));$('gifPreview').src=state.gifUrl;$('downloadBtn').href=state.gifUrl;
    $('downloadBtn').download=state.file.name.replace(/\.[^.]+$/,'')+'_'+r.start+'-'+r.end+'.gif';
    $('resultMeta').textContent=`实际大小 ${mb(output.size)} · ${opts.width} × ${opts.height} px · ${output.count} 帧 · ${(1000/output.delay).toFixed(1)} FPS`;
    const delta=(1-output.size/state.file.size)*100;$('outputNote').textContent=state.gif?`原文件 ${mb(state.file.size)} → ${mb(output.size)} · ${delta>=0?'减小 '+delta.toFixed(1)+'%':'增大 '+(-delta).toFixed(1)+'%'}，${opts.colors} 色，包含画布构图及 PNG 外壳、叠图。`:'已按画布宽高导出，包含素材的位置、拉伸效果及 PNG 外壳、叠图。';
    estimateKey=JSON.stringify([state.url,r.start,r.end,opts.width,opts.height,opts.fps,opts.colors,composer.key()]);$('sizeEstimate').textContent=mb(output.size);$('estimateHint').textContent='本次导出的实际文件大小';
    $('result').hidden=false;progress(100,'转换完成，GIF 已就绪');$('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){status(e.name==='AbortError'?'已取消，可以调整参数后重试':e.message,e.name!=='AbortError')}
  finally{if(v)disposeVideo(v);state.controller=null;setBusy(false)}
};
update();
