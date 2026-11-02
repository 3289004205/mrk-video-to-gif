import {GifWriter} from './vendor/omggif.js?v=13.0';

// One-frame lookahead lets us clear the full canvas only when the next frame
// actually removes opaque pixels. Otherwise, write just a transparent delta.
export class OptimizedGif {
  constructor(width,height,palette,loop){
    this.width=width;this.height=height;this.loop=loop;this.count=0;
    this.buffer=new Uint8Array(4096);this.base=new Uint8Array(width*height);
    const table=palette.map(c=>(c[0]<<16)|(c[1]<<8)|c[2]);
    const length=Math.max(2,2**Math.ceil(Math.log2(table.length)));
    while(table.length<length)table.push(0);
    this.writer=new GifWriter(this.buffer,width,height,{palette:table,loop:loop?0:null});
    this.headerBytes=this.writer.getOutputBufferPosition();this.pending=null;this.first=null;
  }
  get size(){return this.writer.getOutputBufferPosition()}
  addFrame(pixels,delay){
    if(pixels.length!==this.width*this.height)throw new Error('GIF 帧尺寸不一致。');
    if(!Number.isInteger(delay)||delay<10||delay>655350||delay%10)throw new Error('GIF 帧延迟无效。');
    if(!this.first)this.first=pixels.slice();
    if(this.pending){
      let identical=true,clear=false;
      for(let i=0;i<pixels.length;i++){
        if(this.pending.pixels[i]!==pixels[i])identical=false;
        if(this.pending.pixels[i]!==0&&pixels[i]===0)clear=true;
      }
      if(identical&&this.pending.delay+delay<=655350){this.pending.delay+=delay;return}
      this.flush(clear);
    }
    this.pending={pixels,delay};
  }
  flush(clear){
    const frame=this.pending;if(!frame)return;
    const {width,height}=this;let x=0,y=0,w=width,h=height,patch=frame.pixels;
    if(this.count>0&&!clear){
      let left=width,top=height,right=-1,bottom=-1;
      for(let i=0;i<patch.length;i++)if(patch[i]!==this.base[i]){
        const xx=i%width,yy=Math.floor(i/width);left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);
      }
      if(right<0){w=1;h=1;patch=new Uint8Array(1)}
      else{
        x=left;y=top;w=right-left+1;h=bottom-top+1;patch=new Uint8Array(w*h);
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
          const at=(y+yy)*width+x+xx;
          if(frame.pixels[at]!==this.base[at])patch[yy*w+xx]=frame.pixels[at];
        }
      }
    }
    // LZW never needs two bytes per input index; reserve room before the write.
    const need=this.size+patch.length*2+2048;
    if(need>this.buffer.length){const next=new Uint8Array(Math.max(need,this.buffer.length*2));next.set(this.buffer.subarray(0,this.size));this.buffer=next;this.writer.setOutputBuffer(next)}
    this.writer.addFrame(x,y,w,h,patch,{delay:frame.delay/10,transparent:0,disposal:clear?2:1});
    this.base=clear?new Uint8Array(width*height):frame.pixels;this.pending=null;this.count++;
  }
  finish(){
    if(!this.pending)throw new Error('GIF 中没有可编码的画面。');
    let clear=false;
    if(this.loop)for(let i=0;i<this.first.length;i++)if(this.pending.pixels[i]!==0&&this.first[i]===0){clear=true;break}
    this.flush(clear);this.writer.end();return this.buffer.slice(0,this.size);
  }
}
