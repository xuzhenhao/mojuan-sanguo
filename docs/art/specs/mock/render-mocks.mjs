// 示意稿渲染：node render-mocks.mjs <repoRoot> <outDir>
// 需要 playwright（仓库未依赖；在装有 playwright 的目录运行，如 box 的 /workspace/art-lvbu-a2）。
// 只画示意，坐标/色值以 spec-105-epiphany.md / spec-107-boss.md 为准。
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
const [root, out] = process.argv.slice(2);
const font = (f) => 'file://' + path.join(root, 'public/assets/fonts', f);
const T = { lac0:'#070302',lac1:'#150A08',lac2:'#22100B',lac3:'#2A1410',lac4:'#4A1D14',goldHi:'#F4DC9A',gold:'#E9C877',goldMid:'#B98A3C',goldLo:'#8A6A2A',paper:'#F3EBD8',paper2:'#EFE3C6',paper3:'#BFAE88',ink:'#1A1A1A',cinnabar:'#A63D2F',cinnHi:'#D4604C',jade:'#4F9A7C',jadeDk:'#1D4A3A',jadeHi:'#9AD4B8' };
const RAR = { N:'#C49A6A', R:'#DFE5E8', E:'#E9C877', L:'#9AD4B8' };
const page = (body) => `<!doctype html><html><head><meta charset=utf-8><style>
@font-face{font-family:Brush;src:url(${font('wenkai-core.woff2')}),url(${font('wenkai-ext.woff2')})}
html,body{margin:0;background:#000}canvas{display:block}</style></head><body><canvas id=c width=780 height=1688 style="width:390px;height:844px"></canvas>
<script>const T=${JSON.stringify(T)},RAR=${JSON.stringify(RAR)};
const c=document.getElementById('c').getContext('2d');c.scale(2,2);
Promise.all([document.fonts.load('20px Brush','灵光一闪苍天已死'),document.fonts.load('20px Brush','整备出战')]).catch(()=>{}).then(()=>{
const B=(p)=>p+'px Brush';
function rr(x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
function panel(x,y,w,h,o={}){const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'rgba(42,20,16,.96)');g.addColorStop(1,'rgba(15,7,5,.97)');
 if(o.glow){[[2,2,'rgba(233,200,119,.45)'],[5,3,'rgba(233,200,119,.18)']].forEach(([d,lw,col])=>{rr(x-d,y-d,w+2*d,h+2*d,3+d);c.lineWidth=lw;c.strokeStyle=col;c.stroke();});}
 rr(x,y,w,h,3);c.fillStyle=g;c.fill();
 rr(x+.75,y+.75,w-1.5,h-1.5,3);c.lineWidth=o.lw||1.5;c.strokeStyle=o.stroke||T.goldLo;c.stroke();}
function btn(x,y,w,h,label,kind,dis){const g=c.createLinearGradient(0,y,0,y+h);
 const k={primary:['#C4513E','#7D2418'],confirm:['#3E8A6C','#1D4A3A'],secondary:['#5A4A3A','#2A1F16']}[kind];
 g.addColorStop(0,k[0]);g.addColorStop(1,k[1]);c.save();if(dis){c.globalAlpha=.45;c.filter='saturate(0.3)';}
 rr(x,y,w,h,4);c.fillStyle=g;c.fill();c.lineWidth=1.5;c.strokeStyle=T.gold;c.stroke();rr(x-3,y-3,w+6,h+6,6);c.strokeStyle=T.goldLo;c.lineWidth=1;c.stroke();
 c.fillStyle='#FFF3DC';c.font=B(22);c.textAlign='center';c.textBaseline='middle';c.shadowColor='#000';c.shadowOffsetY=2;c.shadowBlur=2;c.fillText(label,x+w/2,y+h/2+1);c.restore();}
function text(s,x,y,f,col,al='center',sh){c.save();c.font=f;c.fillStyle=col;c.textAlign=al;c.textBaseline='middle';if(sh){c.shadowColor='#000';c.shadowOffsetY=2;c.shadowBlur=6;}c.fillText(s,x,y);c.restore();}
function lacquer(){const g=c.createRadialGradient(195,330,0,195,330,520);g.addColorStop(0,T.lac4);g.addColorStop(.5,T.lac2);g.addColorStop(1,T.lac0);c.fillStyle=g;c.fillRect(0,0,390,844);}
function diamond(x,y,s,col,style){c.save();c.translate(x,y);c.rotate(Math.PI/4);
 if(style==='N'){c.strokeStyle=col;c.lineWidth=2;c.strokeRect(-s/2,-s/2,s,s);}
 else{c.fillStyle=col;c.fillRect(-s/2,-s/2,s,s);if(style==='E'){c.fillStyle=T.lac1;c.fillRect(-2,-2,4,4);}if(style==='L'){c.strokeStyle=col;c.lineWidth=1.2;c.strokeRect(-s/2-3,-s/2-3,s+6,s+6);}}
 c.restore();}
${body}
window.__done=1;});
</script></body></html>`;

const battleBg = `lacquer();
// 战斗页底层示意（敌人、武将、手牌）
c.globalAlpha=.9;for(const [x,y,w,h] of [[40,58,96,104],[147,58,96,104],[254,58,96,104],[95,200,96,132],[200,200,96,132],[290,478,88,188],[12,700,366,90]]){panel(x,y,w,h);}c.globalAlpha=1;`;
const scrim105 = `{const g=c.createRadialGradient(195,253,0,195,253,0.45*Math.hypot(390,844));g.addColorStop(0,'rgba(60,40,10,.55)');g.addColorStop(1,'rgba(0,0,0,.90)');c.fillStyle=g;c.fillRect(0,0,390,844);}
{const g=c.createRadialGradient(195,191,10,195,191,150);g.addColorStop(0,'rgba(233,200,119,.25)');g.addColorStop(1,'rgba(233,200,119,0)');c.fillStyle=g;c.fillRect(0,40,390,320);}
text('灵光一闪',195,56,B(34),T.gold,'center',1);
text('1 / 2',366,56,'bold 16px Georgia',T.gold,'right');
// 大牌 104×150 @ (143,116)
[[3,'rgba(233,200,119,.40)'],[7,'rgba(233,200,119,.18)']].forEach(([d,col])=>{rr(143-d,116-d,104+2*d,150+2*d,6+d);c.lineWidth=3;c.strokeStyle=col;c.stroke();});rr(143,116,104,150,6);c.fillStyle=T.paper2;c.fill();
rr(143,116,104,150,6);c.lineWidth=3;c.strokeStyle=T.gold;c.stroke();rr(151,126,88,92,3);c.fillStyle=T.cinnabar;c.fill();
text('杀',195,243,B(26),T.ink);c.beginPath();c.arc(156,130,12,0,7);c.fillStyle=T.jade;c.fill();text('1',156,131,'bold 15px Georgia',T.paper);`;

const e105a = battleBg + scrim105 + `
const C=[['迅击','N','费用 −1'],['双响','E','+1 目标'],['锋锐','R','伤害 +1']];
C.forEach(([n,r,d],i)=>{const y=310+i*88,sel=i===1;panel(20,y,350,76,sel?{stroke:T.goldHi,lw:2,glow:'rgba(233,200,119,.55)'}:{});
 diamond(48,y+38,14,RAR[r],r);text(n,72,y+38,B(26),T.paper,'left');text(d,350,y+38,B(17),T.paper,'right');});
text('词条不足 2 条，必须铭刻一条',195,746,B(13),T.paper3);
btn(274,776,96,44,'铭刻','confirm',false);`;

const e105b = battleBg + scrim105 + `
text('已有 2 条词条 · 选择要替换的一条',195,275,B(12),T.paper3);
[['迅击','N','费 −1',0],['破甲','E','甲 −1',1]].forEach(([n,r,d,tgt],i)=>{const x=20+i*181,y=282;panel(x,y,169,48,tgt?{stroke:T.cinnHi,lw:2}:{});
 diamond(x+20,y+24,11,RAR[r],r);text(n,x+36,y+24,B(22),T.paper,'left');
 c.font=B(22);const nEnd=x+36+c.measureText(n).width;const right=tgt?x+169-30:x+150;c.font=B(15);if(right-c.measureText(d).width>=nEnd+8)text(d,right,y+26,B(15),T.paper,'right');
 if(tgt){c.strokeStyle=T.cinnHi;c.lineWidth=2;c.beginPath();c.moveTo(x+34,y+25);c.lineTo(nEnd+2,y+25);c.stroke();rr(x+169-26,y+4,22,22,3);c.fillStyle=T.cinnabar;c.fill();text('替',x+169-15,y+15,B(14),T.paper);}});
[['锋锐','R','伤害 +1'],['双响','E','+1 目标'],['无影','L','不可被闪']].forEach(([n,r,d],i)=>{const y=362+i*80,sel=i===1;panel(20,y,350,68,sel?{stroke:T.goldHi,lw:2,glow:'rgba(233,200,119,.55)'}:{});
 diamond(48,y+34,14,RAR[r],r);text(n,72,y+34,B(24),T.paper,'left');text(d,350,y+34,B(16),T.paper,'right');});
text('先选新词条，再选替换哪条；或放弃本次灵光',195,746,B(13),T.paper3);
btn(20,776,96,44,'放弃','secondary',false);btn(274,776,96,44,'替换','confirm',false);`;

const mapBg = `lacquer();c.save();rr(18,106,354,654,4);c.fillStyle='#efe3c6';c.filter='brightness(0.35)';c.fill();c.restore();
for(let i=0;i<8;i++){c.beginPath();c.arc(80+(i%3)*115,700-i*70,14,0,7);c.fillStyle=T.lac1;c.fill();}
panel(18,48,354,50);text('第一章 · 黄巾',100,30,B(16),T.gold);`;
const e107a = mapBg + `c.fillStyle='rgba(5,2,1,.55)';c.fillRect(0,0,390,844);
panel(28,150,334,470);
c.save();c.shadowColor='rgba(212,96,76,.45)';c.shadowBlur=30;rr(120,172,150,206,6);c.fillStyle=T.paper2;c.fill();c.restore();
rr(120,172,150,206,6);c.lineWidth=3;c.strokeStyle=T.gold;c.stroke();
c.fillStyle='rgba(26,26,26,.85)';c.beginPath();c.ellipse(195,300,46,70,0,0,7);c.fill();c.fillStyle=T.cinnabar;c.beginPath();c.arc(195,226,10,0,7);c.fill();
['张','角'].forEach((ch,i)=>text(ch,138,194+i*28,B(26),T.ink));
text('进入首领战？',195,412,B(30),T.gold,'center',1);text('之后无法返回',195,442,B(14),T.paper3);
panel(50,466,290,52);for(let i=0;i<8;i++){c.beginPath();c.arc(70+i*17,492,7,0,7);c.fillStyle=i<6?T.jade:'#3a3a3a';c.fill();}
for(let i=0;i<3;i++){c.beginPath();c.arc(218+i*28,492,11,0,7);c.fillStyle=T.lac1;c.fill();c.strokeStyle=T.goldLo;c.lineWidth=1.5;c.stroke();}
text('◎ 86',330,492,'bold 14px Georgia',T.gold,'right');
btn(80,548,112,44,'整备','secondary');btn(204,548,112,44,'出战','primary');`;
const e107b = battleBg + `c.fillStyle='rgba(5,2,1,.72)';c.fillRect(0,0,390,844);
{const g=c.createLinearGradient(0,0,390,0);g.addColorStop(0,'rgba(21,10,8,0)');g.addColorStop(.18,'rgba(21,10,8,.96)');g.addColorStop(.82,'rgba(21,10,8,.96)');g.addColorStop(1,'rgba(21,10,8,0)');c.fillStyle=g;c.fillRect(0,320,390,140);
 c.fillStyle=T.goldLo;c.fillRect(40,320,310,1);c.fillRect(40,459,310,1);}
text('第一章 · 首领',195,342,B(14),T.paper3);
c.save();c.font=B(56);c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';[[12,.15],[7,.30],[3,.60]].forEach(([w,al])=>{c.globalAlpha=al;c.lineWidth=w;c.strokeStyle=T.cinnHi;c.strokeText('张角·墨魇',195,392);});c.restore();text('张角·墨魇',195,392,B(56),T.goldHi);
text('「苍天已死，黄天当立！」',195,438,B(20),T.paper);
text('点击跳过',195,800,B(13),'rgba(191,174,136,.6)'); // T.paper3 @ .6`;
const e107c = battleBg + `c.fillStyle='rgba(5,2,1,.5)';c.fillRect(0,0,390,844);
{const g=c.createLinearGradient(0,0,390,0);g.addColorStop(0,'rgba(5,2,1,0)');g.addColorStop(.15,'rgba(5,2,1,.6)');g.addColorStop(.85,'rgba(5,2,1,.6)');g.addColorStop(1,'rgba(5,2,1,0)');c.fillStyle=g;c.fillRect(0,357,390,70);}
text('苍天已死——',195,379,B(20),T.cinnHi);text('黄天当立！',195,405,B(20),T.cinnHi);`;

const b = await chromium.launch();
for (const [name, body] of [['spec-105-default', e105a], ['spec-105-full', e105b], ['spec-107-confirm', e107a], ['spec-107-intro', e107b], ['spec-107-phase', e107c]]) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', (e) => console.error(name, e.message));
  const f = path.join(out, name + '.html'); fs.writeFileSync(f, page(body));
  await p.goto('file://' + f); await p.waitForFunction(() => window.__done === 1); await p.waitForTimeout(200); fs.unlinkSync(f);
  await p.screenshot({ path: path.join(out, name + '.png') }); await p.close();
}
await b.close();
