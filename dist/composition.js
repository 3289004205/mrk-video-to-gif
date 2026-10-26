const $=id=>document.getElementById(id);
const copy=rect=>({...rect});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const presets={'1:1':[480,480],'4:3':[640,480],'3:4':[480,640],'16:9':[960,540],'9:16':[540,960]};

export function paintComposition(ctx,source,width,height,layout){
  ctx.clearRect(0,0,width,height);
  if(layout.background!=='transparent'){ctx.fillStyle=layout.background;ctx.fillRect(0,0,width,height)}
  const r=layout.media;
  ctx.drawImage(source.surface||source,r.x*width,r.y*height,r.w*width,r.h*height);
  for(const layer of [layout.overlay,layout.shell]){if(layer){const o=layer.rect;ctx.drawImage(layer.image,o.x*width,o.y*height,o.w*width,o.h*height)}}
}

export function createComposer({onChange,onStatus,isBusy}){
  let sourceWidth=0,sourceHeight=0,active='media',pending=false,overlay=null,shell=null;
  let media={x:0,y:0,w:1,h:1};
  const ratioLocks={media:true,overlay:true,shell:false};
  const frame=$('compositionFrame'),viewport=$('stageViewport');
  const controlIds=['ratioSelect','outputWidth','outputHeight','backgroundSelect','selectMedia','selectOverlay','layerX','layerY','layerWidth','layerHeight','lockAspect','fitContain','fitCover','fitStretch','uploadOverlay','overlayInput','removeOverlay','selectShell','uploadShell','shellInput','removeShell','previewPlay'];
  function dimensions(){
    const width=Number($('outputWidth').value),height=Number($('outputHeight').value);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||width>1920||height>1920)throw new Error('画布宽高需为 32–1920 的整数。');
    return {width,height};
  }
  function itemFor(which){return which==='shell'?shell:which==='overlay'?overlay:null}
  function current(){return itemFor(active)?.rect||media}
  function fitRect(kind='contain',which=active){
    const {width,height}=dimensions();const item=itemFor(which);
    const w=item?item.image.naturalWidth:sourceWidth,h=item?item.image.naturalHeight:sourceHeight;
    if(!w||!h)return;
    let rect;
    if(kind==='stretch')rect={x:0,y:0,w:1,h:1};
    else{const scale=(kind==='cover'?Math.max:Math.min)(width/w,height/h);const rw=w*scale/width,rh=h*scale/height;rect={x:(1-rw)/2,y:(1-rh)/2,w:rw,h:rh}}
    if(item)item.rect=rect;else media=rect;
  }
  function render(){
    let d;try{d=dimensions()}catch{return}
    const availableWidth=Math.max(1,viewport.clientWidth),availableHeight=Math.max(1,viewport.clientHeight);
    const scale=Math.min(availableWidth/d.width,availableHeight/d.height);
    frame.style.width=d.width*scale+'px';frame.style.height=d.height*scale+'px';
    frame.style.background=$('backgroundSelect').value==='transparent'?'repeating-conic-gradient(#e4e6eb 0% 25%,#fafafa 0% 50%) 50% / 16px 16px':$('backgroundSelect').value;
    for(const [id,rect,name] of [['mediaLayer',media,'media'],['overlayLayer',overlay?.rect,'overlay'],['shellLayer',shell?.rect,'shell']]){
      const el=$(id);el.classList.toggle('selected',active===name);el.style.pointerEvents=active===name?'auto':'none';
      if(rect){el.style.left=rect.x*100+'%';el.style.top=rect.y*100+'%';el.style.width=rect.w*100+'%';el.style.height=rect.h*100+'%'}
    }
    $('overlayLayer').hidden=!overlay;$('shellLayer').hidden=!shell;
    for(const [id,name] of [['selectMedia','media'],['selectOverlay','overlay'],['selectShell','shell']]){
      $(id).classList.toggle('active',active===name);$(id).setAttribute('aria-pressed',String(active===name));
    }
    const r=current();
    for(const [id,value] of [['layerX',r.x*d.width],['layerY',r.y*d.height],['layerWidth',r.w*d.width],['layerHeight',r.h*d.height]]){
      if(document.activeElement!==$(id))$(id).value=Math.round(value*10)/10;
    }
    $('dimensionHint').textContent=d.width+' × '+d.height;
  }
  function syncDisabled(){
    let invalid=false;try{dimensions()}catch{invalid=true}
    for(const id of controlIds)$(id).disabled=isBusy()||pending;
    for(const id of ['selectMedia','layerX','layerY','layerWidth','layerHeight','lockAspect','fitContain','fitCover','fitStretch','uploadOverlay','uploadShell','previewPlay'])if(!sourceWidth||invalid)$(id).disabled=true;
    $('selectOverlay').disabled=isBusy()||pending||!overlay||!sourceWidth;
    $('removeOverlay').hidden=!overlay;
    $('selectShell').disabled=isBusy()||pending||!shell||!sourceWidth;$('removeShell').hidden=!shell;
    frame.classList.toggle('locked',isBusy()||pending||invalid);
  }
  function emit(){render();syncDisabled();onChange()}
  function select(which){if(which!=='media'&&!itemFor(which))return;active=which;$('lockAspect').checked=ratioLocks[active];render()}
  function resetFit(){fitRect('contain','media')}
  $('ratioSelect').addEventListener('input',()=>{
    const preset=presets[$('ratioSelect').value];
    if(preset){$('outputWidth').value=preset[0];$('outputHeight').value=preset[1]}
    else if($('ratioSelect').value==='original'){
      let w=480,h=Math.round(w*(sourceHeight||270)/(sourceWidth||480));if(h>1920){w=Math.round(w*1920/h);h=1920}
      $('outputWidth').value=clamp(w,32,1920);$('outputHeight').value=clamp(h,32,1920);
    }
    try{resetFit()}catch{}emit();
  });
  for(const id of ['outputWidth','outputHeight'])$(id).addEventListener('input',()=>{
    const ratio=$('ratioSelect').value;
    if(ratio!=='custom'){
      const pair=presets[ratio]||[sourceWidth||480,sourceHeight||270];
      const value=Number($(id).value);
      if(Number.isInteger(value)&&value>=32&&value<=1920){
        if(id==='outputWidth')$('outputHeight').value=Math.round(value*pair[1]/pair[0]);
        else $('outputWidth').value=Math.round(value*pair[0]/pair[1]);
      }
    }
    try{resetFit()}catch{}emit();
  });
  $('backgroundSelect').addEventListener('input',emit);
  $('lockAspect').addEventListener('change',()=>ratioLocks[active]=$('lockAspect').checked);
  $('selectMedia').onclick=()=>select('media');$('selectOverlay').onclick=()=>select('overlay');$('selectShell').onclick=()=>select('shell');
  for(const [id,kind] of [['fitContain','contain'],['fitCover','cover'],['fitStretch','stretch']])$(id).onclick=()=>{try{fitRect(kind);if(kind==='stretch'){ratioLocks[active]=false;$('lockAspect').checked=false;}emit()}catch(e){onStatus(e.message,true)}};
  for(const [id,key] of [['layerX','x'],['layerY','y'],['layerWidth','w'],['layerHeight','h']]){
    $(id).addEventListener('input',()=>{
      if(isBusy())return;const value=Number($(id).value);if($(id).value===''||!Number.isFinite(value)||(key==='w'||key==='h')&&value<1)return;
      const d=dimensions(),r=current(),old=copy(r);
      r[key]=clamp(value,-d.width*4,d.width*4)/(key==='x'||key==='w'?d.width:d.height);
      if($('lockAspect').checked){if(key==='w')r.h=old.h*r.w/old.w;if(key==='h')r.w=old.w*r.h/old.h}
      emit();
    });
    $(id).addEventListener('blur',render);
  }
  let drag=null;
  frame.addEventListener('pointerdown',event=>{
    if(isBusy()||pending||!sourceWidth||event.button!==0)return;try{dimensions()}catch{return}
    const layer=event.target.closest('[data-layer]');if(!layer)return;
    event.preventDefault();select(layer.dataset.layer);
    const bounds=frame.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,rect:copy(current()),corner:event.target.dataset.corner,bounds,ratioLock:$('lockAspect').checked};
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=(event.clientX-drag.x)/drag.bounds.width,dy=(event.clientY-drag.y)/drag.bounds.height;
    const old=drag.rect,r=current();
    if(!drag.corner){r.x=clamp(old.x+dx,-4,4);r.y=clamp(old.y+dy,-4,4)}
    else{
      const west=drag.corner.includes('w'),north=drag.corner.includes('n');
      const horizontal=west||drag.corner.includes('e'),vertical=north||drag.corner.includes('s');
      let w=horizontal?clamp(old.w+(west?-dx:dx),1/dimensions().width,4):old.w;
      let h=vertical?clamp(old.h+(north?-dy:dy),1/dimensions().height,4):old.h;
      if(drag.ratioLock){
        const fw=w/old.w,fh=h/old.h;
        const factor=horizontal&&!vertical?fw:vertical&&!horizontal?fh:Math.abs(fw-1)>Math.abs(fh-1)?fw:fh;
        w=old.w*factor;h=old.h*factor;
      }
      r.w=w;r.h=h;r.x=west?old.x+old.w-w:drag.ratioLock&&!horizontal?old.x+(old.w-w)/2:old.x;
      r.y=north?old.y+old.h-h:drag.ratioLock&&!vertical?old.y+(old.h-h)/2:old.y;
    }
    render();
  });
  function endDrag(event){if(!drag||event.pointerId!==drag.id)return;drag=null;emit()}
  frame.addEventListener('pointerup',endDrag);frame.addEventListener('pointercancel',endDrag);
  for(const type of ['overlay','shell']){
    const cap=type[0].toUpperCase()+type.slice(1),label=type==='shell'?'PNG 外壳':'PNG 叠图';
    $('upload'+cap).onclick=()=>$(type+'Input').click();
    $(type+'Input').onchange=async event=>{
      const file=event.target.files[0];event.target.value='';if(!file||isBusy()||pending)return;
      if(file.type!=='image/png'&&!/\.png$/i.test(file.name)){onStatus('请选择 PNG 图片。',true);return}
      pending=true;emit();let url;
      try{
        const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
        if([137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n))throw new Error('文件不是有效的 PNG 图片。');
        url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
        if(image.naturalWidth*image.naturalHeight>16000000)throw new Error('PNG 最多支持 1600 万像素。');
        const previous=itemFor(type);if(previous)URL.revokeObjectURL(previous.url);
        const item={image,url,name:file.name,rect:{x:0,y:0,w:1,h:1}};url=null;
        if(type==='shell')shell=item;else overlay=item;
        $(type+'Preview').src=item.url;$(type+'Name').textContent=file.name;$('upload'+cap).textContent='↻ 更换 '+label;
        ratioLocks[type]=type!=='shell';select(type);fitRect(type==='shell'?'stretch':'contain');
        onStatus(type==='shell'?'PNG 外壳已盖在最上方，可自由拉伸宽高；透明区域露出下方视频和叠图':'PNG 叠图已添加，可独立调整位置和大小');
      }catch(e){onStatus('PNG 读取失败：'+e.message,true)}
      finally{if(url)URL.revokeObjectURL(url);pending=false;emit()}
    };
    $('remove'+cap).onclick=()=>{
      const item=itemFor(type);if(item)URL.revokeObjectURL(item.url);
      if(type==='shell')shell=null;else overlay=null;
      select('media');$(type+'Preview').removeAttribute('src');
      $(type+'Name').textContent=type==='shell'?'透明区域露出下方视频 / GIF':'普通叠图，位于视频和外壳之间';
      $('upload'+cap).textContent='＋ 上传 '+label;emit();
    };
  }
  $('previewPlay').onclick=()=>{
    const v=$('video');if(v.hidden)return;
    if(v.paused)v.play().catch(e=>onStatus('预览播放失败：'+e.message,true));else v.pause();
  };
  $('video').addEventListener('play',()=>$('previewPlay').textContent='Ⅱ 暂停预览');
  $('video').addEventListener('pause',()=>$('previewPlay').textContent='▶ 播放预览');
  new ResizeObserver(render).observe(viewport);
  render();syncDisabled();
  return {
    dimensions,
    get pending(){return pending},
    setBusy(){syncDisabled()},
    setSource(width,height,isGif){
      sourceWidth=width;sourceHeight=height;select('media');
      $('previewPlay').hidden=!!isGif;
      if(width&&$('ratioSelect').value==='original'){
        let w=480,h=Math.round(w*height/width);if(h>1920){w=Math.round(w*1920/h);h=1920}
        $('outputWidth').value=clamp(w,32,1920);$('outputHeight').value=clamp(h,32,1920);
      }
      try{resetFit()}catch{}render();syncDisabled();
    },
    snapshot(){
      if(pending)throw new Error('正在读取 PNG，请稍候。');
      dimensions();return {media:copy(media),overlay:overlay?{image:overlay.image,rect:copy(overlay.rect)}:null,shell:shell?{image:shell.image,rect:copy(shell.rect)}:null,background:$('backgroundSelect').value};
    },
    key(){return JSON.stringify([media,overlay?.url,overlay?.rect,shell?.url,shell?.rect,$('backgroundSelect').value])}
  };
}
