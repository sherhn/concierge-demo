"use strict";

const Demo = (() => {
  const key = "videns-concierge-demo-v2";
  const departments = {
    housekeeping: "Горничные", restaurant: "Ресторан", reception: "Стойка", tech: "Техслужба",
  };
  const statuses = { new: "В очереди", in_work: "В работе", done: "Выполнено" };
  const stages = ["Бронирование", "Заезд", "Проживание", "Выезд"];
  const eventLabels = {
    booking_created: "Бронь создана", checkin_completed: "Гость заселился",
    chat_opened: "Чат открыт по QR-коду", guest_message: "Сообщение гостя",
    knowledge_answer: "Ответ из базы знаний", knowledge_gap: "Пробел в базе знаний",
    ticket_created: "Заявка передана службе", ticket_taken: "Заявка принята",
    ticket_closed: "Результат записан", rating_requested: "Запрошена оценка",
    rating_received: "Гость поставил оценку", checkout_completed: "Выезд",
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
  const time = value => new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const normalize = text => text.toLowerCase().replaceAll("ё", "е").match(/[а-яa-z0-9]+/g)?.join(" ") || "";

  function initialState() {
    const now = Date.now();
    return {
      version: 2, stage: 2, nextTicket: 1, tickets: [], autoAnswers: 0, gaps: [],
      messages: [{ role: "a", text: "Здравствуйте, Мария! Я консьерж отеля. Могу подсказать, где завтрак, или передать вашу просьбу сотруднику.", at: now }],
      events: [
        { type: "booking_created", stage: 0, at: now - 86400000, actor: "Отель", text: "Номер 204" },
        { type: "checkin_completed", stage: 1, at: now - 1800000, actor: "Стойка", text: "Заселение в номер 204" },
        { type: "chat_opened", stage: 2, at: now, actor: "Гость", text: "Мария · номер 204" },
      ],
      kb: [
        { id: 1, cat: "Питание", q: "Когда завтрак?", kw: "завтрак, завтрака, завтракать", a: "Завтрак с 7:00 до 11:00 в зале на первом этаже. Если завтрак входит в ваш тариф, доплата не нужна." },
        { id: 2, cat: "Номер", q: "Как подключиться к Wi-Fi?", kw: "wifi, wi-fi, вайфай, вай фай, интернет", a: "Подключитесь к сети Hotel-Guest. Демо-пароль — welcome2026." },
        { id: 3, cat: "Питание", q: "Где поужинать?", kw: "ужин, поужинать, где ресторан", a: "Итальянский ресторан находится на втором этаже. Для заявки на столик укажите время и число гостей." },
        { id: 4, cat: "Правила", q: "Можно ли с питомцем?", kw: "животные, питомец, питомцем, собака, собакой", a: "В демо-отеле разрешены питомцы до 10 кг. Доплата — 1 000 ₽ в сутки." },
      ],
      newcomerAssigned: false,
    };
  }

  let fallback = initialState();
  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.version === 2) return saved;
    } catch { /* Storage can be unavailable in private or file previews. */ }
    return fallback;
  }

  const listeners = new Set();
  function notify() {
    const state = read();
    listeners.forEach(render => render(state));
  }
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) notify();
  });
  window.addEventListener("pageshow", notify);

  function update(change) {
    const commit = () => {
      const state = read();
      if (change(state) === false) return false;
      fallback = state;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Keep the current tab usable. */ }
      notify();
      return true;
    };
    return navigator.locks ? navigator.locks.request(key, commit) : Promise.resolve(commit());
  }

  function subscribe(render) {
    listeners.add(render);
    render(read());
  }

  function addEvent(state, type, actor, text, ticket) {
    state.events.push({ type, actor, text, at: Date.now(), stage: ticket?.stage ?? state.stage, ticket: ticket?.id });
  }

  function message(state, role, text, ticket, source) {
    state.messages.push({ role, text, at: Date.now(), ticket: ticket?.id, source });
  }

  function findAnswer(kb, text) {
    const query = normalize(text);
    if (!query) return;
    return kb.find(article => normalize(article.q) === query) ||
      kb.find(article => article.kw.split(",").some(term => {
        const phrase = normalize(term);
        return phrase && (" " + query + " ").includes(" " + phrase + " ");
      }));
  }

  const routes = [
    { match: /шум|сосед|громко/, title: "Жалоба на шум", dept: "reception", urgent: true, topic: "Шум" },
    { match: /полотен/, title: "Доставка полотенец", dept: "housekeeping", topic: "Полотенца" },
    { match: /уборк|уберит|убрать|прибрат/, title: "Уборка номера", dept: "housekeeping", topic: "Уборка" },
    { match: /столик|забронируй.*ресторан/, title: "Столик в ресторане", dept: "restaurant", topic: "Ресторан" },
    { match: /такси|трансфер/, title: "Заказ трансфера", dept: "reception", topic: "Трансфер" },
    { match: /сломал|не работает|не открывается|протекает/, title: "Проверка оборудования", dept: "tech", topic: "Оборудование" },
  ];

  function submit(text) {
    text = text.trim().slice(0, 500);
    if (!text) return Promise.resolve(false);
    return update(state => {
      if (state.stage === 3) return false;
      const normalized = normalize(text);
      const route = routes.find(item => item.match.test(normalized));
      const answer = route ? null : findAnswer(state.kb, text);
      if (answer) {
        message(state, "g", text);
        addEvent(state, "guest_message", "Гость", text);
        message(state, "a", answer.a, null, answer.q);
        addEvent(state, "knowledge_answer", "Консьерж", answer.q);
        state.autoAnswers++;
        return;
      }

      const details = route || { title: "Вопрос администратору", dept: "reception", topic: "Вопросы вне базы" };
      const { title, dept, topic, urgent = false } = details;
      const ticket = { id: "204-" + state.nextTicket++, title, dept, topic, urgent, text,
        stage: state.stage, status: "new", createdAt: Date.now() };
      state.tickets.push(ticket);
      message(state, "g", text, ticket);
      addEvent(state, "guest_message", "Гость", text, ticket);
      if (!route) {
        const gap = state.gaps.find(item => normalize(item.text) === normalized);
        if (gap) gap.count++;
        else state.gaps.push({ text, count: 1 });
        addEvent(state, "knowledge_gap", "Консьерж", text, ticket);
      }
      addEvent(state, "ticket_created", "Консьерж", departments[dept], ticket);
      const reply = urgent ? "Передал жалобу дежурному с пометкой «Срочно»." :
        route ? "Передал просьбу в службу «" + departments[dept] + "». Здесь будет статус заявки." :
          "В базе отеля пока нет ответа. Передал вопрос сотруднику. Ответ появится в этом чате.";
      message(state, "a", reply, ticket);
    });
  }

  function changeTicket(id, action, staff, department, note = "") {
    return update(state => {
      const ticket = state.tickets.find(item => item.id === id);
      if (!ticket || (department && department !== ticket.dept)) return false;
      if (action === "take" && ticket.status === "new") {
        ticket.status = "in_work";
        ticket.takenAt = Date.now();
        ticket.assignee = staff;
        addEvent(state, "ticket_taken", staff, "Сотрудник принял заявку", ticket);
        message(state, "a", "Сотрудник принял заявку в работу.", ticket);
        return;
      }
      if (action !== "close" || ticket.status !== "in_work" || ticket.assignee !== staff || !note.trim()) return false;
      ticket.status = "done";
      ticket.closedAt = Date.now();
      ticket.closedBeforeCheckout = state.stage !== 3;
      ticket.note = note.trim().slice(0, 500);
      addEvent(state, "ticket_closed", staff, ticket.note, ticket);
      message(state, "a", ticket.note, ticket, "Ответ сотрудника");
      addEvent(state, "rating_requested", "Консьерж", ticket.title, ticket);
    });
  }

  function rate(id, value) {
    return update(state => {
      const ticket = state.tickets.find(item => item.id === id);
      if (!ticket || ticket.status !== "done" || ticket.rating || ![1, 2, 3, 4, 5].includes(value)) return false;
      ticket.rating = value;
      addEvent(state, "rating_received", "Гость", value + " из 5", ticket);
    });
  }

  function checkout() {
    return update(state => {
      if (state.stage === 3) return false;
      state.stage = 3;
      addEvent(state, "checkout_completed", "Стойка", "Гость выехал из номера 204");
    });
  }

  function reset() {
    return update(state => Object.assign(state, initialState()));
  }

  return { read, update, subscribe, submit, changeTicket, rate, checkout, reset, findAnswer,
    departments, statuses, stages, eventLabels, time, esc };
})();
