import { GifReader } from './vendor/omggif.js';

export function inspectGif(bytes) {
  const reader = new GifReader(bytes);
  if (!reader.numFrames() || !reader.width || !reader.height) throw new Error('GIF 中没有可读取的画面。');
  if (reader.width * reader.height > 16000000) throw new Error('GIF 分辨率过大，请使用小于 1600 万像素的文件。');
  let duration = 0, transparent = false;
  const ends = [];
  for (let i = 0; i < reader.numFrames(); i++) {
    const frame = reader.frameInfo(i);
    if (frame.x + frame.width > reader.width || frame.y + frame.height > reader.height) throw new Error('GIF 帧超出画布范围。');
    duration = Math.round((duration + (frame.delay >= 2 ? frame.delay / 100 : .1)) * 100) / 100;
    ends.push(duration);
    transparent ||= frame.transparent_index !== null;
  }
  return { reader, ends, duration, width:reader.width, height:reader.height, transparent, count:reader.numFrames() };
}

// Keep just a composed frame, a patch, and the optional disposal-3 snapshot.
// Each sampler has independent composition state, while compressed input is shared.
export class GifSource {
  constructor(meta) {
    this.meta=meta;this.videoWidth=meta.width;this.videoHeight=meta.height;this.duration=meta.duration;
    this.surface=document.createElement('canvas');this.surface.width=meta.width;this.surface.height=meta.height;
    this.context=this.surface.getContext('2d',{willReadFrequently:true});
    this.patch=document.createElement('canvas');this.patch.width=meta.width;this.patch.height=meta.height;
    this.patchContext=this.patch.getContext('2d');this.index=-1;this.saved=null;
    this.pixels=new Uint8ClampedArray(meta.width*meta.height*4);
  }
  async seek(time,signal) {
    const check=()=>{if(signal?.aborted)throw new DOMException('已取消','AbortError')};check();
    time=Math.max(0,Math.min(time,this.duration-.000001));
    let target=this.meta.ends.findIndex(end=>time<end-1e-7);if(target<0)target=this.meta.count-1;
    if(target<this.index){this.context.clearRect(0,0,this.videoWidth,this.videoHeight);this.index=-1;this.saved=null}
    for(let i=this.index+1;i<=target;i++){
      check();
      if(i>0){
        const previous=this.meta.reader.frameInfo(i-1);
        if(previous.disposal===2)this.context.clearRect(previous.x,previous.y,previous.width,previous.height);
        else if(previous.disposal===3&&this.saved)this.context.putImageData(this.saved,0,0);
      }
      const frame=this.meta.reader.frameInfo(i);
      this.saved=frame.disposal===3?this.context.getImageData(0,0,this.videoWidth,this.videoHeight):null;
      this.pixels.fill(0);this.meta.reader.decodeAndBlitFrameRGBA(i,this.pixels);
      this.patchContext.putImageData(new ImageData(this.pixels,this.videoWidth,this.videoHeight),0,0);
      this.context.drawImage(this.patch,0,0);this.index=i;
      if(i%8===7)await new Promise(resolve=>setTimeout(resolve,0));
    }
    check();
  }
  dispose(){this.surface.width=0;this.patch.width=0;this.saved=null;this.pixels=null}
}
