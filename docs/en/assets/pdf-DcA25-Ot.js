import{t as e,p as N,L as T,d as M,a as y,I as m,o as A,c as j,g as v,m as p,b as D}from"./index-CzD18Bsi.js";const I={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},t=a=>String(a??"").replace(/[&<>"']/g,n=>I[n]??n),E=a=>a.trim().replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"_").slice(0,60)||"standes",P=a=>(a.replace(/[^a-zA-Z0-9]/g,"").slice(-6)||"000000").toUpperCase(),B=a=>new Intl.DateTimeFormat(m,{day:"2-digit",month:"long",year:"numeric"}).format(a),L=a=>new Intl.DateTimeFormat(m,{dateStyle:"medium",timeStyle:"short"}).format(a),h=" ";function r(a,n=0){return Number.isFinite(a)?new Intl.NumberFormat(m,{minimumFractionDigits:n,maximumFractionDigits:n}).format(a):"—"}const C=a=>Number.isFinite(a)?`${r(a,2)}${h}${e("м²")}`:"—";function k(a){if(!Number.isFinite(a))return"—";const n=Math.round(a*1e3);if(Math.abs(n)<1e3)return`${r(n)}${h}${e("г")}`;const s=Math.abs(a);return`${r(a,s<100?1:0)}${h}${e("кг")}`}const w=(a,n=0)=>Number.isFinite(a)?`${r(a*100,n)}${D?"":h}%`:"—";function u(a){if(!Number.isFinite(a))return"—";const n=Math.abs(a-Math.round(a))<.05?0:1;return new Intl.NumberFormat(m,{useGrouping:!1,minimumFractionDigits:n,maximumFractionDigits:n}).format(a)}function $(a,n,s){const i=[u(a),u(n)];return s!==void 0&&i.push(u(s)),i.join(`${h}×${h}`)}const _=a=>/^data:image\/(png|jpeg|webp);base64,/.test(a),H=`
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:#e9ebee;color:#15171b;
  font:400 12.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.toolbar{
  position:sticky;top:0;z-index:9;display:flex;align-items:center;gap:14px;
  padding:10px 18px;background:#15171b;color:#e8eaed;font-size:12.5px;
}
.toolbar .tb-brand{font-weight:700;letter-spacing:.14em;color:#e8b04b}
.toolbar .tb-hint{color:#9aa1ab}
.toolbar button{
  margin-left:auto;padding:7px 18px;border:0;border-radius:7px;cursor:pointer;
  background:#e8b04b;color:#241a06;font:inherit;font-weight:600;
}
.toolbar button:hover{background:#f5c56a}

.doc{max-width:210mm;margin:18px auto 48px;padding:14mm 13mm;background:#fff;box-shadow:0 12px 44px rgba(0,0,0,.16)}

/* шапка */
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
.brand .mark{font-size:22px;font-weight:800;letter-spacing:.2em}
.brand .tag{margin-top:3px;font-size:10.5px;letter-spacing:.06em;color:#6b7280;text-transform:uppercase}
.head .meta{text-align:right;font-size:11px;color:#6b7280;line-height:1.55}
.head .meta .kind{font-size:13px;font-weight:700;color:#15171b;letter-spacing:.02em}
.rule{height:3px;margin:9px 0 16px;background:linear-gradient(90deg,#e8b04b 0 34%,#15171b 34% 100%)}

h1{margin:0 0 10px;font-size:19px;font-weight:700;letter-spacing:-.01em}
h2{margin:22px 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#15171b}
h2::after{content:'';display:block;height:1px;margin-top:6px;background:#d9dce1}

/* факты */
.facts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 4px}
.fact{padding:5px 10px;border:1px solid #dfe2e7;border-radius:6px;background:#f7f8fa;font-size:11px;color:#3c4149}
.fact b{color:#15171b;font-weight:600}

/* снимок */
.shot{margin:14px 0 2px;border:1px solid #dfe2e7;border-radius:8px;overflow:hidden;background:#f2f3f5}
.shot img{display:block;width:100%;height:auto}
.cap{margin-top:5px;font-size:10.5px;color:#8b929c}

/* таблицы */
table{width:100%;border-collapse:collapse}
.tbl{font-size:11px}
.tbl th{
  padding:6px 7px;text-align:left;font-weight:600;font-size:10px;letter-spacing:.05em;
  text-transform:uppercase;color:#5b626c;border-bottom:1.5px solid #15171b;white-space:nowrap;
}
.tbl td{padding:5.5px 7px;border-bottom:1px solid #e6e8ec;vertical-align:top}
.tbl tbody tr:nth-child(even) td{background:#fafbfc}
.tbl .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tbl .idx{width:26px;color:#9aa1ab;text-align:right}
.tbl .dim{white-space:nowrap;font-variant-numeric:tabular-nums;color:#3c4149}
.tbl .mut{color:#6b7280}
.tbl tfoot td{padding:7px;border-top:1.5px solid #15171b;border-bottom:0;font-weight:600}

/* итоги */
.totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.tot{padding:9px 11px;border:1px solid #dfe2e7;border-radius:8px;background:#f7f8fa}
.tot .k{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
.tot .v{margin-top:3px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.grand{margin-top:10px;display:flex;align-items:baseline;justify-content:space-between;
  padding:11px 14px;border-radius:8px;background:#15171b;color:#fff}
.grand .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#c9ced6}
.grand .v{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;color:#e8b04b}

/* предупреждения */
.warns{margin-top:10px;border:1px solid #e6d5ae;border-left:3px solid #e8b04b;border-radius:6px;background:#fdf8ec;padding:9px 12px}
.warns li{font-size:11px;margin:2px 0}
.warns .lv-error{color:#b3261e}

/* раскрой */
.card{margin:12px 0 18px;border:1px solid #dfe2e7;border-radius:8px;overflow:hidden}
.card-head{display:flex;flex-wrap:wrap;gap:10px;align-items:baseline;padding:8px 11px;background:#f4f5f7;border-bottom:1px solid #dfe2e7;font-size:11px}
.card-head b{font-size:12px}
.card-head .sp{margin-left:auto;font-variant-numeric:tabular-nums}
.card-body{padding:10px 11px}
.card svg{display:block;width:100%;height:auto}
.legend{margin-top:9px;font-size:10px}
.legend th{padding:4px 6px;font-size:9px}
.legend td{padding:3.5px 6px}

.foot{margin-top:26px;padding-top:9px;border-top:1px solid #e6e8ec;display:flex;justify-content:space-between;font-size:10px;color:#8b929c}

@page{size:A4;margin:12mm}
@media print{
  body{background:#fff}
  .toolbar{display:none}
  .doc{max-width:none;margin:0;padding:0;box-shadow:none}
  h2{break-after:avoid;page-break-after:avoid}
  tr,.card,.tot,.grand,.shot,.warns{break-inside:avoid;page-break-inside:avoid}
  thead{display:table-header-group}
  .page-break{break-before:page;page-break-before:always}
}
`;function q(a,n,s){const i=a.room,d=a.units.length,o=[`<span class="fact">${t(e("Стеллажей"))}: <b>${d}</b></span>`,`<span class="fact">${t(e("Деталей"))}: <b>${r(n.totals.parts)}</b></span>`,`<span class="fact">${t(e("Площадь"))}: <b>${t(C(n.totals.area))}</b></span>`,`<span class="fact">${t(e("Масса"))}: <b>${t(k(n.totals.mass))}</b></span>`,`<span class="fact">${t(e("Помещение"))}: <b>${t($(i.width,i.depth,i.height))}</b> ${t(e("мм"))}</span>`];return s.totalSheets>0&&o.push(`<span class="fact">${t(e("Листов"))}: <b>${s.totalSheets}</b>, ${t(e("выход"))} <b>${t(w(s.averageUsage,1))}</b></span>`),`<div class="facts">${o.join("")}</div>`}function R(a){if(!a.length)return"";const n=a.map((s,i)=>{const d=A(s.frame),o=j(s).rects.length,c=s.frame.cols.length,b=s.frame.rows.length;return`<tr>
        <td class="idx">${i+1}</td>
        <td>${t(s.name)}</td>
        <td class="dim">${t($(d.x,d.z,d.y))}</td>
        <td class="mut">${c} × ${b}</td>
        <td class="n">${o}</td>
        <td class="mut">${t(e(v(s.materials.carcass).name))}</td>
        <td class="mut">${t(e(v(s.materials.front).name))}</td>
      </tr>`}).join("");return`<h2>${t(e("Состав проекта"))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${t(e("№"))}</th><th>${t(e("Стеллаж"))}</th><th>${t(e("Ш × Г × В, мм"))}</th>
      <th>${t(e("Сетка"))}</th><th class="n">${t(e("Ячеек"))}</th><th>${t(e("Корпус"))}</th><th>${t(e("Фасады"))}</th>
    </tr></thead>
    <tbody>${n}</tbody>
  </table>`}function U(a){if(!a.lines.length)return"";const n=a.lines.map((s,i)=>`<tr>
      <td class="idx">${i+1}</td>
      <td>${t(e(s.label))}</td>
      <td class="mut">${t(e(s.materialName))}</td>
      <td class="dim">${t(s.dims)}</td>
      <td class="n">${s.qty}</td>
      <td class="n">${r(s.areaTotal,3)}</td>
      <td class="n">${r(s.edgeTotal,2)}</td>
      <td class="n">${r(s.massTotal,2)}</td>
      <td class="n">${t(p(s.priceTotal))}</td>
    </tr>`).join("");return`<h2>${t(e("Детали"))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${t(e("№"))}</th><th>${t(e("Наименование"))}</th><th>${t(e("Материал"))}</th><th>${t(e("Размер, мм"))}</th>
      <th class="n">${t(e("Кол-во"))}</th><th class="n">${t(e("Площадь, м²"))}</th><th class="n">${t(e("Кромка, м"))}</th>
      <th class="n">${t(e("Масса, кг"))}</th><th class="n">${t(e("Сумма"))}</th>
    </tr></thead>
    <tbody>${n}</tbody>
    <tfoot><tr>
      <td colspan="4">${t(e("Итого по деталям"))}</td>
      <td class="n">${r(a.totals.parts)}</td>
      <td class="n">${r(a.totals.area,3)}</td>
      <td class="n">${r(a.totals.edge,2)}</td>
      <td class="n">${r(a.totals.mass,2)}</td>
      <td class="n">${t(p(a.totals.materialsPrice))}</td>
    </tr></tfoot>
  </table>`}function O(a){if(!a.hardware.length)return"";const n=a.hardware.map((s,i)=>`<tr>
      <td class="idx">${i+1}</td>
      <td>${t(e(s.label))}</td>
      <td class="n">${s.qty}</td>
      <td class="n">${t(p(s.priceEach))}</td>
      <td class="n">${t(p(s.priceTotal))}</td>
    </tr>`).join("");return`<h2>${t(e("Фурнитура"))}</h2>
  <table class="tbl">
    <thead><tr>
      <th class="idx">${t(e("№"))}</th><th>${t(e("Наименование"))}</th>
      <th class="n">${t(e("Кол-во"))}</th><th class="n">${t(e("Цена"))}</th><th class="n">${t(e("Сумма"))}</th>
    </tr></thead>
    <tbody>${n}</tbody>
    <tfoot><tr>
      <td colspan="4">${t(e("Итого фурнитура"))}</td>
      <td class="n">${t(p(a.totals.hardwarePrice))}</td>
    </tr></tfoot>
  </table>`}function G(a){if(!a.byMaterial.length)return"";const n=a.byMaterial.map(s=>`<tr>
      <td>${t(e(s.materialName))}</td>
      <td class="n">${r(s.area,3)}</td>
      <td class="n">${s.sheets||"—"}</td>
      <td class="n">${r(s.mass,2)}</td>
      <td class="n">${r(s.edge,2)}</td>
      <td class="n">${t(p(s.price))}</td>
    </tr>`).join("");return`<h2>${t(e("Сводка по материалам"))}</h2>
  <table class="tbl">
    <thead><tr>
      <th>${t(e("Материал"))}</th><th class="n">${t(e("Площадь, м²"))}</th><th class="n">${t(e("Листов"))}</th>
      <th class="n">${t(e("Масса, кг"))}</th><th class="n">${t(e("Кромка, м"))}</th><th class="n">${t(e("Сумма"))}</th>
    </tr></thead>
    <tbody>${n}</tbody>
  </table>`}function Y(a){const n=a.totals;return`<h2>${t(e("Итоги"))}</h2>
  <div class="totals">
    <div class="tot"><div class="k">${t(e("Материалы"))}</div><div class="v">${t(p(n.materialsPrice))}</div></div>
    <div class="tot"><div class="k">${t(e("Кромление"))}</div><div class="v">${t(p(n.edgePrice))}</div></div>
    <div class="tot"><div class="k">${t(e("Фурнитура"))}</div><div class="v">${t(p(n.hardwarePrice))}</div></div>
    <div class="tot"><div class="k">${t(e("Масса изделия"))}</div><div class="v">${t(k(n.mass))}</div></div>
  </div>
  <div class="grand"><span class="k">${t(e("Всего по спецификации"))}</span><span class="v">${t(p(n.price))}</span></div>`}function Z(a){if(!a.warnings.length)return"";const n=a.warnings.slice(0,40).map(s=>`<li class="lv-${t(s.level)}">${t(e(s.message))}</li>`).join("");return`<h2>${t(e("Замечания конструктора"))}</h2><ul class="warns">${n}</ul>`}function J(a,n,s){const i=v(a.materialId).color,d=Math.max(a.w,a.h)/1e3,o=2.2*d,c=34*d,b=a.pieces.map((l,x)=>{const F=l.x+l.w/2,z=l.y+l.h/2,S=l.w>c*2.4&&l.h>c*1.8?`<text x="${F.toFixed(1)}" y="${(z+c*.35).toFixed(1)}" font-size="${c.toFixed(1)}" text-anchor="middle" fill="#15171b" font-family="Arial,Helvetica,sans-serif">${x+1}</text>`:"";return`<rect x="${l.x.toFixed(1)}" y="${l.y.toFixed(1)}" width="${l.w.toFixed(1)}" height="${l.h.toFixed(1)}" fill="${t(i)}" fill-opacity="0.3" stroke="#15171b" stroke-width="${o.toFixed(2)}" />${S}`}).join(""),f=a.pieces.map((l,x)=>`<tr>
      <td class="idx">${x+1}</td>
      <td>${t(e(l.label))}</td>
      <td class="dim">${t($(l.w,l.h))}</td>
      <td class="mut">${l.rotated?t(e("повёрнута 90°")):"—"}</td>
    </tr>`).join(""),g=s>0?`<rect x="${s}" y="${s}" width="${a.w-s*2}" height="${a.h-s*2}" fill="none" stroke="#9aa1ab" stroke-width="${(o*.7).toFixed(2)}" stroke-dasharray="${(d*14).toFixed(1)} ${(d*10).toFixed(1)}" />`:"";return`<div class="card">
    <div class="card-head">
      <b>${t(e("Лист {n}",{n}))}</b>
      <span>${t(e(a.materialName))}</span>
      <span class="mut">${r(a.thickness,1)} ${t(e("мм"))}</span>
      <span class="dim">${t($(a.w,a.h))}</span>
      <span class="sp">${t(e("деталей"))}: ${a.pieces.length} · ${t(e("выход"))} ${t(w(a.usage,1))}</span>
    </div>
    <div class="card-body">
      <svg viewBox="0 0 ${a.w} ${a.h}" preserveAspectRatio="xMidYMid meet" role="img">
        <rect x="0" y="0" width="${a.w}" height="${a.h}" fill="#fbfbfc" stroke="#15171b" stroke-width="${(o*1.4).toFixed(2)}" />
        ${g}
        ${b}
      </svg>
      <table class="tbl legend">
        <thead><tr><th class="idx">${t(e("№"))}</th><th>${t(e("Деталь"))}</th><th>${t(e("Размер, мм"))}</th><th>${t(e("Раскладка"))}</th></tr></thead>
        <tbody>${f}</tbody>
      </table>
    </div>
  </div>`}function K(a,n){if(!a.sheets.length&&!a.unplaced.length)return"";const s=a.sheets.map((d,o)=>J(d,o+1,n)).join(""),i=a.unplaced.length?`<h2>${t(e("Не размещено"))}</h2>
       <table class="tbl">
         <thead><tr><th class="idx">${t(e("№"))}</th><th>${t(e("Деталь"))}</th><th>${t(e("Размер, мм"))}</th></tr></thead>
         <tbody>${a.unplaced.map((d,o)=>`<tr><td class="idx">${o+1}</td><td>${t(e(d.label))}</td><td class="dim">${t($(d.w,d.h))}</td></tr>`).join("")}</tbody>
       </table>`:"";return`<div class="page-break"></div>
  <h2>${t(e("Карта раскроя"))}</h2>
  <div class="facts">
    <span class="fact">${t(e("Листов"))}: <b>${a.totalSheets}</b></span>
    <span class="fact">${t(e("Средний выход"))}: <b>${t(w(a.averageUsage,1))}</b></span>
  </div>
  ${s}
  ${i}`}function Q(a,n,s,i,d={}){const o=new Date,c=e("Спецификация — {name}",{name:a.name}),b=i&&_(i)?`<figure class="shot"><img src="${i}" alt="${t(e("Вид проекта"))}" /></figure>
         <div class="cap">${t(e("Визуализация носит справочный характер; размеры и материалы — по таблицам ниже."))}</div>`:"",f=a.units.length,g=`
    <div class="toolbar">
      <span class="tb-brand">STANDES</span>
      <span class="tb-hint">${t(e("Проверьте документ и нажмите «Печать» — в диалоге выберите «Сохранить как PDF»."))}</span>
      <button type="button" onclick="window.print()">${t(e("Печать"))}</button>
    </div>
    <main class="doc">
      <header class="head">
        <div class="brand">
          <div class="mark">STANDES</div>
          <div class="tag">${t(e("Модульные стеллажи · конфигуратор"))}</div>
        </div>
        <div class="meta">
          <div class="kind">${t(e("Спецификация изделия"))}</div>
          <div>${t(B(o))}</div>
          <div>${t(e("№"))} ${t(P(a.id))}</div>
        </div>
      </header>
      <div class="rule"></div>

      <h1>${t(a.name)}</h1>
      ${q(a,n,s)}
      ${b}

      ${R(a.units)}
      ${Z(n)}
      ${U(n)}
      ${O(n)}
      ${G(n)}
      ${Y(n)}
      ${K(s,Math.max(0,d.cutMargin??10))}

      <div class="foot">
        <span>${t(d.author??e("Сформировано в конфигураторе STANDES"))}</span>
        <span>${t(L(o))} · ${f} ${t(N(f,"стеллаж","стеллажа","стеллажей"))}</span>
      </div>
    </main>`;return`<!doctype html>
<html lang="${T}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t(c)}</title>
<style>${H}</style>
</head>
<body>${g}</body>
</html>`}function X(a,n,s,i,d={}){try{const o=Q(a,n,s,i,d),c=window.open("","_blank");if(!c){M(`${E(a.name)}_${e("спецификация.html")}`,o,"text/html"),y().toast(e("Всплывающее окно заблокировано — спецификация сохранена файлом"),"warn");return}c.document.open(),c.document.write(o),c.document.close(),c.focus()}catch{y().toast(e("Не удалось собрать спецификацию"),"error")}}export{Q as buildSpecHtml,X as exportSpecHtml};
