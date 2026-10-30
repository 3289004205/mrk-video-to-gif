// Keep the original eight bits per RGB channel, including on transparent frames.
// Invisible RGB values never contribute to the palette.
const weights=[.299,.587,.114];
const rgb=key=>[(key>>>16)&255,(key>>>8)&255,key&255];
const colorKey=c=>(c[0]<<16)|(c[1]<<8)|c[2];
export function sampleColors(histogram,pixels,transparent,limit=8192){
  const total=pixels.length/4,count=Math.min(total,limit);
  for(let i=0;i<count;i++){
    const at=Math.floor((i+.5)*total/count)*4;
    if(transparent&&pixels[at+3]<128)continue;
    const key=(pixels[at]<<16)|(pixels[at+1]<<8)|pixels[at+2];
    histogram.set(key,(histogram.get(key)||0)+1);
  }
}
function box(points){
  let mass=0;const sum=[0,0,0],squares=[0,0,0];
  for(const p of points){mass+=p.n;for(let c=0;c<3;c++){sum[c]+=p.c[c]*p.n;squares[c]+=p.c[c]*p.c[c]*p.n}}
  const errors=sum.map((s,c)=>Math.max(0,squares[c]-s*s/mass)*weights[c]);
  const axis=errors.indexOf(Math.max(...errors));
  return {points,mass,mean:sum.map(s=>Math.round(s/mass)),axis,score:errors.reduce((a,b)=>a+b,0)};
}
function nearestLookup(palette){
  function tree(indices,depth=0){
    if(!indices.length)return null;const axis=depth%3;
    indices.sort((a,b)=>palette[a][axis]-palette[b][axis]||a-b);
    const middle=indices.length>>1;
    return {index:indices[middle],axis,left:tree(indices.slice(0,middle),depth+1),right:tree(indices.slice(middle+1),depth+1)};
  }
  const root=tree(palette.map((_,i)=>i)),cache=new Map();
  let red,green,blue,best,distance;
  function visit(node){
    if(!node)return;const candidate=palette[node.index];
    const d=(red-candidate[0])**2*weights[0]+(green-candidate[1])**2*weights[1]+(blue-candidate[2])**2*weights[2];
    if(d<distance){distance=d;best=node.index}
    const delta=(node.axis===0?red:node.axis===1?green:blue)-candidate[node.axis];
    visit(delta<0?node.left:node.right);
    if(delta*delta*weights[node.axis]<=distance)visit(delta<0?node.right:node.left);
  }
  return (r,g,b)=>{
    const key=(r<<16)|(g<<8)|b;if(cache.has(key))return cache.get(key);
    red=r;green=g;blue=b;best=0;distance=Infinity;
    visit(root);if(cache.size<65536)cache.set(key,best);return best;
  };
}
export function buildPalette(histogram,budget){
  budget=Math.max(1,Math.min(256,Math.floor(budget)));
  const points=Array.from(histogram,([key,n])=>({c:rgb(key),n}));
  if(!points.length)return [[0,0,0]];
  if(points.length<=budget)return points.map(p=>p.c).sort((a,b)=>colorKey(a)-colorKey(b));
  const boxes=[box(points)];
  while(boxes.length<budget){
    let index=-1,score=-1;
    for(let i=0;i<boxes.length;i++)if(boxes[i].points.length>1&&boxes[i].score>score){index=i;score=boxes[i].score}
    if(index<0)break;
    const current=boxes[index],sorted=current.points.sort((a,b)=>a.c[current.axis]-b.c[current.axis]);
    let mass=0,split=1;
    for(let i=0;i<sorted.length-1;i++){mass+=sorted[i].n;split=i+1;if(mass>=current.mass/2)break}
    boxes.splice(index,1,box(sorted.slice(0,split)),box(sorted.slice(split)));
  }
  let palette=boxes.map(b=>b.mean);
  // Refine the weighted clusters in full RGB precision rather than coarse bins.
  for(let pass=0;pass<2;pass++){
    const nearest=nearestLookup(palette),sums=palette.map(()=>[0,0,0,0]);
    for(const point of points){const sum=sums[nearest(...point.c)];sum[3]+=point.n;for(let c=0;c<3;c++)sum[c]+=point.c[c]*point.n}
    palette=palette.map((p,i)=>sums[i][3]?sums[i].slice(0,3).map(v=>Math.round(v/sums[i][3])):p);
  }
  return Array.from(new Map(palette.map(c=>[colorKey(c),c])).values()).sort((a,b)=>colorKey(a)-colorKey(b));
}
export function createColorMapper(palette,transparent){
  const nearest=nearestLookup(palette),offset=transparent?1:0;
  return (pixels,width,height)=>{
    const indexed=new Uint8Array(width*height);
    let row=new Float32Array((width+2)*3),next=new Float32Array(row.length);
    const opaque=(x,y)=>x>=0&&x<width&&y<height&&(!transparent||pixels[(y*width+x)*4+3]>=128);
    const spread=(target,x,y,factor,er,eg,eb)=>{if(!opaque(x,y))return;const at=(x+1)*3;target[at]+=er*factor;target[at+1]+=eg*factor;target[at+2]+=eb*factor};
    for(let y=0;y<height;y++){
      const direction=y%2?-1:1;
      for(let x=direction===1?0:width-1;x>=0&&x<width;x+=direction){
        const index=y*width+x,at=index*4,errorAt=(x+1)*3;
        if(!opaque(x,y)){indexed[index]=0;continue}
        const red=Math.round(Math.max(0,Math.min(255,pixels[at]+row[errorAt])));
        const green=Math.round(Math.max(0,Math.min(255,pixels[at+1]+row[errorAt+1])));
        const blue=Math.round(Math.max(0,Math.min(255,pixels[at+2]+row[errorAt+2])));
        const match=nearest(red,green,blue);indexed[index]=match+offset;
        const er=red-palette[match][0],eg=green-palette[match][1],eb=blue-palette[match][2];
        // Serpentine Floyd–Steinberg. Never diffuse error through a transparent hole.
        spread(row,x+direction,y,7/16,er,eg,eb);spread(next,x-direction,y+1,3/16,er,eg,eb);
        spread(next,x,y+1,5/16,er,eg,eb);spread(next,x+direction,y+1,1/16,er,eg,eb);
      }
      [row,next]=[next,row];next.fill(0);
    }
    return indexed;
  };
}
