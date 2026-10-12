// 一次性生成 art/src/icons/*.svg（印章样式源文件）。改图请直接改 SVG，或改这里后重跑：node art/tools/gen-icon-svgs.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../src/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const C = { lac0:'#070302', lac1:'#150A08', gold:'#E9C877', goldHi:'#F4DC9A', goldLo:'#8A6A2A', goldDk:'#6E4A18', paper:'#F3EBD8', ink:'#1A1A1A', cinn:'#A63D2F', cinnHi:'#D4604C', dmg:'#FF8A73', jade:'#4F9A7C', jadeHi:'#9AD4B8', jadeDk:'#1D4A3A', azure:'#5B7C8A', def:'#9CC3D1', silver:'#CFD6D9' };
// ---- 笔画原件（56 画布，中心 28）----
const sword = (r=0,s=1)=>`<g transform="rotate(${r} 28 28) translate(28 28) scale(${s}) translate(-28 -28)"><path d="M28 9 L31 14 L31 34 L25 34 L25 14 Z"/><path d="M19 34 H37 V37.5 H19 Z"/><path d="M26.3 37.5 H29.7 V44 H26.3 Z"/><circle cx="28" cy="46" r="2.4"/></g>`;
const shield = (extra='')=>`<path d="M28 10 L42 15 V27 C42 36 35 42 28 46 C21 42 14 36 14 27 V15 Z"/>${extra}`;
const shieldHole = `<path fill-rule="evenodd" d="M28 10 L42 15 V27 C42 36 35 42 28 46 C21 42 14 36 14 27 V15 Z M28 16 L37 19 V27 C37 33 33 37 28 40 C23 37 19 33 19 27 V19 Z"/>`;
const plus = (x,y,s=5)=>`<path d="M${x-s} ${y-1.6} H${x-1.6} V${y-s} H${x+1.6} V${y-1.6} H${x+s} V${y+1.6} H${x+1.6} V${y+s} H${x-1.6} V${y+1.6} H${x-s} Z"/>`;
const arrow = (x1,y1,x2,y2,w=2.4)=>{const a=Math.atan2(y2-y1,x2-x1),c=Math.cos(a),s=Math.sin(a),h=7,hw=4.5;const bx=x2-c*h,by=y2-s*h;return `<path d="M${x1} ${y1} L${bx} ${by}" stroke-width="${w}" stroke-linecap="round" fill="none" class="st"/><path d="M${x2} ${y2} L${bx-s*hw} ${by+c*hw} L${bx+s*hw} ${by-c*hw} Z"/>`;};
const flame = (x=28,y=28,k=1)=>`<path transform="translate(${x} ${y}) scale(${k}) translate(-28 -28)" d="M28 9 C33 17 40 20 39 31 C38 40 33 45 28 45 C21 45 16 40 17 32 C18 26 22 24 22 18 C25 21 26 24 26 27 C29 23 30 16 28 9 Z M28 44 C31 44 34 41 33 36 C32 32 29 31 29 27 C26 31 23 33 23 37 C23 41 25 44 28 44 Z" fill-rule="evenodd"/>`;
const dodge = `<path d="M14 36 C20 22 32 16 44 15 C36 20 30 27 27 38 Z"/><path d="M14 40 C24 37 32 38 42 33 C36 40 26 43 14 40 Z" opacity=".8"/>`;
const peach = `<path d="M28 18 C20 12 11 18 13 28 C15 38 24 44 28 45 C32 44 41 38 43 28 C45 18 36 12 28 18 Z"/><path d="M28 18 C30 13 34 10 39 10 C37 15 33 17 28 18 Z" class="ac"/>`;
const wine = `<path d="M18 13 H38 L36 17 H20 Z"/><path d="M20 19 H36 C36 26 41 30 41 37 C41 43 35 46 28 46 C21 46 15 43 15 37 C15 30 20 26 20 19 Z"/>`;
const scroll = `<path d="M15 14 H41 V19 H15 Z M15 37 H41 V42 H15 Z"/><path d="M18 19 H38 V37 H18 Z" opacity=".75"/>`;
const bolt = `<path d="M31 8 L17 31 H26 L22 48 L39 23 H29 Z"/>`;
const chainL = `<path fill-rule="evenodd" d="M12 24 a8 8 0 0 1 8-8 h6 a8 8 0 0 1 0 16 h-2 v-4 h2 a4 4 0 0 0 0-8 h-6 a4 4 0 0 0 0 8 v4 a8 8 0 0 1 -8-8 Z"/><path fill-rule="evenodd" d="M44 32 a8 8 0 0 1 -8 8 h-6 a8 8 0 0 1 0-16 h2 v4 h-2 a4 4 0 0 0 0 8 h6 a4 4 0 0 0 0-8 v-4 a8 8 0 0 1 8 8 Z"/>`;
const drum = `<ellipse cx="28" cy="18" rx="13" ry="5"/><path d="M15 18 V36 C15 39 21 42 28 42 C35 42 41 39 41 36 V18 C41 21 35 23 28 23 C21 23 15 21 15 18 Z" opacity=".85"/><path d="M33 8 L44 4 M23 8 L12 4" stroke-width="2.6" stroke-linecap="round" class="st"/>`;
const card = (x,y,r=0)=>`<rect x="${x}" y="${y}" width="15" height="21" rx="2" transform="rotate(${r} ${x+7.5} ${y+10.5})"/>`;
const eye = `<path d="M10 28 C16 19 22 16 28 16 C34 16 40 19 46 28 C40 37 34 40 28 40 C22 40 16 37 10 28 Z M28 21 A7 7 0 1 0 28.01 21 Z" fill-rule="evenodd"/><circle cx="28" cy="28" r="3"/>`;
const coin = `<path fill-rule="evenodd" d="M28 10 A18 18 0 1 0 28.01 10 Z M23 23 H33 V33 H23 Z"/><circle cx="28" cy="28" r="14.5" fill="none" stroke-width="1.4" class="st" opacity=".6"/>`;
const taiji = `<path fill-rule="evenodd" d="M28 11 A17 17 0 1 0 28.01 11 Z M28 14 A14 14 0 0 1 28 42 A7 7 0 0 1 28 28 A7 7 0 0 0 28 14 Z"/><circle cx="28" cy="21" r="2.4" class="ac"/><circle cx="28" cy="35" r="2.4"/>`;
const curtain = `<path d="M11 11 H45 V15 H11 Z"/><path d="M13 15 H25 C24 26 20 36 13 45 Z M43 15 H31 C32 26 36 36 43 45 Z"/>`;
const X = (x,y,s=6,w=3)=>`<path d="M${x-s} ${y-s} L${x+s} ${y+s} M${x+s} ${y-s} L${x-s} ${y+s}" stroke-width="${w}" stroke-linecap="round" class="st"/>`;
const ring=(cx,cy,r,w=2.4)=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${w}" class="st"/>`;
const T=(s,x=28,y=36,fs=22)=>`<text x="${x}" y="${y}" font-size="${fs}" text-anchor="middle" font-family="DejaVu Serif" font-weight="bold">${s}</text>`;
const jade = `<path d="M30 10 C40 11 45 20 42 29 C40 36 33 39 28 46 C26 40 18 38 16 30 C14 22 20 12 30 10 Z M29 18 A5 5 0 1 0 29.01 18 Z" fill-rule="evenodd"/>`;
// ---- 图标表：id → [类别, 主色, 内容] ----
// 类别：intent 实心色印（纸色字）；affix 漆底金边方印；status 漆底圆印；ui 无印框；node 圆章
const I = {
  sha:['intent',C.cinn, sword(35)],
  buff:['intent',C.goldDk, drum],
  defend:['intent','#3F6A78', shield()],
  volley:['intent',C.cinn, arrow(14,42,40,16)+arrow(10,30,30,10)+arrow(26,46,46,26)],
  sharp:['affix',C.gold, sword(35,.85)+plus(40,15,5)],
  light:['affix',C.gold, `<path d="M14 36 C22 34 30 26 36 12 C40 24 38 36 28 42 C22 45 16 42 14 36 Z"/><path d="M12 46 H44" stroke-width="2.4" class="st" stroke-linecap="round"/>`],
  chase:['affix',C.gold, `<path d="M12 18 L24 28 L12 38 Z M24 18 L36 28 L24 38 Z"/><path d="M36 18 L46 28 L36 38 Z" opacity=".6"/>`],
  pierce_range:['affix',C.gold, ring(32,24,10)+ring(32,24,4,2)+arrow(10,46,30,26,2.6)],
  fire:['affix',C.cinnHi, flame()],
  double:['affix',C.gold, sword(30,.9)+sword(-30,.9)],
  break_armor:['affix',C.gold, `<path d="M28 10 L42 15 V27 C42 36 35 42 28 46 L31 34 L25 28 L30 20 Z"/><path d="M26 10.8 L14 15 V27 C14 35 19 40 25 44 L22 33 L18 28 L24 19 Z"/>`],
  unblockable:['affix',C.gold, dodge+X(38,38,5,2.6)],
  echo:['affix',C.gold, `<path d="M24 14 C33 18 33 38 24 42" stroke-width="3" fill="none" class="st" stroke-linecap="round"/><path d="M32 10 C44 16 44 40 32 46" stroke-width="2.4" fill="none" class="st" stroke-linecap="round" opacity=".7"/><circle cx="15" cy="28" r="5"/>`],
  recoil:['affix',C.gold, shield(`<g class="ac">${arrow(28,30,14,44,2.6)}</g>`).replace('<path d="M28 10','<path opacity=".75" d="M28 10')+arrow(30,26,46,10,2.6)],
  chain_dodge:['affix',C.gold, `<g transform="translate(-6 -4) scale(.85)">${dodge}</g><g transform="translate(12 10) scale(.7)">${dodge}</g>`],
  heal_plus:['affix',C.gold, peach.replace('class="ac"','')+`<g class="ac">${plus(40,40,6)}</g>`],
  regen_armor:['affix',C.gold, shieldHole+`<path d="M28 24 C24 26 23 31 28 35 C33 31 32 26 28 24 Z" class="ac"/>`],
  wine_plus:['affix',C.gold, wine+`<g class="ac">${plus(40,38,6)}</g>`],
  cost_down:['affix',C.gold, ring(24,24,11,2.8)+T('1',24,30,16)+`<path d="M38 30 V44 M32 38 L38 45 L44 38" stroke-width="2.8" fill="none" class="st" stroke-linecap="round" stroke-linejoin="round"/>`],
  ink_draw:['affix',C.gold, `<path d="M28 9 C35 20 40 26 40 33 C40 40 35 45 28 45 C21 45 16 40 16 33 C16 26 21 20 28 9 Z"/><path d="M24 30 C23 35 25 39 29 40" stroke-width="2" fill="none" class="ac2" stroke-linecap="round"/>`],
  no_nullify:['affix',C.gold, ring(28,28,15,3)+`<path d="M18 38 L38 18" stroke-width="3" class="st"/>`.replace('M18 38 L38 18','M17 39 L39 17')+X(28,28,0,0)+`<circle cx="28" cy="28" r="6"/>`],
  extra_draw:['affix',C.gold, card(12,15,-10)+card(26,13,8)+`<g class="ac">${plus(40,40,5.5)}</g>`],
  aoe_plus:['affix',C.gold, `<circle cx="28" cy="28" r="5"/>`+ring(28,28,11,2.4)+`<circle cx="28" cy="28" r="17" fill="none" stroke-width="2" class="st" stroke-dasharray="5 4"/>`],
  ling:['affix',C.goldHi, eye],
  sturdy:['affix',C.gold, `<path d="M10 40 H46 V45 H10 Z M15 32 H41 V38 H15 Z M20 24 H36 V30 H20 Z"/><path d="M28 9 L33 22 H23 Z"/>`],
  range_plus:['affix',C.gold, `<path d="M10 40 C18 18 38 18 46 40" stroke-width="3" fill="none" class="st" stroke-linecap="round"/>`+arrow(16,28,44,20,2.4)+`<g class="ac">${plus(18,44,4)}</g>`],
  equip_draw:['affix',C.gold, shield().replace('<path d','<path transform="translate(-6 -2) scale(.8)" d')+card(28,22,10)],
  calm:['affix',C.gold, `<path d="M28 34 C22 26 22 18 28 10 C34 18 34 26 28 34 Z"/><path d="M28 36 C20 36 13 32 10 24 C18 23 25 27 28 36 Z M28 36 C36 36 43 32 46 24 C38 23 31 27 28 36 Z"/><path d="M12 42 H44" stroke-width="2.4" class="st" stroke-linecap="round"/>`],
  armor:['status',C.def, shield()],
  flash_mark:['status',C.gold, dodge],
  chain:['status',C.silver, chainL],
  lebu:['status',C.jadeHi, scroll+`<path d="M22 28 C24 24 27 24 28 28 C29 32 32 32 34 28" stroke-width="2" fill="none" class="ac2" stroke-linecap="round"/>`],
  bingliang:['status','#C49A6A', `<path d="M17 20 H39 L36 44 H20 Z"/><path d="M15 16 H41 V20 H15 Z"/>`+X(28,32,6,2.6).replace('class="st"','class="ac2"')],
  lightning:['status',C.goldHi, bolt],
  wine:['status',C.cinnHi, wine],
  curse:['status',C.cinnHi, `<path d="M16 12 H40 V46 L28 40 L16 46 Z"/><path d="M22 20 H34 M22 26 H34 M28 20 V34" stroke-width="2.2" fill="none" class="ac2" stroke-linecap="round"/>`],
  quota:['status',C.paper, `<g transform="translate(-6 0) scale(.78) translate(6 8)">${taiji}</g><rect x="33" y="30" width="15" height="15" rx="2" fill="none" stroke-width="1.6" class="st" opacity=".8"/>`],
  immune_trick:['status',C.jadeHi, curtain],
  ui_coin:['ui',C.gold, coin],
  ui_soul:['ui',C.def, `<path d="M28 8 C36 18 40 24 38 32 C36 40 30 44 24 44 C30 40 30 34 26 30 C24 36 20 38 18 36 C14 30 20 22 28 8 Z"/>`],
  ui_tally:['ui',C.gold, `<path d="M12 26 C12 18 18 14 26 14 L40 14 C44 14 46 17 44 20 L38 26 L44 32 C46 35 44 38 40 38 L22 38 C16 38 12 33 12 26 Z"/><path d="M19 26 H34" stroke-width="2" class="ac2"/><circle cx="20" cy="22" r="1.8" class="ac2"/>`],
  ui_deck:['ui',C.gold, `<rect x="14" y="16" width="20" height="28" rx="2.5" opacity=".55"/><rect x="18" y="13" width="20" height="28" rx="2.5" opacity=".8"/><rect x="22" y="10" width="20" height="28" rx="2.5"/>`],
  ui_book:['ui',C.gold, `<path d="M8 14 C16 12 23 14 27 18 V44 C22 40 15 39 8 41 Z M48 14 C40 12 33 14 29 18 V44 C34 40 41 39 48 41 Z"/>`],
  ui_gourd:['ui',C.jadeHi, `<path d="M28 9 a3 3 0 0 1 3 3 v2 C35 16 36 21 32 24 C40 27 42 34 40 39 C38 44 33 47 28 47 C23 47 18 44 16 39 C14 34 16 27 24 24 C20 21 21 16 25 14 v-2 a3 3 0 0 1 3 -3 Z"/><path d="M21 25 H35" stroke-width="2" class="ac2"/>`],
  ui_relic:['ui',C.gold, jade],
  ui_node_battle:['node',C.cinn, sword(40,.8)+sword(-40,.8)],
  ui_node_elite:['node','#7A1E14', `<path d="M14 40 L12 16 L21 25 L28 12 L35 25 L44 16 L42 40 Z"/><path d="M14 43 H42" stroke-width="3" class="st"/>`],
  ui_node_event:['node','#3C5A8A', T('?',28,38,28)],
  ui_node_rest:['node',C.jadeDk, `<path d="M14 42 L28 30 L42 42" stroke-width="3" fill="none" class="st" stroke-linecap="round"/>`+flame(28,26,.55)],
  ui_node_shop:['node',C.goldDk, coin],
  ui_node_chest:['node','#5A3A1A', `<path d="M12 24 C12 16 18 13 28 13 C38 13 44 16 44 24 Z"/><path d="M12 26 H44 V43 H12 Z"/><rect x="25" y="23" width="6" height="8" rx="1" class="ac2"/>`],
  ui_node_boss:['node','#4A0E08', `<path d="M14 22 C14 13 21 9 28 9 C35 9 42 13 42 22 C42 29 38 31 38 35 V42 H18 V35 C18 31 14 29 14 22 Z M21 20 a4 4 0 1 0 0.01 0 Z M35 20 a4 4 0 1 0 0.01 0 Z" fill-rule="evenodd"/><path d="M23 42 V36 M28 42 V35 M33 42 V36" stroke-width="2" class="ac2"/>`],
  ui_gear:['ui',C.gold, `<path fill-rule="evenodd" d="${(()=>{let d='';for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?13:18;d+=(i?'L':'M')+(28+r*Math.cos(a-0.12)).toFixed(1)+' '+(28+r*Math.sin(a-0.12)).toFixed(1)+' L'+(28+r*Math.cos(a+0.12)).toFixed(1)+' '+(28+r*Math.sin(a+0.12)).toFixed(1)+' ';}return d+'Z M28 22 A6 6 0 1 0 28.01 22 Z';})()}"/>`],
  ui_ad:['ui',C.gold, `<rect x="9" y="14" width="38" height="28" rx="5"/><path d="M24 21 L35 28 L24 35 Z" class="ac2"/>`],
  ui_refresh:['ui',C.gold, `<path d="M40 22 A13 13 0 1 0 41 32" stroke-width="3.4" fill="none" class="st" stroke-linecap="round"/><path d="M44 12 L44 25 L31 23 Z"/>`],
  ui_trash:['ui',C.gold, `<path d="M14 15 H42 V19 H14 Z M23 11 H33 V15 H23 Z"/><path d="M17 21 H39 L37 45 H19 Z"/><path d="M24 25 V41 M32 25 V41" stroke-width="2" class="ac2"/>`],
  ui_hourglass:['ui',C.gold, `<path d="M14 9 H42 V13 H14 Z M14 43 H42 V47 H14 Z"/><path d="M17 13 H39 C39 21 31 25 31 28 C31 31 39 35 39 43 H17 C17 35 25 31 25 28 C25 25 17 21 17 13 Z"/><path d="M21 41 C23 36 33 36 35 41 Z" class="ac2"/>`],
};
const SHADOW = `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.4"/><feOffset dy="1.2"/><feComponentTransfer><feFuncA type="linear" slope=".85"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="rough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G"/></filter>`;
function svg(id,[cat,col,body]){
  let seal='', fg=col, st=col, ac=C.cinnHi, ac2=C.lac1, outline=C.lac0;
  if(cat==='intent'){ seal=`<rect x="5" y="5" width="46" height="46" rx="7" fill="${col}"/><rect x="8" y="8" width="40" height="40" rx="5" fill="none" stroke="${C.paper}" stroke-opacity=".55" stroke-width="1.2"/>`; fg=st=C.paper; ac=C.goldHi; ac2=col; outline='#2a0a06'; }
  else if(cat==='affix'){ seal=`<rect x="5" y="5" width="46" height="46" rx="6" fill="${C.lac1}"/><rect x="5.8" y="5.8" width="44.4" height="44.4" rx="5.5" fill="none" stroke="${C.gold}" stroke-width="1.6"/>`; }
  else if(cat==='status'){ seal=`<circle cx="28" cy="28" r="23" fill="${C.lac1}"/><circle cx="28" cy="28" r="22" fill="none" stroke="${C.goldLo}" stroke-width="1.6"/>`; }
  else if(cat==='node'){ seal=`<circle cx="28" cy="28" r="23" fill="${col}"/><circle cx="28" cy="28" r="22" fill="none" stroke="${C.gold}" stroke-width="1.8"/>`; fg=st=C.paper; ac=C.goldHi; ac2=col; outline='#000'; }

  const sc = (cat==='intent'||cat==='affix'||cat==='status'||cat==='node') ? .78 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
<!-- 《墨卷三国》印章图标 ${id}（${cat}）· 2x 56×56，四周 4px 留给烘焙阴影；内容 48×48 -->
<defs>${SHADOW}<style>.st{stroke:${st};fill:none}.ac{fill:${ac}}.ac2{fill:${ac2};stroke:${ac2}}</style></defs>
<g filter="url(#sh)">
<g filter="url(#rough)">${seal}</g>
<g transform="translate(28 28) scale(${sc}) translate(-28 -28)" fill="${fg}" stroke="${outline}" stroke-width="${cat==='ui'?2:0}" paint-order="stroke" stroke-linejoin="round">${body}</g>
</g></svg>
`;
}
for (const [id,v] of Object.entries(I)) writeFileSync(new URL(id+'.svg',OUT), svg(id,v));
console.log(Object.keys(I).length,'icons');
