// 预计算每月版图：国家（板块）与城市（公司）的幂图站点与权重
const fs=require('fs');
const d3=Object.assign({},require('d3'),require('d3-weighted-voronoi'),require('d3-voronoi-map'));
const OUTD=require('path').join(__dirname,'out')+'/';
const frames=JSON.parse(fs.readFileSync(OUTD+'frames_sel.json'));
const page=JSON.parse(fs.readFileSync(OUTD+'page_data.json'));
const sectors=page.sectors;
// 大陆轮廓：凸的超椭圆，略呈卵形
const W=1000,H=660,cx=500,cy=330,A=478,B=312;
let pts=[];
for(let i=0;i<96;i++){const t=i/96*2*Math.PI, c=Math.cos(t), s=Math.sin(t), n=2.4;
  let x=Math.sign(c)*Math.pow(Math.abs(c),2/n)*A, y=Math.sign(s)*Math.pow(Math.abs(s),2/n)*B;
  x*=1+0.035*Math.sin(t*1+0.6); y*=1+0.03*Math.cos(t*2-0.4);
  pts.push([cx+x,cy+y]);}
let clip=d3.polygonHull(pts);  // 保证凸
// polygonHull 返回顺时针？统一成逆时针
if(d3.polygonArea(clip)<0) clip=clip.reverse();
const HOME={bank:[0.02,0.02],broker:[0.24,-0.1],insur:[0.2,0.2],estate:[-0.26,0.12],build:[-0.42,0.3],bmat:[-0.47,0.02],
 baijiu:[0.44,0.38],food:[0.32,0.6],appl:[0.12,0.62],pharma:[0.62,0.12],agri:[0.56,0.58],light:[0.74,0.4],trade:[0.3,0.36],
 auto:[-0.18,0.55],power:[0.0,0.4],mach:[-0.44,0.6],defense:[-0.66,0.42],
 elec:[0.6,-0.22],semi:[0.82,-0.06],ai:[0.76,-0.38],telecom:[0.48,-0.42],soft:[0.84,0.18],media:[0.7,0.28],
 oil:[-0.1,-0.5],coal:[-0.36,-0.46],metal:[0.12,-0.62],steel:[-0.58,-0.28],chem:[0.3,-0.5],
 util:[-0.74,0.0],transp:[-0.72,-0.5]};
function home(k){const h=HOME[k];return [cx+h[0]*A*0.86, cy+h[1]*B*0.86];}
function seeded(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function insidePoint(poly,prng,near){
  if(near && d3.polygonContains(poly,near)) return near;
  const c=d3.polygonCentroid(poly);
  if(near){ // 向质心收缩直到落在多边形内
    for(let f=0.8;f>=0;f-=0.2){const p=[c[0]+(near[0]-c[0])*f,c[1]+(near[1]-c[1])*f]; if(d3.polygonContains(poly,p)) return p;}
  }
  const ext=d3.extent(poly,p=>p[0]), eyt=d3.extent(poly,p=>p[1]);
  for(let k=0;k<200;k++){const p=[ext[0]+prng()*(ext[1]-ext[0]),eyt[0]+prng()*(eyt[1]-eyt[0])]; if(d3.polygonContains(poly,p)) return p;}
  return c;
}
function runMap(data,clipPoly,prevPos,prevW,seed,homeFn){
  for(let attempt=0;attempt<6;attempt++){
    try{ return runMap1(data,clipPoly,attempt<2?prevPos:(attempt<4?prevPos:new Map()),attempt===0?prevW:new Map(),seed+attempt*97,homeFn,attempt); }
    catch(e){ fails++; }
  }
  throw new Error('layout failed');
}
let fails=0;
function runMap1(data,clipPoly,prevPos,prevW,seed,homeFn,attempt){
  const prng=seeded(seed);
  const area=Math.abs(d3.polygonArea(clipPoly));
  const sim=d3.voronoiMapSimulation(data).weight(d=>d.v).clip(clipPoly)
    .convergenceRatio(0.006).maxIterationCount(400).minWeightRatio(0.01).prng(prng)
    .initialPosition((d)=>{let p=prevPos.get(d.id)||(homeFn?homeFn(d):null);
       if(p&&attempt>0){p=[p[0]+(prng()-0.5)*attempt*6,p[1]+(prng()-0.5)*attempt*6];}
       return insidePoint(clipPoly,prng,p);})
    .initialWeight((d)=>{const w=prevW.get(d.id);return (w&&w>0)?w:area/data.length*0.05;})
    .stop();
  let st=sim.state(); while(!st.ended){sim.tick(); st=sim.state();}
  return st;
}
const out={clip:clip.map(p=>[+p[0].toFixed(1),+p[1].toFixed(1)]),W,H,frames:[]};
let cPos=new Map(),cW=new Map(); const sub={}; // sub[k] = {pos,w}
let worst=0;
for(let t=0;t<frames.length;t++){
  const fr=frames[t];
  const data=fr.map(([k,v,cells])=>({id:k,k:sectors[k][0],v}));
  const st=runMap(data,clip,cPos,cW,1000+t,d=>home(d.k));
  worst=Math.max(worst,st.convergenceRatio);
  const ncPos=new Map(),ncW=new Map(); const ctry=[]; const cellsOut=[];
  for(const poly of st.polygons){ if(!poly) continue;
    const s=poly.site, k=s.originalObject.data.originalData.id;
    ncPos.set(k,[s.x,s.y]); ncW.set(k,s.weight);
  }
  for(const [k,v,cells] of fr){
    const poly=st.polygons.find(p=>p&&p.site.originalObject.data.originalData.id===k);
    if(!poly){ctry.push([k,null]);continue;}
    const s=poly.site;
    const S=sub[k]||(sub[k]={pos:new Map(),w:new Map()});
    const cdata=cells.map(c=>({id:c[0],v:Math.max(c[1],1e-3)}));
    let cst;
    if(cdata.length===1){cst={polygons:[Object.assign(poly.slice(),{site:{x:s.x,y:s.y,weight:0,originalObject:{data:{originalData:cdata[0]}}}})]};}
    else{
      // 平移上一帧的城市位置：随国家的站点一起移动
      const prevC=cPos.get(k); const dx=prevC?s.x-prevC[0]:0, dy=prevC?s.y-prevC[1]:0;
      const moved=new Map(); for(const [id,p] of S.pos) moved.set(id,[p[0]+dx,p[1]+dy]);
      cst=runMap(cdata,poly,moved,S.w,7000+t*31+k,null);
    }
    const npos=new Map(),nw=new Map(); const arr=[];
    for(const cp of cst.polygons){ if(!cp) continue; const cs=cp.site, id=cs.originalObject.data.originalData.id;
      npos.set(id,[cs.x,cs.y]); nw.set(id,cs.weight); arr.push([id,+cs.x.toFixed(1),+cs.y.toFixed(1),Math.round(cs.weight)]);}
    S.pos=npos; S.w=nw;
    ctry.push([k,+s.x.toFixed(1),+s.y.toFixed(1),+s.weight.toFixed(1),arr]);
  }
  cPos=ncPos; cW=ncW;
  out.frames.push(ctry);
  if(t%40===0) console.log(t, page.months[t], 'conv', st.convergenceRatio.toFixed(4), 'iters', st.iterationCount);
}
console.log('worst conv',worst,'fails',fails);
fs.writeFileSync(OUTD+'layout.json',JSON.stringify(out));
console.log('size',fs.statSync(OUTD+'layout.json').size);
