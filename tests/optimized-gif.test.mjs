import test from 'node:test';
import assert from 'node:assert/strict';
import {OptimizedGif} from '../dist/optimized-gif.js';
import {GifReader} from '../dist/vendor/omggif.js';
import {GIFEncoder} from '../dist/vendor/gifenc.js';

const palette=[[0,0,0],[40,80,120],[240,150,20],[230,230,230]];
function encode(frames,width,height,loop=true){
  const encoder=new OptimizedGif(width,height,palette,loop);
  for(const frame of frames)encoder.addFrame(frame.pixels,frame.delay);
  const bytes=encoder.finish();return {bytes,reader:new GifReader(bytes),count:encoder.count};
}
function verify(frames,width,height,loop=true){
  const result=encode(frames,width,height,loop),canvas=new Uint8Array(width*height*4);
  let previous=null;
  for(let cycle=0;cycle<(loop?2:1);cycle++){
    let time=0,index=0,sourceEnd=frames[0].delay;
    for(let i=0;i<result.count;i++){
      if(previous?.disposal===2)for(let y=previous.y;y<previous.y+previous.height;y++)canvas.fill(0,(y*width+previous.x)*4,(y*width+previous.x+previous.width)*4);
      result.reader.decodeAndBlitFrameRGBA(i,canvas);const info=result.reader.frameInfo(i);
      for(let tick=0;tick<info.delay*10;tick+=10){
        while(time>=sourceEnd&&index<frames.length-1){index++;sourceEnd+=frames[index].delay}
        const expected=frames[index].pixels;
        for(let p=0;p<expected.length;p++){
          const at=p*4,color=expected[p];assert.equal(canvas[at+3],color===0?0:255,`alpha cycle ${cycle}, frame ${i}, pixel ${p}`);
          if(color)assert.deepEqual(Array.from(canvas.subarray(at,at+3)),palette[color],`color cycle ${cycle}, frame ${i}, pixel ${p}`);
        }
        time+=10;
      }
      previous=info;
    }
    assert.equal(time,frames.reduce((sum,f)=>sum+f.delay,0));
  }
  return result;
}
test('moving object uses cropped transparent deltas without ghosts, including loop restart',()=>{
  const width=40,height=24,frames=[];
  for(let i=0;i<8;i++){
    const pixels=new Uint8Array(width*height).fill(1);
    for(let y=6;y<10;y++)for(let x=i*2+2;x<i*2+6;x++)pixels[y*width+x]=2;
    frames.push({pixels,delay:100});
  }
  const result=verify(frames,width,height);
  assert(result.reader.frameInfo(1).width<width);assert(result.reader.frameInfo(1).height<height);
});
test('opaque pixels becoming transparent clear correctly, even across the loop boundary',()=>{
  const width=5,height=3,frames=[];
  for(const x of [2,3,1]){const pixels=new Uint8Array(width*height);pixels[width+x]=2;frames.push({pixels,delay:100})}
  const result=verify(frames,width,height);assert.equal(result.reader.frameInfo(0).disposal,2);
});
test('identical frames merge without changing total playback duration',()=>{
  const pixels=new Uint8Array(20*12).fill(1),frames=Array.from({length:10},()=>({pixels:pixels.slice(),delay:100}));
  const result=verify(frames,20,12,false);assert.equal(result.count,1);assert.equal(result.reader.frameInfo(0).delay,100);
});
test('fully transparent frames hold for their duration, without leaving old pixels',()=>{
  verify([{pixels:new Uint8Array([0,1,0,0]),delay:100},{pixels:new Uint8Array(4),delay:200},{pixels:new Uint8Array([0,0,2,0]),delay:100}],2,2);
});
test('long repeated holds split before the GIF delay field overflows',()=>{
  const frames=Array.from({length:700},()=>({pixels:new Uint8Array([1]),delay:1000}));
  const result=encode(frames,1,1);assert(result.count>=2);
  let delay=0;for(let i=0;i<result.count;i++){const ticks=result.reader.frameInfo(i).delay;assert(ticks>0&&ticks<=65535);delay+=ticks*10}
  assert.equal(delay,700000);
});
test('790px layout with a fixed shell and small moving area is smaller than full-frame encoding',()=>{
  const width=790,height=444,frames=[];
  for(let i=0;i<20;i++){
    const pixels=new Uint8Array(width*height).fill(1);
    for(let y=80;y<120;y++)for(let x=100+i*3;x<140+i*3;x++)pixels[y*width+x]=2;
    frames.push({pixels,delay:100});
  }
  const original=GIFEncoder();
  for(let i=0;i<frames.length;i++)original.writeFrame(frames[i].pixels,width,height,{palette:i?null:palette,delay:100,transparent:true,transparentIndex:0,dispose:2});
  original.finish();const result=encode(frames,width,height);
  assert(result.bytes.length<original.bytes().length*.4,`${result.bytes.length} vs ${original.bytes().length}`);
  console.log(`790px fixed-background fixture: ${original.bytes().length} → ${result.bytes.length} bytes`);
});

test('full 256-entry palette and dynamically grown buffer preserve all visible indices',()=>{
  const width=128,height=96,pal=Array.from({length:256},(_,i)=>[i,(i*47)%256,(i*83)%256]);
  const pixels=Uint8Array.from({length:width*height},(_,i)=>i%255+1);
  const encoder=new OptimizedGif(width,height,pal,false);encoder.addFrame(pixels,100);
  const bytes=encoder.finish(),reader=new GifReader(bytes),rgba=new Uint8Array(pixels.length*4);reader.decodeAndBlitFrameRGBA(0,rgba);
  assert.equal(reader.loopCount(),null);
  for(let i=0;i<pixels.length;i++)assert.deepEqual(Array.from(rgba.subarray(i*4,i*4+4)),[...pal[pixels[i]],255]);
});
