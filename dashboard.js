"use strict";

const { esc, time, departments, statuses, stages, eventLabels } = Demo;
const roles = {
  staff: { name: "Сотрудник", actor: "Дежурный", work: true },
  manager: { name: "Управляющий", actor: "Управляющий", manage: true },
  admin: { name: "Администратор", actor: "Администратор", work: true, manage: true },
  lead: { name: "Руководитель горничных", actor: "Старшая горничная", work: true, dept: "housekeeping" },
};
const labels = { overview: "Очередь", analytics: "Аналитика", kb: "База знаний", data: "История событий", staff: "Персонал" };
const $ = id => document.getElementById(id);
const content = $("content");
const tabs = $("tabs");
const dialog = $("resolution");
let role = Object.hasOwn(roles, sessionStorage.getItem("concierge-role")) ? sessionStorage.getItem("concierge-role") : "staff";
let tab = "overview";
let ticketFilter = "";
let resolvingId = "";

function visibleTickets(state) {
  return state.tickets.filter(ticket => !roles[role].dept || roles[role].dept === ticket.dept);
}

function overview(state) {
  const tickets = visibleTickets(state).slice().reverse();
  const me = roles[role];
  const columns = [
    ["Срочные", tickets.filter(ticket => ticket.urgent && ticket.status !== "done")],
    ["В очереди", tickets.filter(ticket => !ticket.urgent && ticket.status === "new")],
    ["В работе", tickets.filter(ticket => !ticket.urgent && ticket.status === "in_work")],
    ["Выполнены", tickets.filter(ticket => ticket.status === "done")],
  ];
  function card(ticket) {
    const canClose = me.work && ticket.status === "in_work" && ticket.assignee === me.actor;
    return `<article class="card${ticket.urgent ? " urgc" : ""}">
      <div class="cs">${ticket.title}</div>
      <div class="cm">#${ticket.id} · номер 204 · ${departments[ticket.dept]}</div>
      <p class="ticket-text">${esc(ticket.text)}</p>
      <div class="cw">${statuses[ticket.status]}${ticket.assignee ? " · " + ticket.assignee : ""}</div>
      ${ticket.note ? `<p class="ticket-text">${esc(ticket.note)}</p>` : ""}
      ${ticket.rating ? `<div class="rating">Оценка гостя — ${ticket.rating}/5</div>` : ""}
      <div class="ticket-actions">
        ${me.work && ticket.status === "new" ? `<button class="sact primary" data-take="${ticket.id}">Взять</button>` : ""}
        ${canClose ? `<button class="sact primary" data-close="${ticket.id}">Записать результат</button>` : ""}
        <button class="sact" data-history="${ticket.id}">История</button>
      </div>
    </article>`;
  }
  return `<div class="strip">Гостевые заявки появляются здесь сразу. Результат сотрудника возвращается в чат гостя.
    ${role === "manager" ? " Для обработки заявки выберите роль сотрудника." : ""}</div>
    <div class="board">${columns.map(([name, list], index) => `
      <section class="col${index === 0 ? " urgc" : ""}">
        <h3>${name} <span class="cnt">${list.length}</span></h3>
        ${list.map(card).join("") || '<p class="emptycol">Пока пусто</p>'}
      </section>`).join("")}</div>`;
}

function analytics(state) {
  const tickets = state.tickets;
  const scored = tickets.filter(ticket => ticket.rating);
  const total = tickets.length + state.autoAnswers;
  const invited = tickets.filter(ticket => ticket.status === "done").length;
  const handled = tickets.filter(ticket => ticket.takenAt)
    .map(ticket => ticket.takenAt - ticket.createdAt).sort((a, b) => a - b);
  const middle = Math.floor(handled.length / 2);
  const median = handled.length ? (handled[middle] + handled[Math.floor((handled.length - 1) / 2)]) / 2 : null;
  const complaints = tickets.filter(ticket => ticket.urgent);
  const resolved = complaints.filter(ticket => ticket.closedBeforeCheckout);
  const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const metrics = [
    [total, "Обращений в этой сессии"],
    [total ? Math.round(100 * state.autoAnswers / total) + "%" : "—", "Ответы из базы · " + state.autoAnswers + " из " + total],
    [scored.length ? number.format(scored.reduce((sum, ticket) => sum + ticket.rating, 0) / scored.length) + "/5" : "—", "Средняя оценка · ответов " + scored.length + ", приглашений " + invited],
    [median === null ? "—" : Math.round(median / 1000) + " с", "Медиана реакции · принято " + handled.length + " из " + tickets.length],
    [resolved.length + " / " + complaints.length, "Жалобы закрыты до выезда"],
  ];
  const latestRating = state.events.findLast(event => event.type === "rating_received");
  const latest = scored.find(ticket => ticket.id === latestRating?.ticket);
  return `<p class="strip">Показатели рассчитываются из действий в демо. Для просмотра причины откройте историю конкретной заявки.</p>
    <div class="kband">${metrics.map(([value, label]) => `<div class="kpi"><div class="v">${value}</div><div class="l">${label}</div></div>`).join("")}</div>
    <section class="aidigest">
      <h2 class="h2c">Сводка по проживанию · номер 204</h2>
      <p>В очереди ${tickets.filter(ticket => ticket.status === "new").length}, в работе ${tickets.filter(ticket => ticket.status === "in_work").length}. Ответов из базы знаний — ${state.autoAnswers}.</p>
      ${latest ? `<p class="digest-line">Гость оценил услугу «${latest.title}» на ${latest.rating}/5.
        <button class="sact" data-history="${latest.id}">Заявка #${latest.id}</button></p>` : ""}
      ${state.gaps.length ? `<p class="digest-line">Вопросов без ответа в базе — ${state.gaps.reduce((sum, gap) => sum + gap.count, 0)}.
        <button class="sact" data-tab="kb">Посмотреть пробелы</button></p>` : ""}
    </section>`;
}

function knowledge(state) {
  return `<div class="kbwrap">
    <section>
      <h2 class="h2c">Статьи отеля</h2>
      ${state.kb.map(item => `<div class="kbitem"><div class="q"><span class="cat">${esc(item.cat)}</span>${esc(item.q)}</div>
        <p class="a">${esc(item.a)}</p></div>`).join("")}
      ${roles[role].manage ? `<form class="kbadd" id="knowledge-form">
        <h3>Добавить статью</h3>
        <label for="kb-category">Категория</label><input id="kb-category" name="cat" maxlength="60" required>
        <label for="kb-question">Вопрос гостя</label><input id="kb-question" name="q" maxlength="160" required>
        <label for="kb-keywords">Ключевые слова через запятую</label><input id="kb-keywords" name="kw" maxlength="180">
        <label for="kb-answer">Подтверждённый ответ</label><textarea id="kb-answer" name="a" maxlength="500" required></textarea>
        <div class="acts"><button class="btn" type="submit">Сохранить статью</button></div>
      </form>` : ""}
    </section>
    <section>
      <h2 class="h2c">Пробелы базы знаний</h2>
      ${state.gaps.map(gap => `<div class="kbitem"><strong>${esc(gap.text)}</strong><p class="a">Обращений без ответа — ${gap.count}</p>
        ${roles[role].manage ? `<button class="sact" data-gap="${esc(gap.text)}">Подготовить статью</button>` : ""}</div>`).join("") ||
        '<p class="emptycol">Здесь появятся вопросы гостей, которых пока нет в базе.</p>'}
      <form class="aiq" id="preview-form">
        <label class="lbl" for="preview-question">Проверить ответ из базы</label>
        <div class="airow"><input id="preview-question" placeholder="Когда завтрак?" maxlength="500" required><button>Проверить</button></div>
        <p class="aians" id="preview-answer" role="status">Проверка статьи в панели персонала.</p>
      </form>
    </section>
  </div>`;
}

function history(state) {
  const tickets = visibleTickets(state);
  const events = state.events.filter(event =>
    (!roles[role].dept || tickets.some(ticket => ticket.id === event.ticket)) &&
    (!ticketFilter || event.ticket === ticketFilter));
  return `<section class="history">
    <div class="history-header"><h2 class="h2c">Путь гостя · номер 204</h2>
      <label>Заявка <select id="history-filter">
        <option value="">Все события</option>
        ${tickets.map(ticket => `<option value="${ticket.id}" ${ticketFilter === ticket.id ? "selected" : ""}>#${ticket.id} · ${ticket.title}</option>`).join("")}
      </select></label></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Время</th><th>Этап</th><th>Событие</th><th>Участник</th><th>Заявка</th><th>Детали</th></tr></thead>
      <tbody>${events.map(event => `<tr><td>${time(event.at)}</td><td>${stages[event.stage]}</td>
        <td>${eventLabels[event.type]}</td><td>${esc(event.actor)}</td><td>${event.ticket ? "#" + event.ticket : "—"}</td>
        <td>${esc(event.text)}</td></tr>`).join("") || '<tr><td colspan="6">Событий пока нет</td></tr>'}</tbody>
    </table></div>
  </section>`;
}

function staffView(state) {
  return `<section class="staff-demo">
    <h2 class="h2c">Роли в отеле</h2>
    <div class="kbitem"><strong>Дежурный</strong><p class="a">Принимает заявки служб и фиксирует результат по своим заявкам.</p></div>
    <div class="kbitem"><strong>Руководитель горничных</strong><p class="a">Видит заявки и историю своего отдела.</p></div>
    <div class="kbitem"><strong>Управляющий</strong><p class="a">Изучает показатели и историю, ведёт базу знаний.</p></div>
    <div class="kbitem"><strong>Администратор</strong><p class="a">Обрабатывает заявки, ведёт базу знаний и назначает роли.</p></div>
    <div class="kbitem"><strong>Новый сотрудник</strong>
      ${state.newcomerAssigned ? '<p class="a">Назначен в службу горничных.</p>' :
        '<p class="a">Ожидает назначения роли.</p><button class="sact" id="assign">Назначить в службу горничных</button>'}
    </div>
  </section>`;
}

const views = { overview, analytics, kb: knowledge, data: history, staff: staffView };
function render(state = Demo.read()) {
  const available = Object.keys(labels).filter(item => (item !== "analytics" || !roles[role].dept) && (item !== "staff" || role === "admin"));
  if (!available.includes(tab)) tab = "overview";
  $("role").value = role;
  tabs.innerHTML = available.map(item => `<button class="${tab === item ? "on" : ""}" aria-pressed="${tab === item}" data-tab="${item}">${labels[item]}</button>`).join("");
  const focused = document.activeElement;
  if (tab === "kb" && content.contains(focused) && focused.matches("input, textarea")) return;
  content.innerHTML = views[tab](state);
}

function selectTab(value) {
  tab = value;
  ticketFilter = "";
  render();
}

$("role").addEventListener("change", event => {
  role = event.target.value;
  sessionStorage.setItem("concierge-role", role);
  selectTab("overview");
});
tabs.addEventListener("click", event => {
  if (event.target.dataset.tab) selectTab(event.target.dataset.tab);
});
content.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button) return;
  const { take, close, history, gap, tab: nextTab } = button.dataset;
  const me = roles[role];
  if (nextTab) selectTab(nextTab);
  if (history) { tab = "data"; ticketFilter = history; render(); }
  if (take && me.work && !(await Demo.changeTicket(take, "take", me.actor, me.dept))) {
    $("notice").textContent = "Заявка уже принята. Очередь обновлена.";
    render();
  }
  if (close && me.work) {
    resolvingId = close;
    $("closing-ticket").textContent = "#" + close;
    $("result-note").value = "";
    $("resolution-error").textContent = "";
    dialog.showModal();
  }
  if (gap && me.manage) { $("kb-question").value = gap; $("kb-answer").focus(); }
  if (button.id === "assign" && role === "admin") {
    await Demo.update(state => { state.newcomerAssigned = true; });
  }
});
content.addEventListener("change", event => {
  if (event.target.id === "history-filter") { ticketFilter = event.target.value; render(); }
});
content.addEventListener("submit", async event => {
  event.preventDefault();
  if (event.target.id === "preview-form") {
    const answer = Demo.findAnswer(Demo.read().kb, $("preview-question").value);
    $("preview-answer").textContent = answer ? answer.a : "Подходящей статьи нет. В чате гостя такой вопрос попадёт сотруднику.";
  }
  if (event.target.id === "knowledge-form" && roles[role].manage) {
    const fields = Object.fromEntries(Array.from(new FormData(event.target), ([key, value]) => [key, value.trim()]));
    if (!fields.q || !fields.a || !fields.cat) return;
    await Demo.update(state => {
      state.kb.unshift({ id: Date.now(), ...fields });
      state.gaps = state.gaps.filter(gap => !Demo.findAnswer(state.kb, gap.text));
    });
    $("notice").textContent = "Статья сохранена. Гостевой чат уже использует новую базу.";
    document.activeElement.blur();
    render();
  }
});
$("resolve-form").addEventListener("submit", async event => {
  event.preventDefault();
  const note = $("result-note").value.trim();
  if (!note) { $("resolution-error").textContent = "Укажите результат для гостя."; return; }
  const me = roles[role];
  if (me.work && await Demo.changeTicket(resolvingId, "close", me.actor, me.dept, note)) dialog.close();
  else $("resolution-error").textContent = "Заявка изменилась. Проверьте её статус в очереди.";
});
$("cancel-resolution").addEventListener("click", () => dialog.close());
Demo.subscribe(render);
