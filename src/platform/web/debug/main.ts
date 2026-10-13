/** DOM 调试版入口：只在 `vite build --mode debug` 中构建，不进发布包（size-check 用下面的标记校验）。 */
export const DEBUG_DOM_BUILD_MARKER = '__MOJUAN_DEBUG_DOM__';
console.info(DEBUG_DOM_BUILD_MARKER);
import './style.css';
import { loadBrushFonts, webFontDeps } from '../brush-font';
import wenkaiCoreUrl from '../../../../public/assets/fonts/wenkai-core.woff2?url';
import wenkaiExtUrl from '../../../../public/assets/fonts/wenkai-ext.woff2?url';
import { Game, type BattleIO } from '../../../core/battle';
import { seeded } from '../../../core/rng';
import { def, enemyIntent, handLimit, isRed, RANK_CH, SUIT_CH } from '../../../core/rules';
import { comboOf } from '../../../game/select/model';
import { BATTLES } from '../../../data/enemies';
import type { AffixDef, CardInst } from '../../../core/types';
import { nextSkillStep, skillButtons, skillCardOk, skillTargetOk, type SkillButton, type SkillPick } from './skills';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const S = { autoShan: false, timeout: 8, demoEpi: false, confirmEnd: false, speed: 1 };
type Mode = 'idle' | 'target' | 'skillCard' | 'skillTarget' | 'redSel' | 'discard' | 'response' | 'enemy' | 'over';
const ui = {
  mode: 'idle' as Mode,
  busy: false,
  hint: '',
  pending: null as null | { card: CardInst; red?: CardInst },
  picks: [] as CardInst[],
  skill: null as null | { b: SkillButton; pick: SkillPick },
  need: 0,
  legal: null as null | ((c: CardInst) => boolean),
  respond: null as null | ((c: CardInst | null) => void),
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms / (S.speed || 1)));

const io: BattleIO = {
  log: () => renderLog(),
  update: () => render(),
  sleep,
  async showJudge({ reason, card: j }) {
    const js = $('#judgeShow');
    js.innerHTML = `判定·${reason}<br><span style="font-size:30px;color:${j.color === 'red' ? '#A63D2F' : '#1A1A1A'}">${SUIT_CH[j.suit]}${RANK_CH[j.rank]}</span> ${j.name}`;
    js.classList.remove('hidden');
    render();
    await sleep(900);
    js.classList.add('hidden');
  },
  respond: (text, legal, pass, timed) => responseWindow(text, legal, pass, timed),
  epiphany: (c, opts, reroll) => epiphanyUI(c, opts, reroll),
  hurt() {
    const p = $('#player');
    p.classList.add('hurt');
    setTimeout(() => p.classList.remove('hurt'), 400);
  },
  enemyHit(e) {
    document.querySelector(`[data-e="${e.uid}"]`)?.classList.add('hit');
  },
  handOverflow(ev) {
    hint(`手满，弃置「${def(ev.card).name}」`);
  },
  onBattleEnd: (win) => {
    ui.busy = false;
    ui.mode = 'over';
    setTimeout(() => (win ? battleWon() : lost()), win ? 500 : 0);
  },
};

let G: Game;
const q = new URLSearchParams(location.search);
if (q.has('demo')) S.demoEpi = true;
function newRun() {
  const seed = q.has('seed') ? Number(q.get('seed')) : Date.now() & 0xffffffff;
  G = new Game(seeded(seed), io, {
    autoShan: S.autoShan,
    epiphanyRate: S.demoEpi ? 0.5 : undefined,
    main: q.get('main') ?? undefined,
    sub: q.get('sub') ?? undefined,
    preset: q.get('preset') ?? undefined,
  });
  ui.mode = 'idle';
  ui.busy = false;
  ui.pending = null;
  ui.picks = [];
  ui.skill = null;
  G.startBattle();
}
function syncSettings() {
  if (G) {
    G.settings.autoShan = S.autoShan;
    G.settings.epiphanyRate = S.demoEpi ? 0.5 : undefined;
  }
}

// ---------- 渲染 ----------
function renderLog() {
  const el = $('#log');
  if (el && G)
    el.innerHTML = G.logs
      .slice(-4)
      .map((x) => `<div>${x}</div>`)
      .join('');
}
function render() {
  if (!G) return;
  $('#battleNo').textContent = `第${G.battleIdx + 1}/${BATTLES.length}战 · ${G.battle.name} · 回合${G.turn}`;
  // #55：顶部武将栏跟随 main/sub，不再写死关羽/赵云/龙虎会
  {
    const main = G.main;
    const sub = G.sub;
    $('#pmain').textContent = main.name;
    const ptag = $('#pinfo .ptag');
    if (ptag) ptag.textContent = `主将·${main.faction}`;
    const subEl = $('#sub .pname');
    if (subEl) subEl.textContent = sub.name;
    const combo = comboOf(main.id, sub.id);
    const comboEl = $('#combo');
    if (comboEl) comboEl.textContent = combo ? `珠联·${combo.name}` : '';
  }
  for (const row of ['front', 'back'] as const) {
    $('#' + row).innerHTML = G.alive()
      .filter((e) => e.row === row)
      .map((e) => {
        const ii = enemyIntent(e);
        const sk = ui.mode === 'skillTarget' && ui.skill;
        const tg = ui.mode === 'target' || !!sk;
        const ok = sk ? skillTargetOk(G, sk.b.id, e) : tg && ui.pending && G.canTarget(e, ui.pending.card);
        const lethal = ii.dmg > 0 && ii.dmg >= G.p.hp + G.p.armor;
        return `<div class="enemy ${e.elite ? 'elite' : ''} ${tg ? (ok ? 'targetable' : 'untarget') : ''}" data-e="${e.uid}" title="${ii.tip}">
        <div class="intent ${lethal ? 'lethal' : ''}">${ii.txt}</div>
        ${e.marks ? `<div class="marks">闪×${e.marks}</div>` : ''}
        <div class="ink">${e.g}</div><div class="nm">${e.name}</div>
        <div class="bar"><i style="width:${(e.hp / e.max) * 100}%"></i></div>
        <div class="st">${e.hp}/${e.max} ${e.armor ? '🛡' + e.armor : ''} ${e.judge.length ? '<span class="seal">乐</span>' : ''} 距${G.dist(e)}</div></div>`;
      })
      .join('');
  }
  const p = G.p;
  $('#hp').textContent = '体力 ' + '❤'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, p.maxHp - Math.max(0, p.hp))) + ` ${p.hp}/${p.maxHp}`;
  $('#armor').textContent = `🛡护甲 ${p.armor}`;
  $('#ling').innerHTML = `<b>军令 ${p.ling}/${p.maxLing}</b>`;
  const bf: string[] = [];
  if (p.jiu) bf.push(p.jiu > 1 ? '酒+2' : '酒');
  if (p.aogu) bf.push('傲骨');
  if (p.yiyong) bf.push('义勇');
  if (p.lianShan) bf.push('连环闪');
  $('#buffs').textContent = bf.length ? '状态:' + bf.join('·') : '';
  $('#equip').innerHTML =
    (['weapon', 'armor', 'plus', 'minus'] as const)
      .map((s) => {
        const c = p.equip[s];
        return c ? `<span>${def(c).name}${c.mods.length ? '*' : ''}</span>` : '';
      })
      .join('') + ` <small>范围${G.attackRange()}</small>`;
  const handEl = $('#hand');
  handEl.classList.toggle('crowded', G.hand.length >= 6);
  handEl.innerHTML = G.hand
    .map((c) => {
      const d = def(c);
      let cls = 'card';
      if (ui.pending?.card === c) cls += ' sel';
      if (ui.mode === 'response') cls += ui.legal?.(c) ? ' legal' : ' dim';
      if (['discard', 'redSel'].includes(ui.mode) && ui.picks.includes(c)) cls += ' sel';
      if (ui.mode === 'redSel' && (!isRed(c) || ui.pending?.card === c)) cls += ' dim';
      if (ui.mode === 'skillCard' && ui.skill && !skillCardOk(G, ui.skill.b.id, c)) cls += ' dim';
      if (c.mods.length) cls += ' evo';
      const nm = c.mods.map((m) => G.affixName(m)).join('·');
      return `<div class="${cls}" data-c="${c.uid}" title="${d.desc}"><div class="cost">${G.costOf(c)}</div>
     <div class="suit ${isRed(c) ? 'red' : ''}">${SUIT_CH[c.suit]}${RANK_CH[c.rank]}</div>
     <div class="cn">${d.name}</div><div class="ty">${d.type}</div><div class="ds">${d.desc.slice(0, 30)}</div>${nm ? `<div class="mods">${nm}</div>` : ''}</div>`;
    })
    .join('');
  $('#piles').textContent = `摸牌堆${G.draw.length} 弃牌堆${G.discard.length}`;
  $<HTMLButtonElement>('#btnEnd').disabled = ui.mode !== 'idle' || ui.busy;
  renderSkills();
  $('#hint').textContent = ui.hint;
  renderLog();
}
function renderSkills() {
  const locked = ui.mode !== 'idle' || ui.busy;
  $('#skills').innerHTML = skillButtons(G, locked)
    .map((b) => {
      const left = Number.isFinite(b.remaining) ? `（${Math.max(0, b.remaining)}）` : '';
      const tip = `${b.name}：${b.desc}${b.reason ? `【${b.reason}】` : ''}`;
      const on = ui.skill?.b.id === b.id ? ' sel' : '';
      return `<button class="skill${on}" data-skill="${b.id}" title="${tip}" ${b.disabled && !on ? 'disabled' : ''}>${b.name}${left}</button>`;
    })
    .join('');
}
const hint = (t: string) => {
  ui.hint = t;
};

// ---------- 弹层 ----------
function chooseMenu(title: string, opts: string[]) {
  return new Promise<number>((res) => {
    const o = $('#overlay');
    o.className = '';
    o.innerHTML = `<div class="panel"><p>${title}</p>${opts.map((x, i) => `<button data-i="${i}">${x}</button>`).join('')}</div>`;
    o.querySelectorAll<HTMLButtonElement>('button').forEach(
      (b) =>
        (b.onclick = () => {
          o.className = 'hidden';
          res(+b.dataset.i!);
        }),
    );
  });
}
function responseWindow(text: string, legal: (c: CardInst) => boolean, pass: string, timed: boolean) {
  return new Promise<CardInst | null>((res) => {
    const prev = ui.mode;
    ui.mode = 'response';
    ui.legal = legal;
    ui.busy = false;
    const o = $('#overlay');
    o.className = 'low';
    const T = S.timeout;
    o.innerHTML = `<div class="panel"><h2>响应</h2><p>${text}</p><p>请出${pass === '放弃' ? '【桃】/【酒】' : '【闪】'}（点亮的手牌）</p><div class="timer" id="tm" style="width:100%"></div><button id="rpass">${pass}</button></div>`;
    const t0 = Date.now();
    let iv = 0;
    const done = (c: CardInst | null) => {
      clearInterval(iv);
      o.className = 'hidden';
      ui.mode = prev === 'response' ? 'enemy' : prev;
      ui.legal = null;
      ui.busy = true;
      res(c);
    };
    ui.respond = done;
    $('#rpass').onclick = () => done(null);
    if (timed)
      iv = window.setInterval(() => {
        const f = 1 - (Date.now() - t0) / 1000 / T;
        const el = $('#tm');
        if (el) el.style.width = Math.max(0, f * 100) + '%';
        if (f <= 0) done(null);
      }, 100);
    render();
  });
}
function epiphanyUI(c: CardInst, first: AffixDef[], reroll: () => AffixDef[]) {
  return new Promise<AffixDef | null>((res) => {
    let adUsed = false;
    const o = $('#overlay');
    const show = (opts: AffixDef[]) => {
      o.className = '';
      o.innerHTML = `<div class="panel"><h2>灵光一闪</h2><p>【${def(c).name}】${SUIT_CH[c.suit]}${RANK_CH[c.rank]} 墨意翻涌，选择一条词条写入此牌</p>
      ${c.mods.length >= 2 ? '<p style="color:#A63D2F">已有2条词条：所选将替换最早一条</p>' : ''}
      ${opts.map((a, i) => `<div class="affix" data-i="${i}"><b>${a.n}</b> <span class="r">${a.r}</span><br>${a.d}</div>`).join('')}
      <button id="epAd" ${adUsed ? 'disabled' : ''}>看广告刷新（模拟）</button><button id="epSkip">放弃</button></div>`;
      o.querySelectorAll<HTMLElement>('.affix').forEach(
        (el) =>
          (el.onclick = () => {
            o.className = 'hidden';
            res(opts[+el.dataset.i!]);
          }),
      );
      $('#epAd').onclick = () => {
        adUsed = true;
        show(reroll());
      };
      $('#epSkip').onclick = () => {
        o.className = 'hidden';
        res(null);
      };
    };
    show(first);
  });
}
function battleWon() {
  const o = $('#overlay');
  o.className = '';
  const evo = G.evolved();
  const last = G.isLast;
  o.innerHTML = `<div class="panel"><h2>${last ? '黄巾荡平' : '战斗胜利'}</h2><p>${G.battle.name} 告捷，剩余体力 ${G.p.hp}/${G.p.maxHp}</p>
    <p>用时 ${G.turn} 回合</p><p>本场灵光一闪：${G.epiCount} 次</p>${evo.length ? `<p>进化之牌：${evo.map((c) => def(c).name + '「' + c.mods.map((m) => G.affixName(m)).join('·') + '」').join('，')}</p>` : ''}
    <button id="nx">${last ? '再来一局' : '下一战'}</button></div>`;
  $('#nx').onclick = () => {
    o.className = 'hidden';
    ui.mode = 'idle';
    hint('');
    if (last) newRun();
    else G.nextBattle();
  };
}
function lost() {
  const o = $('#overlay');
  o.className = '';
  o.innerHTML = `<div class="panel"><h2>败</h2><p>关羽力竭，墨卷合上……</p><p>止步于第${G.battleIdx + 1}战 · 回合${G.turn}</p><button id="rs">重新开始</button></div>`;
  $('#rs').onclick = () => {
    o.className = 'hidden';
    newRun();
  };
}

// ---------- 交互 ----------
function cancelPending() {
  ui.pending = null;
  ui.mode = 'idle';
  ui.picks = [];
  ui.skill = null;
  hint('');
  render();
}
function shakeCost(c: CardInst) {
  const el = document.querySelector(`[data-c="${c.uid}"] .cost`);
  if (el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 300);
  }
}
async function run(fn: () => Promise<void>) {
  ui.busy = true;
  hint('');
  render();
  try {
    await fn();
  } finally {
    if (ui.mode !== 'over') {
      ui.busy = false;
      if (ui.mode !== 'response') ui.mode = 'idle';
    }
    render();
  }
}

async function clickCard(c: CardInst) {
  if (ui.mode === 'response') {
    if (ui.legal?.(c)) ui.respond?.(c);
    return;
  }
  if (ui.busy) return;
  if (ui.mode === 'skillCard' && ui.skill) {
    if (!skillCardOk(G, ui.skill.b.id, c)) return;
    ui.skill.pick.card = c;
    await advanceSkill();
    return;
  }
  if (ui.mode === 'redSel') {
    if (!isRed(c) || ui.pending?.card === c) return;
    ui.pending!.red = c;
    ui.mode = 'target';
    hint('选择目标');
    render();
    return;
  }
  if (ui.mode === 'discard') {
    const i = ui.picks.indexOf(c);
    if (i >= 0) ui.picks.splice(i, 1);
    else ui.picks.push(c);
    hint(`弃牌：还需选择 ${ui.need - ui.picks.length} 张`);
    if (ui.picks.length === ui.need) {
      const d = ui.picks;
      ui.picks = [];
      ui.mode = 'enemy';
      await run(() => G.endTurn(d));
      return;
    }
    render();
    return;
  }
  if (ui.mode === 'target') {
    const same = ui.pending?.card === c;
    cancelPending();
    if (same) return;
  }
  if (ui.mode !== 'idle') return;
  const d = def(c);
  c.asSha = false;
  const conv = G.canAsSha(c) ? G.effects.convertFor(c, 'B001') : undefined;
  if (conv && d.shan) c.asSha = true;
  else if (conv) {
    const k = await chooseMenu(`${d.name}（${SUIT_CH[c.suit]}${isRed(c) ? '红色' : '黑色'}）`, ['原效果', `${conv.ab.name}：当【杀】使用`, '取消']);
    if (k === 2) return;
    c.asSha = k === 1;
  }
  const err = G.checkPlay(c);
  if (err) {
    if (err === '军令不足') shakeCost(c);
    c.asSha = false;
    hint(err);
    render();
    return;
  }
  if (d.needRed && !c.asSha) {
    ui.pending = { card: c };
    ui.mode = 'redSel';
    ui.picks = [];
    hint('武圣斩：选择一张红色牌当杀');
    render();
    return;
  }
  if (G.needsTarget(c)) {
    ui.pending = { card: c };
    ui.mode = 'target';
    hint('选择目标（再点此牌取消）');
    render();
    return;
  }
  await run(() => G.play(c, null));
}
async function clickEnemy(uid: number) {
  if (ui.mode === 'skillTarget' && ui.skill && !ui.busy) {
    const e = G.en.find((x) => x.uid === uid);
    if (!e || !skillTargetOk(G, ui.skill.b.id, e)) return;
    ui.skill.pick.target = e;
    await advanceSkill();
    return;
  }
  if (ui.mode !== 'target' || ui.busy || !ui.pending) return;
  const e = G.en.find((x) => x.uid === uid);
  if (!e || !G.canTarget(e, ui.pending.card)) {
    hint('目标不在攻击范围内');
    render();
    return;
  }
  const { card, red } = ui.pending;
  ui.pending = null;
  ui.mode = 'idle';
  await run(() => G.play(card, e, red));
}
/** 主动技：按配置需求依次选牌 / 选目标，齐了就交给引擎 activate */
async function advanceSkill() {
  const sk = ui.skill;
  if (!sk) return;
  const step = nextSkillStep(sk.b, sk.pick);
  if (step === 'card') {
    ui.mode = 'skillCard';
    hint(`${sk.b.name}：选择要弃置的牌（点空白或再点技能取消）`);
  } else if (step === 'target') {
    ui.mode = 'skillTarget';
    hint(`${sk.b.name}：选择一名敌人（点空白或再点技能取消）`);
  } else {
    ui.skill = null;
    ui.mode = 'idle';
    await run(() => G.activate(sk.b.id, sk.pick.card, sk.pick.target));
    return;
  }
  render();
}
function clickSkill(id: string) {
  if (ui.skill?.b.id === id) return cancelPending();
  if (ui.mode !== 'idle' || ui.busy) return;
  const b = skillButtons(G).find((x) => x.id === id);
  if (!b) return;
  if (b.disabled) {
    hint(`${b.name}：${b.reason}`);
    render();
    return;
  }
  ui.skill = { b, pick: {} };
  void advanceSkill();
}
$('#btnEnd').onclick = async () => {
  if (ui.mode !== 'idle' || ui.busy) return;
  if (S.confirmEnd && (await chooseMenu('确认结束回合？', ['结束', '取消']))) return;
  G.turnEnd();
  const need = G.discardNeeded();
  if (need) {
    ui.mode = 'discard';
    ui.need = need;
    ui.picks = [];
    hint(`手牌上限${handLimit(G.p.hp)}：选择 ${need} 张弃置`);
    render();
    return;
  }
  ui.mode = 'enemy';
  hint('敌方回合');
  await run(() => G.endTurn());
};
$('#btnSet').onclick = () => {
  const o = $('#overlay');
  o.className = '';
  o.innerHTML = `<div class="panel"><h2>设置</h2>
   <label><input type="checkbox" id="sA" ${S.autoShan ? 'checked' : ''}> 自动出闪</label>
   <label><input type="checkbox" id="sC" ${S.confirmEnd ? 'checked' : ''}> 结束回合二次确认</label>
   <label>响应时限 <select id="sT">${[5, 8, 12].map((x) => `<option ${x == S.timeout ? 'selected' : ''}>${x}</option>`).join('')}</select> 秒</label>
   <label>动画速度 <select id="sV">${[1, 1.5, 2].map((x) => `<option ${x == S.speed ? 'selected' : ''}>${x}</option>`).join('')}</select>x</label>
   <label><input type="checkbox" id="sE" ${S.demoEpi ? 'checked' : ''}> 演示：灵光一闪触发率50%（PRD为8%）</label>
   <button id="sOk">确定</button> <button id="sRe">重新开始</button></div>`;
  $('#sOk').onclick = () => {
    S.autoShan = $<HTMLInputElement>('#sA').checked;
    S.confirmEnd = $<HTMLInputElement>('#sC').checked;
    S.timeout = +$<HTMLSelectElement>('#sT').value;
    S.speed = +$<HTMLSelectElement>('#sV').value;
    S.demoEpi = $<HTMLInputElement>('#sE').checked;
    syncSettings();
    o.className = 'hidden';
    render();
  };
  $('#sRe').onclick = () => {
    o.className = 'hidden';
    newRun();
  };
};
document.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  const sb = t.closest<HTMLElement>('[data-skill]');
  if (sb) {
    clickSkill(sb.dataset.skill!);
    return;
  }
  const c = t.closest<HTMLElement>('.card');
  if (c) {
    const card = G.hand.find((x) => x.uid == +c.dataset.c!);
    if (card) void clickCard(card);
    return;
  }
  const e = t.closest<HTMLElement>('.enemy');
  if (e) {
    void clickEnemy(+e.dataset.e!);
    return;
  }
  if (t.closest('#field') && ['target', 'skillCard', 'skillTarget', 'redSel'].includes(ui.mode)) cancelPending();
});
// 调试/自动化测试钩子
Object.assign(window, { G_: () => G, S_: S, UI_: ui });
newRun();

// #142：调试页同样加载霞鹜文楷（CSS 族名 Brush），不回退系统字体
void loadBrushFonts(
  webFontDeps((m, e) => console.warn(m, e ?? '')),
  { core: wenkaiCoreUrl, ext: wenkaiExtUrl },
);
