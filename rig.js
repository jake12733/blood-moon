/* 혈월의 사냥꾼 · 2D 뼈대 애니메이션 엔진 (rig.js)
   그림 한 장을 촘촘한 메쉬로 나누고 뼈대(척추·머리·팔·다리·무기·날개)에 가중치를 입혀 팔다리를 따로 움직인다.
   - 가중치는 그림의 불투명 영역을 따라 잰 거리(지오데식)라서 왼다리를 움직여도 오른다리는 따라가지 않는다.
   - 무기(대검·톤파 칼날·총·식칼)는 따로 떼어낸 레이어라 크게 휘둘러도 몸이 늘어나지 않는다.
     무기가 있던 자리는 주변 색으로 메워 둔다.
   - 망토·날개·머리카락·핏빛 촉수처럼 뼈에서 먼 부분은 스프링으로 한 박자 늦게 따라와 휘날린다. */
(function(){
'use strict';
const TAU=Math.PI*2;

/* ---------- 리그 정의 (원본 이미지 픽셀 좌표) ----------
   hip 골반, ch 가슴, hd 머리, kl/kr 무릎, fl/fr 발,
   sh/el/ha/tip 앞팔(어깨·팔꿈치·손·무기 끝), sh2/el2/ha2/tip2 뒷팔, wl/wlt wr/wrt 날개 뿌리·끝,
   wp/wp2 = 무기 레이어 반경(px). 없으면 무기 레이어 없음 */
const DEF={
 'ap-viper-m-6':{kind:'caster',hip:[252,268],ch:[258,170],hd:[262,122],kl:[200,372],fl:[182,452],kr:[262,366],fr:[268,442],
   sh:[300,168],el:[330,180],ha:[352,146],tip:[372,118],sh2:[212,170],el2:[192,216],ha2:[196,258],tip2:[194,272]},
 'ap-blood-m-6':{kind:'blade2',hip:[212,280],ch:[238,155],hd:[252,102],kl:[178,365],fl:[157,456],kr:[268,302],fr:[342,353],
   sh:[252,158],el:[240,212],ha:[198,244],tip:[455,315],wp:15,sh2:[208,152],el2:[186,205],ha2:[190,244]},
 'ap-akasha-f-6':{kind:'dual',hip:[258,232],ch:[268,172],hd:[286,118],kl:[160,310],fl:[100,386],kr:[334,330],fr:[440,455],
   sh:[302,160],el:[350,190],ha:[384,214],tip:[442,262],wp:22,sh2:[232,165],el2:[165,176],ha2:[128,186],tip2:[48,272],wp2:26},
 'ap-carnage-m-6':{kind:'gun',hip:[242,262],ch:[240,168],hd:[230,102],kl:[170,356],fl:[125,452],kr:[290,335],fr:[346,396],
   sh:[256,145],el:[292,150],ha:[330,160],tip:[455,172],wp:13,sh2:[202,148],el2:[172,198],ha2:[192,238],tip2:[182,280]},
 'td-ghoul':{kind:'beast',hip:[176,170],ch:[196,104],hd:[236,50],kl:[120,266],fl:[100,338],kr:[238,200],fr:[248,248],
   sh:[240,82],el:[262,106],ha:[280,122],tip:[292,142],sh2:[130,86],el2:[110,146],ha2:[115,205],tip2:[120,228]},
 'td-brute':{kind:'brute',hip:[230,246],ch:[232,150],hd:[170,106],kl:[112,330],fl:[95,402],kr:[292,292],fr:[326,318],
   sh:[132,142],el:[110,190],ha:[98,226],tip:[232,302],wp:34,sh2:[310,122],el2:[332,162],ha2:[370,186],tip2:[382,192]},
 'td-gargoyle':{kind:'flyer',hip:[228,222],ch:[226,165],hd:[270,128],kl:[176,290],fl:[140,350],kr:[305,256],fr:[318,300],
   sh:[276,170],el:[300,176],ha:[320,196],tip:[332,208],sh2:[160,150],el2:[140,200],ha2:[146,232],tip2:[142,256],
   wl:[188,116],wlt:[22,70],wr:[276,100],wrt:[352,30]},
 'td-boss':{kind:'lord',hip:[340,330],ch:[350,212],hd:[362,140],kl:[300,440],fl:[278,536],kr:[388,422],fr:[452,468],
   sh:[396,192],el:[440,224],ha:[486,215],tip:[502,210],sh2:[305,206],el2:[263,262],ha2:[252,318],tip2:[250,330],
   wl:[300,165],wlt:[40,80],wr:[400,132],wrt:[520,62]}
};
const BONES=[['sp',null,'hip','ch'],['hd','sp','ch','hd'],
 ['tL',null,'hipL','kl'],['sL','tL','kl','fl'],['tR',null,'hipR','kr'],['sR','tR','kr','fr'],
 ['aA','sp','sh','el'],['fA','aA','el','ha'],['wA','fA','ha','tip'],
 ['aB','sp','sh2','el2'],['fB','aB','el2','ha2'],['wB','fB','ha2','tip2'],
 ['gL','sp','wl','wlt'],['gR','sp','wr','wrt']];
const SIG={sp:34,hd:22,tL:17,sL:15,tR:17,sR:15,aA:13,fA:12,wA:10,aB:13,fB:12,wB:10,gL:44,gR:44};

const rigs={};
let gl=null,glc=null,prog=null,posBuf=null,loc={},glOK=null;const GLW=1024,GLH=1024;

function initGL(){
 if(glOK!==null)return glOK;
 try{
  glc=document.createElement('canvas');glc.width=GLW;glc.height=GLH;
  gl=glc.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:false,depth:false,stencil:false});
  if(!gl)return glOK=false;
  const vs='attribute vec2 p;attribute vec2 u;uniform vec2 r;varying vec2 v;void main(){v=u;gl_Position=vec4(p.x/r.x*2.0-1.0,1.0-p.y/r.y*2.0,0.0,1.0);}';
  const fs='precision mediump float;uniform sampler2D t;varying vec2 v;void main(){gl_FragColor=texture2D(t,v);}';
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error('link');
  gl.useProgram(prog);
  loc={p:gl.getAttribLocation(prog,'p'),u:gl.getAttribLocation(prog,'u'),r:gl.getUniformLocation(prog,'r'),t:gl.getUniformLocation(prog,'t')};
  posBuf=gl.createBuffer();
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
  return glOK=true;
 }catch(e){console.warn('rig gl',e);return glOK=false}
}

const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};

/* 그리드 다익스트라 (8방향, 투명 영역은 비싸게) */
function geodesic(VX,VY,cs,cost,seeds){
 const N=VX*VY,D=new Float64Array(N).fill(1e9),hd=[],hi=[];
 const push=(d,i)=>{hd.push(d);hi.push(i);let k=hd.length-1;while(k>0){const p=(k-1)>>1;if(hd[p]<=hd[k])break;let t=hd[p];hd[p]=hd[k];hd[k]=t;t=hi[p];hi[p]=hi[k];hi[k]=t;k=p}};
 const pop=()=>{const d=hd[0],i=hi[0],ld=hd.pop(),li=hi.pop();if(hd.length){hd[0]=ld;hi[0]=li;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<hd.length&&hd[l]<hd[m])m=l;if(r<hd.length&&hd[r]<hd[m])m=r;if(m===k)break;let t=hd[m];hd[m]=hd[k];hd[k]=t;t=hi[m];hi[m]=hi[k];hi[k]=t;k=m}}return[d,i]};
 for(const[i,d]of seeds){if(d<D[i]){D[i]=d;push(d,i)}}
 const NB=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
 let guard=0;
 while(hd.length&&guard++<N*40){const[d,i]=pop();if(d>D[i])continue;const x=i%VX,y=(i/VX)|0;
  for(const[dx,dy,l]of NB){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=VX||ny>=VY)continue;const j=ny*VX+nx,nd=d+l*cs*(cost[i]+cost[j])*.5;if(nd<D[j]){D[j]=nd;push(nd,j)}}}
 return D;
}

/* 무기 마스크: 손→무기 끝 캡슐 안의 불투명 픽셀 */
function weaponMask(A,iw,ih,a,b,r){
 const m=new Uint8Array(iw*ih),dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;
 const x0=Math.max(0,Math.floor(Math.min(a[0],b[0])-r-2)),x1=Math.min(iw-1,Math.ceil(Math.max(a[0],b[0])+r+2));
 const y0=Math.max(0,Math.floor(Math.min(a[1],b[1])-r-2)),y1=Math.min(ih-1,Math.ceil(Math.max(a[1],b[1])+r+2));
 let n=0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*iw+x;if(A[i*4+3]<10)continue;const t=((x-a[0])*dx+(y-a[1])*dy)/L2;if(t<.04||t>1.06)continue;const tt=Math.min(1,t),px=a[0]+dx*tt,py=a[1]+dy*tt;const d=Math.hypot(x-px,y-py);const rr=r*(t<.12?.75:1);if(d<rr){m[i]=1;n++}}
 return{m,n,box:[x0,y0,x1,y1]};
}
/* 무기가 빠진 자리를 주변 색(투명 포함)으로 바깥에서 안쪽으로 메우기 */
function inpaint(D,iw,ih,mask,box){
 const[x0,y0,x1,y1]=box,known=new Uint8Array(iw*ih).fill(1);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*iw+x;if(mask[i])known[i]=0}
 const NB=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
 let left=1;for(let it=0;it<90&&left;it++){left=0;const add=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*iw+x;if(known[i])continue;let r=0,g=0,b=0,a=0,n=0;
   for(const[ox,oy]of NB){const X=x+ox,Y=y+oy;if(X<0||Y<0||X>=iw||Y>=ih)continue;const j=Y*iw+X;if(known[j]){const al=D[j*4+3];r+=D[j*4]*al;g+=D[j*4+1]*al;b+=D[j*4+2]*al;a+=al;n++}}
   if(n)add.push(i,r,g,b,a,n);else left=1}
  for(let k=0;k<add.length;k+=6){const i=add[k],a=add[k+4],n=add[k+5];if(a>0){D[i*4]=add[k+1]/a;D[i*4+1]=add[k+2]/a;D[i*4+2]=add[k+3]/a}D[i*4+3]=a/n;known[i]=1}}
}

function build(key,img){
 const d=DEF[key];if(!d)return null;
 const iw=img.naturalWidth,ih=img.naturalHeight,S=iw/460;
 const P={};for(const k in d)if(Array.isArray(d[k]))P[k]=d[k];
 P.hipL=[P.hip[0]+(P.kl[0]-P.hip[0])*.3,P.hip[1]+(P.kl[1]-P.hip[1])*.15];
 P.hipR=[P.hip[0]+(P.kr[0]-P.hip[0])*.3,P.hip[1]+(P.kr[1]-P.hip[1])*.15];
 const bones=[],bi={};
 for(const[n,par,a,b]of BONES){if(!P[a]||!P[b])continue;const o={n,par,p:P[a],e:P[b],i:bones.length};bi[n]=o.i;bones.push(o)}
 for(const b of bones)b.pi=b.par&&bi[b.par]!=null?bi[b.par]:-1;
 const c=document.createElement('canvas');c.width=iw;c.height=ih;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
 const A=g.getImageData(0,0,iw,ih).data;const al=(x,y)=>A[((Math.min(ih-1,Math.max(0,y|0)))*iw+Math.min(iw-1,Math.max(0,x|0)))*4+3];
 /* 무기 레이어 분리 */
 const weapons=[];
 for(const[bn,a,b,rk]of[['wA','ha','tip','wp'],['wB','ha2','tip2','wp2']]){if(!d[rk]||!P[a]||!P[b]||bi[bn]==null)continue;const W=weaponMask(A,iw,ih,P[a],P[b],d[rk]*S);if(W.n<20)continue;W.bone=bn;weapons.push(W)}
 let baseCanvas=c;const wCanv=[];
 if(weapons.length){
  const all=new Uint8Array(iw*ih);for(const w of weapons)for(let i=0;i<all.length;i++)if(w.m[i])all[i]=1;
  for(const w of weapons){const wc=document.createElement('canvas');wc.width=iw;wc.height=ih;const wg=wc.getContext('2d');const wd=wg.createImageData(iw,ih);
   for(let i=0;i<iw*ih;i++)if(w.m[i]){wd.data[i*4]=A[i*4];wd.data[i*4+1]=A[i*4+1];wd.data[i*4+2]=A[i*4+2];wd.data[i*4+3]=A[i*4+3]}
   wg.putImageData(wd,0,0);wCanv.push(wc)}
  const B=new Uint8ClampedArray(A);
  let bx0=iw,by0=ih,bx1=0,by1=0;for(const w of weapons){bx0=Math.min(bx0,w.box[0]);by0=Math.min(by0,w.box[1]);bx1=Math.max(bx1,w.box[2]);by1=Math.max(by1,w.box[3])}
  inpaint(B,iw,ih,all,[bx0,by0,bx1,by1]);
  baseCanvas=document.createElement('canvas');baseCanvas.width=iw;baseCanvas.height=ih;baseCanvas.getContext('2d').putImageData(new ImageData(B,iw,ih),0,0);
 }
 const cs=Math.max(6,Math.round(8*S)),nx=Math.ceil(iw/cs),ny=Math.ceil(ih/cs),VX=nx+1,VY=ny+1;
 const cellOcc=(alphaFn,thr)=>{const occ=new Uint8Array(nx*ny);for(let cy=0;cy<ny;cy++)for(let cx=0;cx<nx;cx++){let m=0;for(let y=cy*cs;y<Math.min(ih,(cy+1)*cs)&&m<=thr;y+=2)for(let x=cx*cs;x<Math.min(iw,(cx+1)*cs);x+=2){const a=alphaFn(x,y);if(a>m)m=a}occ[cy*nx+cx]=m>thr?1:0}
  const o2=new Uint8Array(nx*ny);for(let cy=0;cy<ny;cy++)for(let cx=0;cx<nx;cx++){let o=0;for(let dy=-1;dy<=1&&!o;dy++)for(let dx=-1;dx<=1;dx++){const x=cx+dx,y=cy+dy;if(x>=0&&y>=0&&x<nx&&y<ny&&occ[y*nx+x]){o=1;break}}o2[cy*nx+cx]=o}return o2};
 const cost=new Float32Array(VX*VY);
 for(let vy=0;vy<VY;vy++)for(let vx=0;vx<VX;vx++){const x=vx*cs,y=vy*cs;let m=0;for(let dy=-2;dy<=2;dy+=2)for(let dx=-2;dx<=2;dx+=2){const a=al(x+dx,y+dy);if(a>m)m=a}cost[vy*VX+vx]=m>60?1:m>15?1.8:4}
 const D=bones.map(b=>{let[px,py]=b.p,[ex,ey]=b.e;if(b.n==='hd'){ex+=(ex-px)*.7;ey+=(ey-py)*.7}
  const len=Math.hypot(ex-px,ey-py),n=Math.max(2,Math.ceil(len/(cs*.5))),seeds=[];
  for(let k=0;k<=n;k++){const t=k/n,qx=px+(ex-px)*t,qy=py+(ey-py)*t,vx=Math.min(VX-1,Math.max(0,Math.round(qx/cs))),vy=Math.min(VY-1,Math.max(0,Math.round(qy/cs)));seeds.push([vy*VX+vx,Math.hypot(vx*cs-qx,vy*cs-qy)])}
  return geodesic(VX,VY,cs,cost,seeds)});
 const nb=bones.length,wBones=new Set(weapons.map(w=>bi[w.bone]));
 const mkLayer=(canvas,occ,rigidBone)=>{
  const used=new Int32Array(VX*VY).fill(-1);let nv=0;
  for(let cy=0;cy<ny;cy++)for(let cx=0;cx<nx;cx++)if(occ[cy*nx+cx])for(const[dx,dy]of[[0,0],[1,0],[0,1],[1,1]]){const j=(cy+dy)*VX+cx+dx;if(used[j]<0)used[j]=nv++}
  const rest=new Float32Array(nv*2),uv=new Float32Array(nv*2),wI=new Uint8Array(nv*4),wV=new Float32Array(nv*4),soft=new Float32Array(nv),ph=new Float32Array(nv),tmp=new Float32Array(nb);
  for(let j=0;j<VX*VY;j++){const v=used[j];if(v<0)continue;const vx=j%VX,vy=(j/VX)|0,x=Math.min(iw,vx*cs),y=Math.min(ih,vy*cs);
   rest[v*2]=x;rest[v*2+1]=y;uv[v*2]=x/iw;uv[v*2+1]=y/ih;ph[v]=x*.021+y*.017;
   if(rigidBone!=null){wI[v*4]=rigidBone;wV[v*4]=1;continue}
   let dmin=1e9;for(let b=0;b<nb;b++)if(!wBones.has(b)&&D[b][j]<dmin)dmin=D[b][j];
   for(let b=0;b<nb;b++){if(wBones.has(b)){tmp[b]=0;continue}const s=SIG[bones[b].n]*S,q=(D[b][j]-dmin)/s;tmp[b]=q<3.2?Math.exp(-q*q):0}
   const order=[...tmp.keys()].sort((a,b)=>tmp[b]-tmp[a]).slice(0,4);let s4=0;for(const b of order)s4+=tmp[b];
   order.forEach((b,k)=>{wI[v*4+k]=b;wV[v*4+k]=s4>0?tmp[b]/s4:(k?0:1)});
   soft[v]=smooth(14*S,78*S,dmin)}
  const tri=[];for(let cy=0;cy<ny;cy++)for(let cx=0;cx<nx;cx++){if(!occ[cy*nx+cx])continue;const a=used[cy*VX+cx],b=used[cy*VX+cx+1],c2=used[(cy+1)*VX+cx],e=used[(cy+1)*VX+cx+1];tri.push(a,b,c2,b,e,c2)}
  return{canvas,nv,rest,uv,wI,wV,soft,ph,tri:new Uint16Array(tri),pos:new Float32Array(nv*2),loc:new Float32Array(nv*2),tex:null,gUV:null,gIdx:null,rigid:rigidBone!=null};
 };
 const layers=[mkLayer(baseCanvas,cellOcc(al,12),null)];
 weapons.forEach((w,k)=>{const m=w.m;layers.push(mkLayer(wCanv[k],cellOcc((x,y)=>m[Math.min(ih-1,y)*iw+Math.min(iw-1,x)]?255:0,0),bi[w.bone]))});
 const ang=(a,b)=>P[a]&&P[b]?Math.atan2(P[b][1]-P[a][1],P[b][0]-P[a][0]):0;
 return{key,iw,ih,cs,bones,bi,P,kind:d.kind,layers,
  restA:ang('sh',P.tip?'tip':'ha'),restB:ang('sh2',P.tip2?'tip2':'ha2'),restWA:ang('ha','tip'),restWB:ang('ha2','tip2'),
  hasWA:weapons.some(w=>w.bone==='wA'),hasWB:weapons.some(w=>w.bone==='wB'),M:new Float32Array(nb*6)};
}

function getRig(key,img){
 if(!(key in DEF))return null;
 if(!img||!img.complete||!img.naturalWidth)return null;
 let r=rigs[key];if(r===undefined){try{r=rigs[key]=build(key,img)}catch(e){console.warn('rig build',key,e);r=rigs[key]=null}}
 return r;
}

function glPrep(L){
 if(L.tex)return;
 const big=Math.max(L.canvas.width,L.canvas.height)>512?1024:512,c=document.createElement('canvas');c.width=big;c.height=big;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(L.canvas,0,0,big,big);
 L.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,L.tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.generateMipmap(gl.TEXTURE_2D);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 L.gUV=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,L.gUV);gl.bufferData(gl.ARRAY_BUFFER,L.uv,gl.STATIC_DRAW);
 L.gIdx=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,L.gIdx);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,L.tri,gl.STATIC_DRAW);
}

function fk(r,pose){
 const M=r.M;
 for(const b of r.bones){const th=pose[b.n]||0,c=Math.cos(th),s=Math.sin(th),px=b.p[0],py=b.p[1];
  let a=c,bb=s,cc=-s,dd=c,e=px-c*px+s*py,f=py-s*px-c*py;
  if(b.pi>=0){const o=b.pi*6,pa=M[o],pb=M[o+1],pc=M[o+2],pd=M[o+3],pe=M[o+4],pf=M[o+5];
   const na=pa*a+pc*bb,nb=pb*a+pd*bb,nc=pa*cc+pc*dd,nd=pb*cc+pd*dd,ne=pa*e+pc*f+pe,nf=pb*e+pd*f+pf;a=na;bb=nb;cc=nc;dd=nd;e=ne;f=nf}
  const o=b.i*6;M[o]=a;M[o+1]=bb;M[o+2]=cc;M[o+3]=dd;M[o+4]=e;M[o+5]=f}
 return M;
}
function boneP(r,name,pt){const i=r.bi[name];if(i==null)return pt;const M=r.M,o=i*6;return[M[o]*pt[0]+M[o+2]*pt[1]+M[o+4],M[o+1]*pt[0]+M[o+3]*pt[1]+M[o+5]]}

let FRAME_DT=1/60,TIME=0,last=null;
function frame(dt,t){FRAME_DT=dt;TIME=t}

/* 메인: x,y = 발 위치(월드), h = 키(월드 px), face = ±1 */
function draw(ctx,inst,key,img,pose,x,y,h,face,o){
 o=o||{};
 const r=getRig(key,img);if(!r||!initGL())return false;
 const iw=r.iw,ih=r.ih,sc=h/ih,M=fk(r,pose);
 const rl=(o.rot||0)*face,cr=Math.cos(rl),sr=Math.sin(rl),sx=o.sx||1,sy=o.sy||1,pdx=pose.dx||0,pdy=pose.dy||0,ax0=iw/2,ay0=ih*.96;
 const base=r.layers[0];let st=inst&&inst._rig;
 if(inst&&(!st||st.key!==key)){st=inst._rig={key,p:new Float32Array(base.nv*2),v:new Float32Array(base.nv*2),ax:x,ay:y,vx:0,vy:0,init:false}}
 const m=ctx.getTransform();let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
 for(let li=0;li<r.layers.length;li++){const L=r.layers[li];
  const nv=L.nv,rest=L.rest,wI=L.wI,wV=L.wV,LL=L.loc;
  for(let v=0;v<nv;v++){const X0=rest[v*2],Y0=rest[v*2+1];let X=0,Y=0;
   for(let k=0;k<4;k++){const w=wV[v*4+k];if(!w)continue;const mm=wI[v*4+k]*6;X+=w*(M[mm]*X0+M[mm+2]*Y0+M[mm+4]);Y+=w*(M[mm+1]*X0+M[mm+3]*Y0+M[mm+5])}
   const lx=(X+pdx-ax0)*sc*sx,ly=(Y+pdy-ay0)*sc*sy;LL[v*2]=lx*cr-ly*sr;LL[v*2+1]=lx*sr+ly*cr}
  let src=LL;
  if(li===0&&st&&!o.noSpring){
   if(!o.ghost){
    const dt=Math.min(FRAME_DT,1/20);
    if(!st.init||Math.hypot(x-st.ax,y-st.ay)>260){st.p.set(LL);st.v.fill(0);st.init=true;st.vx=st.vy=0;st.ax=x;st.ay=y}
    if(dt>1e-5){
     const vx=(x-st.ax)/dt,vy=(y-st.ay)/dt;let aX=(vx-st.vx)/dt,aY=(vy-st.vy)/dt;const am=Math.hypot(aX,aY),cap=4200;if(am>cap){aX*=cap/am;aY*=cap/am}
     st.vx=vx;st.vy=vy;st.ax=x;st.ay=y;
     const iax=-face*aX*.85,iay=-aY*.85,ux=face*vx,uy=vy,wa=h*.012*(o.wind==null?1:o.wind),soft=L.soft,ph=L.ph,T=TIME;
     const n=Math.max(1,Math.ceil(dt/(1/60))),h2=dt/n;
     for(let v=0;v<nv;v++){const s=soft[v],i=v*2;
      if(s<.02){st.p[i]=LL[i];st.p[i+1]=LL[i+1];st.v[i]=st.v[i+1]=0;continue}
      const tx=LL[i]+s*wa*Math.sin(T*2.3+ph[v]),ty=LL[i+1]+s*wa*.55*Math.sin(T*1.7+ph[v]*1.3);
      const k=300-276*s,c=2*Math.sqrt(k)*.42,cd=1.25*s;
      let px=st.p[i],py=st.p[i+1],qx=st.v[i],qy=st.v[i+1];
      for(let q=0;q<n;q++){const fx=k*(tx-px)-c*qx+iax*s-cd*(qx+ux),fy=k*(ty-py)-c*qy+iay*s-cd*(qy+uy);qx+=fx*h2;qy+=fy*h2;px+=qx*h2;py+=qy*h2}
      const ex=px-tx,ey=py-ty,el=Math.hypot(ex,ey),lim=h*.22*s+2;if(el>lim){px=tx+ex*lim/el;py=ty+ey*lim/el}
      st.p[i]=px;st.p[i+1]=py;st.v[i]=qx;st.v[i+1]=qy}
    }
   }
   if(st.init)src=st.p;
  }
  const PP=L.pos;
  for(let v=0;v<nv;v++){const wx=x+face*src[v*2],wy=y+src[v*2+1],dx=m.a*wx+m.c*wy+m.e,dy=m.b*wx+m.d*wy+m.f;PP[v*2]=dx;PP[v*2+1]=dy;if(dx<minX)minX=dx;if(dx>maxX)maxX=dx;if(dy<minY)minY=dy;if(dy>maxY)maxY=dy}
 }
 stash(r,inst,x,y,face,sc,sx,sy,cr,sr,pdx,pdy);
 minX=Math.floor(minX)-2;minY=Math.floor(minY)-2;maxX=Math.ceil(maxX)+2;maxY=Math.ceil(maxY)+2;
 const cw=ctx.canvas.width,ch=ctx.canvas.height;
 if(maxX<0||maxY<0||minX>cw||minY>ch){last=null;return true}
 const bw=maxX-minX,bh=maxY-minY,k=Math.min(1,GLW/bw,GLH/bh),rw=Math.ceil(bw*k),rh=Math.ceil(bh*k);
 gl.viewport(0,0,GLW,GLH);gl.enable(gl.SCISSOR_TEST);gl.scissor(0,GLH-rh,rw,rh);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.useProgram(prog);gl.uniform2f(loc.r,GLW,GLH);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(loc.t,0);
 for(const L of r.layers){
  glPrep(L);const PP=L.pos;for(let v=0;v<L.nv;v++){PP[v*2]=(PP[v*2]-minX)*k;PP[v*2+1]=(PP[v*2+1]-minY)*k}
  gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferData(gl.ARRAY_BUFFER,PP,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(loc.p);gl.vertexAttribPointer(loc.p,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,L.gUV);gl.enableVertexAttribArray(loc.u);gl.vertexAttribPointer(loc.u,2,gl.FLOAT,false,0,0);
  gl.bindTexture(gl.TEXTURE_2D,L.tex);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,L.gIdx);gl.drawElements(gl.TRIANGLES,L.tri.length,gl.UNSIGNED_SHORT,0);
 }
 gl.disable(gl.SCISSOR_TEST);
 last={rw,rh,minX,minY,bw,bh};
 if(!o.noBlit)blit(ctx,0,0,o);
 return true;
}
/* 마지막으로 그린 캐릭터를 다시 찍기 (잔상·번쩍임용). dx,dy = 디바이스 px */
function blit(ctx,dx,dy,o){
 if(!last)return;o=o||{};
 ctx.save();ctx.setTransform(1,0,0,1,0,0);
 if(o.a!=null)ctx.globalAlpha*=o.a;if(o.f)ctx.filter=o.f;if(o.op)ctx.globalCompositeOperation=o.op;
 ctx.drawImage(glc,0,0,last.rw,last.rh,last.minX+dx,last.minY+dy,last.bw,last.bh);
 ctx.restore();
}
function stash(r,inst,x,y,face,sc,sx,sy,cr,sr,pdx,pdy){
 if(!inst)return;
 const W=pt=>{const lx=(pt[0]+pdx-r.iw/2)*sc*sx,ly=(pt[1]+pdy-r.ih*.96)*sc*sy;return[x+face*(lx*cr-ly*sr),y+(lx*sr+ly*cr)]};
 const P=r.P;
 inst._tipA=P.tip?W(boneP(r,'wA',P.tip)):null;inst._handA=P.ha?W(boneP(r,'fA',P.ha)):null;
 inst._tipB=P.tip2?W(boneP(r,'wB',P.tip2)):null;inst._handB=P.ha2?W(boneP(r,'fB',P.ha2)):null;
 inst._head=W(boneP(r,'hd',P.hd));
}

/* ---------- 포즈 도우미 ---------- */
const wrap=a=>{a=(a+Math.PI)%TAU;if(a<0)a+=TAU;return a-Math.PI};
const add=(P,k,v)=>{P[k]=(P[k]||0)+v};
function idle(P,t,kind){
 const b=(1-Math.cos(t*2.1))/2,w=Math.sin(t*2.1);
 add(P,'sp',.03*w);add(P,'hd',-.025*Math.sin(t*2.1-.7));
 add(P,'aA',.05*Math.sin(t*2.1+.5));add(P,'fA',.04*Math.sin(t*2.1+1));add(P,'wA',.05*Math.sin(t*2.1+.8));
 add(P,'aB',-.05*Math.sin(t*2.1+.9));add(P,'fB',-.05*Math.sin(t*2.1+1.4));add(P,'wB',-.05*Math.sin(t*2.1+1.2));
 add(P,'tL',-.035*b);add(P,'sL',.07*b);add(P,'tR',-.035*b);add(P,'sR',.07*b);
 add(P,'dy',3*b);
 if(kind==='flyer'){const f=Math.sin(t*7);add(P,'gL',.4*f);add(P,'gR',-.34*f)}
 if(kind==='lord'){const f=Math.sin(t*2.2);add(P,'gL',.13*f);add(P,'gR',-.11*f)}
}
const LEG={blade2:.42,dual:.46,gun:.4,caster:.22,beast:.38,brute:.3,flyer:.25,lord:.2};
function run(P,ph,kind,k){
 k=k==null?1:k;const s=Math.sin(ph),c=Math.cos(ph),A=LEG[kind]||.4;
 add(P,'tL',k*(-A*s));add(P,'tR',k*(A*s));
 const kn=kind==='caster'||kind==='lord'?.45:.95;
 add(P,'sL',k*(.1+kn*Math.pow(Math.max(0,c),1.3)));add(P,'sR',k*(.1+kn*Math.pow(Math.max(0,-c),1.3)));
 add(P,'sp',k*(.12+.035*Math.sin(ph*2)));add(P,'hd',k*(-.07-.02*Math.sin(ph*2)));
 if(kind==='blade2'){add(P,'aA',k*.06*s);add(P,'wA',k*(.08*s-.12))}
 else if(kind==='gun'){add(P,'aA',k*.05*s);add(P,'aB',k*(-.22*s));add(P,'fB',k*(-.2))}
 else if(kind==='caster'){add(P,'aA',k*(.12*s-.08));add(P,'aB',k*(-.14*s+.06));add(P,'fB',k*-.08)}
 else{add(P,'aA',k*.28*s);add(P,'fA',k*-.12);add(P,'aB',k*-.28*s);add(P,'fB',k*(-.18-.1*s))}
 add(P,'dy',-k*6*Math.abs(s));
 if(kind==='flyer'){const f=Math.sin(ph*1.5);add(P,'gL',k*.45*f);add(P,'gR',-k*.4*f)}
 if(kind==='lord'){const f=Math.sin(ph*.8);add(P,'gL',k*.16*f);add(P,'gR',-k*.14*f)}
}
function hit(P,k){add(P,'sp',-.2*k);add(P,'hd',-.26*k);add(P,'aA',-.16*k);add(P,'wA',-.2*k);add(P,'aB',.18*k);add(P,'fB',-.15*k);add(P,'tL',.1*k);add(P,'tR',-.08*k);add(P,'sL',.14*k);add(P,'sR',.14*k)}
function die(P,k){add(P,'sp',-.45*k);add(P,'hd',-.45*k);add(P,'aA',-.35*k);add(P,'wA',-.6*k);add(P,'aB',.3*k);add(P,'tL',-.25*k);add(P,'sL',.7*k);add(P,'tR',.2*k);add(P,'sR',.6*k);add(P,'gL',.5*k);add(P,'gR',-.5*k)}
/* 무기를 절대 방향(0=앞, -π/2=위, π/2=아래)으로: 팔이 일부(share) 따라가고 나머지는 무기 뼈가 돌린다 */
function weaponTo(P,r,chain,abs,k,share){
 const restW=chain==='B'?r.restWB:r.restWA,armN=chain==='B'?'aB':'aA',wN=chain==='B'?'wB':'wA';
 const cur=restW+(P[armN]||0)+(P[chain==='B'?'fB':'fA']||0)+(P[wN]||0);
 const d=wrap(abs-cur)*(k==null?1:k),sh=share==null?.25:share;
 add(P,armN,d*sh);add(P,wN,d*(1-sh));
}

/* ---------- 동작 → 포즈 (게임과 모션 미리보기 페이지가 같이 씀) ---------- */
const clamp=(v,a,b)=>v<a?a:v>b?b:v,eInQ=q=>q*q*q,eOutX=q=>q>=1?1:1-Math.pow(2,-10*q),springK=k=>Math.exp(-5.5*k)*Math.cos(10*k),eOut=q=>1-(1-q)*(1-q),RL=(a,b,t)=>a+(b-a)*t;
/* s = {act:{k,st,t,dur,hits}, state:'run'|..., t, hitT, recoil, aim} */
function heroPose(r,s){
 const kind=r.kind,P={},ad=(k,v)=>{P[k]=(P[k]||0)+v},RA=r.restWA,RB=r.restWB,a=s.act,t=s.t||0;
 const TW=(g,k,sh)=>{if(r.hasWA)weaponTo(P,r,'A',g,k==null?1:k,sh==null?.22:sh)},TB=(g,k,sh)=>{if(r.hasWB)weaponTo(P,r,'B',g,k==null?1:k,sh==null?.25:sh)};
 if(a){const p=clamp(a.t/a.dur,0,1),hp=clamp(((a.hits&&a.hits[0])||0)/a.dur,.05,.95);
  if(a.k==='b'&&a.st<2){idle(P,t,kind);
   /* 대검: 머리 뒤로 들어 올림 → 앞아래로 내려벰 → 스프링으로 정지 (역방향 베기는 거꾸로) */
   const sg=a.st===0?1:-1,w1=hp*.62,W=sg>0?-2.15:1.75,K=sg>0?1.05:-1.9;let g,sp,lg;
   if(p<w1){const k=eInQ(p/w1);g=RL(RA,W,k);sp=(sg>0?-.15:.1)*k;lg=-.06*k}
   else if(p<hp){const k=eOutX((p-w1)/(hp-w1));g=RL(W,K,k);sp=RL(sg>0?-.15:.1,sg>0?.22:-.14,k);lg=RL(-.06,-.34,k)}
   else{const k=(p-hp)/(1-hp),q=springK(k);g=RA+(K-RA)*q;sp=(sg>0?.22:-.14)*q;lg=-.34*q}
   TW(g,1,.22);ad('sp',sp);ad('hd',-sp*.45);ad('tR',lg);ad('sR',-lg*.5);ad('tL',-lg*.35);ad('aB',(P.aA||0)*.6)}
  else if(a.k==='b'){const t1=a.hits[1]+.12,t2=a.hits[2];
   if(a.t<t1){idle(P,t,kind);TW(.05,Math.min(1,a.t/.08),.3);ad('sp',.08);ad('sL',.25);ad('sR',.25);ad('tL',.1);ad('tR',-.12)}
   else if(a.t<t2){const q=(a.t-t1)/(t2-t1);
    if(q<.6){const e=eOutX(q/.6);TW(RL(.05,-2.3,e),1,.25);ad('sp',-.2*e);ad('hd',-.1*e);ad('tL',-.35*e);ad('sL',.75*e);ad('tR',-.15*e);ad('sR',.6*e)}
    else{const e=eOutX((q-.6)/.4);TW(RL(-2.3,1.25,e),1,.28);ad('sp',RL(-.2,.32,e));ad('hd',RL(-.1,.1,e));ad('tL',-.35*(1-e));ad('sL',.75*(1-e));ad('tR',-.15*(1-e)-.2*e);ad('sR',.6*(1-e)+.2*e)}}
   else{const k=clamp((a.t-t2)/(a.dur-t2),0,1),e=1-k,q=springK(k);TW(RA+(1.25-RA)*q,1,.28);ad('sp',.32*q);ad('sL',.55*e*e);ad('sR',.55*e*e);ad('tL',-.18*e);ad('tR',-.26*e)}}
  else if(a.k==='dash'){run(P,Math.PI*.5,kind,1.2);ad('sp',.16);TW(2.45,1,.2);TB(2.7,1,.2)}
  else if(a.k==='a'){idle(P,t,kind);
   if(a.st<4){/* 톤파 칼날: 좌우 번갈아 크게 벰 */
    const sg=a.st%2?-1:1,useB=sg<0&&r.hasWB,w1=hp*.5,R=useB?RB:RA,W=useB?2.95:-1.25,K=useB?.2:1.35;let g,sp,lg;
    if(p<w1){const k=eInQ(p/w1);g=RL(R,W,k);sp=-.12*k;lg=-.05*k}
    else if(p<hp){const k=eOutX((p-w1)/(hp-w1));g=RL(W,K,k);sp=RL(-.12,.22,k);lg=RL(-.05,-.28,k)}
    else{const k=(p-hp)/(1-hp),q=springK(k);g=R+(K-R)*q;sp=.22*q;lg=-.28*q}
    if(useB)TB(g,1,.28);else TW(g,1,.28);ad('sp',sp);ad('hd',-sp*.4);if(sg>0){ad('tR',lg);ad('sR',-lg*.4)}else{ad('tL',lg);ad('sL',-lg*.4)}}
   else{const e=Math.sin(p*Math.PI),k=eOutX(Math.min(1,p/hp));TW(RL(RA,-1.75,k),1,.3);TB(RL(RB,-2,k),1,.3);ad('sp',-.22*e);ad('hd',-.12*e);ad('tL',-.3*e);ad('sL',.6*e);ad('tR',-.12*e);ad('sR',.5*e)}}
  else if(a.k==='chain'){run(P,Math.PI*.5,kind,1.1);ad('sp',.2);TW(.1,1,.3);TB(3,1,.3)}
  else if(a.k==='spin'){idle(P,t,kind);TW(0,1,.35);TB(Math.PI,1,.35);ad('sL',.2);ad('sR',.2)}
  else if(a.k==='hop'){idle(P,t,kind);const e=Math.sin(p*Math.PI);ad('tL',-.4*e);ad('sL',.8*e);ad('tR',-.22*e);ad('sR',.7*e);ad('sp',-.16*e);ad('hd',-.08*e)}
  else if(a.k==='v'){idle(P,t,kind);const t0=a.hits[0];
   /* 바이퍼: 두 손을 끌어올려 모았다가 앞으로 내지름 */
   if(a.t<t0){const k=eInQ(a.t/t0);ad('aA',-.55*k);ad('fA',-.25*k);ad('aB',-.42*k);ad('fB',-.3*k);ad('sp',-.1*k);ad('hd',-.07*k)}
   else{const q=clamp((a.t-t0)/(a.dur-t0),0,1),th=eOutX(Math.min(1,q/.22)),fd=1-q*q*(3-2*q);ad('aA',RL(-.55,.3,th)*fd);ad('fA',RL(-.25,.08,th)*fd);ad('aB',RL(-.42,.22,th)*fd);ad('fB',RL(-.3,-.05,th)*fd);ad('sp',RL(-.1,.17,th)*fd);ad('hd',RL(-.07,.05,th)*fd)}}
  else idle(P,t,kind);
 } else if(s.state==='run')run(P,t*12,kind,1);
 else idle(P,t,kind);
 /* 카니지: 총구가 표적을 겨누고, 쏠 때 팔이 튀어 오름 */
 if(kind==='gun'){if(s.aim!=null)TW(s.aim,a?1:.5,.75);
  if(s.recoil>0){const k=Math.pow(s.recoil/.3,2);ad('aA',-.3*k);ad('wA',-.12*k);ad('sp',-.1*k);ad('hd',-.06*k)}}
 if(s.hitT>0)hit(P,clamp(s.hitT/.15,0,1));
 return P;
}
/* s = {dead, dt, stun, stunMax, lunge, moving, t} → {P, rot} (rot는 face를 곱해서 쓰기) */
function mobPose(r,s){
 const P={},kind=r.kind,ad=(k,v)=>{P[k]=(P[k]||0)+v},t=s.t||0;let rot=0;
 if(s.dead){const e=eOut(Math.min(1,s.dt/.45));die(P,e);rot=-.85*e}
 else if(s.stun>0){idle(P,t,kind);hit(P,clamp(s.stun/(s.stunMax||.15),0,1))}
 else if(s.lunge>0){idle(P,t,kind);const p=1-s.lunge/.28;
  if(kind==='brute'&&r.hasWA){/* 식칼을 머리 위로 들었다가 내려찍기 */const R=r.restWA;let g;if(p<.4)g=RL(R,-1.8,eInQ(p/.4));else if(p<.65)g=RL(-1.8,1.2,eOutX((p-.4)/.25));else g=R+(1.2-R)*springK((p-.65)/.35);weaponTo(P,r,'A',g,1,.3);ad('sp',p<.4?-.12*p/.4:.2*(p<.65?1:springK((p-.65)/.35)))}
  else{/* 발톱: 양팔을 젖혔다가 앞으로 할퀴기 */
   if(p<.38){const k=eInQ(p/.38);ad('aA',-.6*k);ad('fA',-.3*k);ad('aB',-.45*k);ad('fB',-.25*k);ad('sp',-.14*k)}
   else{const k=eOutX(Math.min(1,(p-.38)/.22)),q=p>.6?springK((p-.6)/.4):1;ad('aA',RL(-.6,.55,k)*q);ad('fA',RL(-.3,.15,k)*q);ad('aB',RL(-.45,.45,k)*q);ad('fB',RL(-.25,.1,k)*q);ad('sp',RL(-.14,.24,k)*q)}}
  if(kind==='flyer'||kind==='lord'){const f=Math.sin(p*Math.PI);ad('gL',-.35*f);ad('gR',.3*f)}}
 else if(s.moving)run(P,t*9,kind,kind==='flyer'?.55:1);
 else idle(P,t,kind);
 return{P,rot};
}

window.RIG={DEF,has:k=>k in DEF,getRig,draw,blit,frame,idle,run,hit,die,weaponTo,wrap,heroPose,mobPose,ok:()=>initGL()};
})();
