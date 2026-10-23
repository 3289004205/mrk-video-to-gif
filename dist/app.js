const $ = id => document.getElementById(id);
const state = {file:null, url:null, busy:false, controller:null, gifUrl:null, thumbs:[], frames:[], thumbToken:0};
const video=$('video');
const mb = n => (n/1000000).toFixed(2)+' MB';
const abortError = () => new DOMException('已取消','AbortError');
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function eventOnce(el,event,signal,timeout=20000){return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',fail);signal?.removeEventListener('abort',abort)};const ok=()=>{clean();resolve()};const fail=()=>{clean();reject(new Error('无法解码该视频，请尝试 H.264 MP4 或 WebM 格式。'))};const abort=()=>{clean();reject(abortError())};el.addEventListener(event,ok,{once:true});el.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{clean();reject(new Error('视频读取超时，请尝试其他视频。'))},timeout);if(signal?.aborted)abort()})}
async function sampler(signal){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';const ready=eventOnce(v,'loadeddata',signal);v.src=state.url;v.load();try{await ready;return v}catch(e){disposeVideo(v);throw e}}
function disposeVideo(v){v.pause();v.removeAttribute('src');v.load()}
async function seek(v,t,signal){if(signal?.aborted)throw abortError();t=Math.max(0,Math.min(t,Math.max(0,v.duration-.001)));if(Math.abs(v.currentTime-t)<.0001&&v.readyState>=2)return;const done=eventOnce(v,'seeked',signal);v.currentTime=t;await done;if(v.readyState<2)await eventOnce(v,'loadeddata',signal)}
function range(){const start=Number($('startTime').value),end=Number($('endTime').value);if(!state.file)throw new Error('请先导入视频。');if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>video.duration+.02||end<=start)throw new Error('请设置有效的起止时间，结束时间必须大于起始时间。');if(end-start>60.01)throw new Error('单次最多转换 60 秒，请缩短截取片段。');return {start,end,duration:end-start}}
function requestedWidth(){const w=Number($('widthSelect').value==='custom'?$('customWidth').value:$('widthSelect').value);if(!Number.isInteger(w)||w<160||w>1280)throw new Error('自定义宽度需为 160–1280 的整数。');return Math.min(w,video.videoWidth||w)}
function dimensions(width){const ratio=video.videoHeight/video.videoWidth;return {width:Math.max(2,Math.round(Math.min(width,1280,1280/ratio))),height:Math.max(2,Math.round(Math.min(width,1280,1280/ratio)*ratio))}}
let estimateTimer, estimateController, estimateKey=null;
function stopEstimate(){clearTimeout(estimateTimer);estimateKey=null;if(estimateController){estimateController.abort();estimateController=null}}
function scheduleEstimate(){
  if(state.busy)return;
  let r,d,fps;
  try{r=range();d=dimensions(requestedWidth());fps=Number($('fpsRange').value)}catch{stopEstimate();estimateKey=null;$('sizeEstimate').textContent='—';$('estimateHint').textContent=state.file?'请设置有效的片段和画面尺寸':'导入视频后，根据尺寸、帧率和片段内容预估';return}
  const key=JSON.stringify([state.url,r.start,r.end,d.width,d.height,fps]);if(key===estimateKey)return;
  stopEstimate();estimateKey=key;
  $('sizeEstimate').textContent='正在预估…';$('estimateHint').textContent='正在采样片段画面，估算 GIF 编码体积';
  estimateTimer=setTimeout(()=>estimateSize(r,{...d,fps},key),400);
}
async function estimateSize(r,opts,key){
  const controller=new AbortController();estimateController=controller;const {signal}=controller;
  let v,worker;
  try{
    v=await sampler(signal);worker=new Worker(new URL('./encoder-worker.js',import.meta.url),{type:'module'});
    await workerCall(worker,{type:'init'},signal);
    const count=Math.max(1,Math.ceil(r.duration*opts.fps)),samples=Math.min(5,count);
    const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(let i=0;i<samples;i++){
      const frame=samples===1?0:Math.round((count-1)*i/(samples-1));
      await seek(v,r.start+frame*r.duration/count,signal);ctx.drawImage(v,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await workerCall(worker,{type:'frame',pixels:pixels.buffer,width:canvas.width,height:canvas.height,colors:256,delay:100,loop:true},signal,[pixels.buffer]);
    }
    const {bytes}=await workerCall(worker,{type:'finish'},signal);
    if(signal.aborted||key!==estimateKey)return;
    const estimate=Math.max(bytes.byteLength,Math.round((bytes.byteLength-32)*count/samples+32));
    $('sizeEstimate').textContent='约 '+mb(estimate);
    $('estimateHint').textContent='根据片段画面采样估算，实际大小以导出结果为准';
  }catch(e){if(e.name!=='AbortError'&&key===estimateKey){$('sizeEstimate').textContent='暂无法预估';$('estimateHint').textContent='可以直接生成 GIF 查看实际大小'}}
  finally{worker?.terminate();if(v)disposeVideo(v);if(estimateController===controller)estimateController=null}
}
function update(){scheduleEstimate();let r;try{r=range()}catch{}$('frameEstimate').textContent=r?Math.ceil(r.duration*Number($('fpsRange').value)):'—';$('durationBadge').textContent=r?r.duration.toFixed(1)+' 秒':'等待导入';$('fpsValue').innerHTML=$('fpsRange').value+' <span>FPS</span>';$('customWrap').hidden=$('widthSelect').value!=='custom';$('generateBtn').disabled=!state.file||state.busy;$('extractBtn').disabled=!state.file||state.busy;if(state.file){try{const d=dimensions(requestedWidth());$('dimensionHint').textContent=d.width+' × '+d.height}catch{$('dimensionHint').textContent='保持原始比例'}}}
function setBusy(busy){state.busy=busy;if(busy)stopEstimate();document.body.classList.toggle('busy',busy);for(const id of ['startTime','endTime','fileInput','replaceBtn','chooseBtn','widthSelect','customWidth','fpsRange','loopToggle'])$(id).disabled=busy||(!state.file&&['startTime','endTime'].includes(id));$('cancelBtn').hidden=!busy;$('progressWrap').hidden=!busy;update()}
function progress(n,text){$('progressBar').style.width=Math.max(0,Math.min(100,n))+'%';status(text)}
function revokeList(key){state[key].forEach(URL.revokeObjectURL);state[key]=[]}
function blobFromCanvas(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('画面导出失败。')),'image/png'))}
async function loadFile(file){if(!file||state.busy)return;if(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v|ogg|ogv)$/i.test(file.name)){status('请选择视频文件。',true);return}state.thumbToken++;if(state.url)URL.revokeObjectURL(state.url);state.file=null;state.url=URL.createObjectURL(file);$('result').hidden=true;$('framesPanel').hidden=true;revokeList('thumbs');revokeList('frames');if(state.gifUrl){URL.revokeObjectURL(state.gifUrl);state.gifUrl=null}status('正在读取视频…');update();const ready=eventOnce(video,'loadeddata');video.src=state.url;try{await ready;if(!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw new Error('视频时长或画面无效，请使用有效的视频文件。');state.file=file;$('dropzone').hidden=true;$('videoArea').hidden=false;$('replaceBtn').hidden=false;$('emptyTag').hidden=true;$('fileName').textContent=file.name;$('fileMeta').textContent=video.videoWidth+' × '+video.videoHeight+' · '+video.duration.toFixed(1)+' 秒 · '+mb(file.size);$('startTime').value=0;$('endTime').value=Math.floor(Math.min(5,video.duration)*1000)/1000;for(const id of ['startTime','endTime']){$(id).disabled=false;$(id).max=video.duration}update();status('视频已就绪，选择片段后即可生成');makeThumbnails()}catch(e){$('videoArea').hidden=true;$('dropzone').hidden=false;$('replaceBtn').hidden=true;$('emptyTag').hidden=false;status(e.message,true);update()}}
async function makeThumbnails(){const token=++state.thumbToken;let v;try{const r=range();v=await sampler();const c=document.createElement('canvas');c.width=160;c.height=Math.max(2,Math.round(160*v.videoHeight/v.videoWidth));const ctx=c.getContext('2d');const urls=[];for(let i=0;i<6;i++){if(token!==state.thumbToken)return;await seek(v,r.start+(r.duration*.99)*i/5);ctx.drawImage(v,0,0,c.width,c.height);const blob=await blobFromCanvas(c);if(token!==state.thumbToken)return;const url=URL.createObjectURL(blob);urls.push(url);state.thumbs.push(url)}if(token!==state.thumbToken)return;const strip=$('filmstrip');strip.replaceChildren();for(const url of urls){const wrap=document.createElement('div'),img=new Image();img.src=url;img.alt='片段预览帧';wrap.append(img);strip.append(wrap)}}catch{}finally{if(v)disposeVideo(v)}}
function invalidate(){if(state.busy)return;$('result').hidden=true;$('framesPanel').hidden=true;update()}
for(const id of ['widthSelect','customWidth','fpsRange','loopToggle'])$(id).addEventListener('input',invalidate);
let thumbTimer;
for(const id of ['startTime','endTime'])$(id).addEventListener('input',()=>{invalidate();state.thumbToken++;clearTimeout(thumbTimer);thumbTimer=setTimeout(()=>{revokeList('thumbs');makeThumbnails()},450)});
$('dropzone').onclick=()=>{if(!state.busy)$('fileInput').click()};$('dropzone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!state.busy)$('fileInput').click()}};$('chooseBtn').onclick=e=>{e.stopPropagation();$('fileInput').click()};$('replaceBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{loadFile(e.target.files[0]);e.target.value=''};
for(const name of ['dragenter','dragover'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.add('dragover')});for(const name of ['dragleave','drop'])$('dropzone').addEventListener(name,e=>{e.preventDefault();$('dropzone').classList.remove('dragover')});$('dropzone').addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
$('closeFrames').onclick=()=>$('framesPanel').hidden=true;
$('cancelBtn').onclick=()=>state.controller?.abort();
function workerCall(worker,data,signal,transfer=[]){return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',error);signal.removeEventListener('abort',abort)};const message=e=>{cleanup();if(e.data.type==='error')reject(new Error(e.data.message));else resolve(e.data)};const error=e=>{cleanup();reject(new Error(e.message||'GIF 编码器无法启动，请刷新后重试。'))};const abort=()=>{cleanup();reject(abortError())};const timer=setTimeout(()=>{cleanup();reject(new Error('编码超时，请缩短片段或减小画面尺寸。'))},90000);worker.addEventListener('message',message,{once:true});worker.addEventListener('error',error,{once:true});signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return}worker.postMessage(data,transfer)})}
async function encode(v,r,opts,signal){
  const worker=new Worker(new URL('./encoder-worker.js',import.meta.url),{type:'module'});
  const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const count=Math.max(1,Math.ceil(r.duration*opts.fps));
  try{
    await workerCall(worker,{type:'init'},signal);
    for(let i=0;i<count;i++){
      await seek(v,r.start+i*r.duration/count,signal);ctx.drawImage(v,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await workerCall(worker,{type:'frame',pixels:pixels.buffer,width:canvas.width,height:canvas.height,colors:256,delay:(Math.round((i+1)*r.duration*100/count)-Math.round(i*r.duration*100/count))*10,loop:opts.loop},signal,[pixels.buffer]);
      progress((i+1)/count*96,`正在转换 · ${i+1} / ${count} 帧`);
    }
    const response=await workerCall(worker,{type:'finish'},signal);
    return {bytes:response.bytes,size:response.bytes.byteLength,count,delay:r.duration*1000/count};
  }finally{worker.terminate()}
}
$('generateBtn').onclick=async()=>{
  let v;
  try{
    const r=range();const opts={...dimensions(requestedWidth()),fps:Number($('fpsRange').value),loop:$('loopToggle').checked};
    state.controller=new AbortController();const {signal}=state.controller;setBusy(true);$('result').hidden=true;video.pause();progress(0,'正在准备视频抽帧…');
    v=await sampler(signal);const output=await encode(v,r,opts,signal);
    if(signal.aborted)throw abortError();if(state.gifUrl)URL.revokeObjectURL(state.gifUrl);
    state.gifUrl=URL.createObjectURL(new Blob([output.bytes],{type:'image/gif'}));$('gifPreview').src=state.gifUrl;$('downloadBtn').href=state.gifUrl;
    $('downloadBtn').download=state.file.name.replace(/\.[^.]+$/,'')+'_'+r.start+'-'+r.end+'.gif';
    $('resultMeta').textContent=`实际大小 ${mb(output.size)} · ${opts.width} × ${opts.height} px · ${output.count} 帧 · ${(1000/output.delay).toFixed(1)} FPS`;
    $('outputNote').textContent='已按所选尺寸与帧率导出，保留完整片段。';
    estimateKey=JSON.stringify([state.url,r.start,r.end,opts.width,opts.height,opts.fps]);$('sizeEstimate').textContent=mb(output.size);$('estimateHint').textContent='本次导出的实际文件大小';
    $('result').hidden=false;progress(100,'转换完成，GIF 已就绪');$('result').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){status(e.name==='AbortError'?'已取消，可以调整参数后重试':e.message,e.name!=='AbortError')}
  finally{if(v)disposeVideo(v);state.controller=null;setBusy(false)}
};
$('extractBtn').onclick=async()=>{let v;try{const r=range();state.controller=new AbortController();const {signal}=state.controller;setBusy(true);video.pause();revokeList('frames');$('framesGrid').replaceChildren();$('framesPanel').hidden=true;progress(0,'正在抽取原尺寸画面帧…');v=await sampler(signal);const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');for(let i=0;i<8;i++){const t=r.start+r.duration*.99*i/7;await seek(v,t,signal);ctx.drawImage(v,0,0);const blob=await blobFromCanvas(canvas);if(signal.aborted)throw abortError();const url=URL.createObjectURL(blob);state.frames.push(url);const a=document.createElement('a');a.href=url;a.download=state.file.name.replace(/\.[^.]+$/,'')+'_'+t.toFixed(2)+'s.png';a.className='frame-link';const img=new Image();img.src=url;img.alt=t.toFixed(2)+' 秒画面';const span=document.createElement('span');span.textContent=t.toFixed(2)+' 秒 · 下载 PNG ↓';a.append(img,span);$('framesGrid').append(a);progress((i+1)/8*100,`正在抽帧 ${i+1} / 8`)}$('framesPanel').hidden=false;status('已抽取 8 张原尺寸 PNG，点击画面即可下载');$('framesPanel').scrollIntoView({behavior:'smooth',block:'nearest'})}catch(e){revokeList('frames');$('framesGrid').replaceChildren();status(e.name==='AbortError'?'已取消抽帧':e.message,e.name!=='AbortError')}finally{if(v)disposeVideo(v);state.controller=null;setBusy(false)}};
update();
