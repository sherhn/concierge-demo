"use strict";

const { esc, time, stages, eventLabels, statuses, departments } = Demo;
const chat = document.getElementById("chat");
const form = document.getElementById("message-form");
const input = document.getElementById("guest-message");
const send = async text => {
  if (await Demo.submit(text)) input.value = "";
};

form.addEventListener("submit", event => {
  event.preventDefault();
  send(input.value);
});
document.getElementById("scenarios").addEventListener("click", event => {
  const text = event.target.closest("button")?.dataset.message;
  if (text) send(text);
});
document.getElementById("orders").addEventListener("click", event => {
  const button = event.target.closest("[data-rating]");
  if (button) Demo.rate(button.dataset.ticket, Number(button.dataset.rating));
});
document.getElementById("checkout").addEventListener("click", () => Demo.checkout());
window.addEventListener("resize", () => { chat.scrollTop = chat.scrollHeight; });

Demo.subscribe(state => {
  const wasAtBottom = chat.scrollHeight - chat.clientHeight - chat.scrollTop < 48;
  chat.innerHTML = state.messages.map(item => `
    <div class="msg ${item.role}">
      ${esc(item.text)}
      <span class="st">${[item.source, item.ticket && "#" + item.ticket, time(item.at)].filter(Boolean).map(esc).join(" · ")}</span>
    </div>`).join("");
  if (wasAtBottom) chat.scrollTop = chat.scrollHeight;
  const isCheckedOut = state.stage === 3;
  document.querySelectorAll("#message-form :is(input, button), #scenarios button, #checkout")
    .forEach(control => control.disabled = isCheckedOut);
  document.getElementById("guest-stage").textContent = stages[state.stage];
  document.getElementById("journey").innerHTML = stages.map((stage, index) =>
    `<li class="${index === state.stage ? "current" : ""}">${stage}</li>`).join("");

  document.getElementById("orders").innerHTML = state.tickets.slice().reverse().map(ticket => `
    <article class="ocard">
      <div class="on">${esc(ticket.title)} <small>#${ticket.id}</small></div>
      <div class="om">${departments[ticket.dept]}${ticket.urgent ? " · Срочно" : ""}</div>
      <span class="os ${ticket.status === "in_work" ? "work" : ticket.status}">${statuses[ticket.status]}</span>
      ${ticket.note ? `<p class="stline">${esc(ticket.note)}</p>` : ""}
      ${ticket.rating ? `<p class="okline">Ваша оценка — ${ticket.rating} из 5</p>` :
        ticket.status === "done" ? `<div class="stline">Оцените результат</div>
          <div class="rstars" role="group" aria-label="Оценка по заявке ${ticket.id}">
            ${[1, 2, 3, 4, 5].map(value => `<button type="button" class="rstar" data-ticket="${ticket.id}" data-rating="${value}" aria-label="${value} из 5">${value}</button>`).join("")}
          </div>` : ""}
    </article>`).join("") || '<p class="stline">Заявок пока нет. Например, попросите полотенца в чате.</p>';

  document.getElementById("events").innerHTML = state.events.slice(-8).reverse().map(event => `
    <div class="ev"><span class="dot"></span><span class="t">${time(event.at)}</span>
      <span>${eventLabels[event.type]}${event.ticket ? " · #" + event.ticket : ""}</span></div>`).join("");
});
