const rankingsBody = document.querySelector("#rankings");
const empty = document.querySelector("#empty");
const detail = document.querySelector("#detail");
const refresh = document.querySelector("#refresh");
const deckCount = document.querySelector("#deckCount");
const topScore = document.querySelector("#topScore");
const updated = document.querySelector("#updated");
const sourceNote = document.querySelector("#sourceNote");
const officialFilters = document.querySelector("#officialFilters");
const eventOptions = document.querySelector("#eventOptions");
const eventStatus = document.querySelector("#eventStatus");

const controls = {
  source: document.querySelector("#source"),
  formatSet: document.querySelector("#formatSet"),
  candidates: document.querySelector("#candidates"),
  opponents: document.querySelector("#opponents"),
  minMatches: document.querySelector("#minMatches"),
  groupVariants: document.querySelector("#groupVariants")
};

let groupVariants = false;
let eventsLoaded = false;
let formatWindows = [];

function percent(value) {
  return value === null || Number.isNaN(value) ? "-" : `${value.toFixed(1)}%`;
}

function matchupStat(item) {
  const matches = item.matches ?? "?";
  const record = item.record ? ` (${item.record.wins}-${item.record.losses}-${item.record.ties})` : "";
  return `${percent(item.winRate)} / ${matches}${record}`;
}

function params() {
  const search = new URLSearchParams({ game: "PTCG" });
  for (const [key, input] of Object.entries(controls)) {
    if (key === "source") {
      search.set(key, input.value);
      continue;
    }
    if (key === "formatSet") {
      const format = formatWindows.find((item) => item.value === input.value);
      if (format) {
        search.set("format", "standard");
        search.set("rotation", format.rotation);
        search.set("set", format.set);
        search.set("officialFormat", format.officialFormat);
        if (format.start) search.set("formatStart", format.start);
        if (format.end) search.set("formatEnd", format.end);
      }
      continue;
    }
    if (key === "groupVariants") {
      if (groupVariants) search.set(key, "1");
      continue;
    }
    if (input.value) search.set(key, input.value);
  }
  if (controls.source.value === "official") {
    const eventIds = [...eventOptions.querySelectorAll("input:checked")].map((input) => input.value);
    search.set("eventScope", "selected");
    if (eventIds.length) search.set("eventIds", eventIds.join(","));
  }
  return search;
}

async function loadEvents() {
  const selectedFormat = controls.formatSet.value;
  if (eventsLoaded === selectedFormat) return;
  eventStatus.textContent = "Loading current-format events...";
  eventOptions.innerHTML = "";

  try {
    const eventParams = params();
    eventParams.delete("source");
    eventParams.delete("candidates");
    eventParams.delete("opponents");
    eventParams.delete("minMatches");
    eventParams.delete("groupVariants");
    const response = await fetch(`/api/events?${eventParams}`);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Unable to load events");

    eventOptions.innerHTML = data.events
      .map(
        (event) => `
          <label>
            <input type="checkbox" value="${event.id}" checked>
            ${event.name}
          </label>
        `
      )
      .join("");
    eventStatus.textContent = data.events.length
      ? `${data.events.length} current-format events selected`
      : "No current-format Regionals / Internationals found.";
    eventOptions.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        const selected = eventOptions.querySelectorAll("input:checked").length;
        eventStatus.textContent = `${selected} current-format events selected`;
        loadRankings();
      });
    });
    eventsLoaded = selectedFormat;
  } catch (error) {
    eventStatus.textContent = error.message;
  }
}

async function loadFormats() {
  try {
    const response = await fetch("/api/formats");
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Unable to load formats");

    formatWindows = data.formats.map((format) => ({
      ...format,
      value: `${format.rotation}:${format.set}`
    }));
    controls.formatSet.innerHTML = formatWindows
      .map(
        (format, index) => `
          <option value="${format.value}" ${format.current || index === 0 ? "selected" : ""}>
            ${format.label}
          </option>
        `
      )
      .join("");
  } catch (error) {
    controls.formatSet.innerHTML = `<option value="">${error.message}</option>`;
  }
}

async function syncSourceUi() {
  const source = controls.source.value;
  officialFilters.hidden = source !== "official";

  if (source === "all") {
    sourceNote.textContent = "All mode blends online matchup data with Regionals / Internationals meta weights.";
  } else if (source === "official") {
    sourceNote.textContent = "Regionals / Internationals mode uses selected in-person events for meta-share weights and Play Limitless for matchup win rates.";
    await loadEvents();
  } else {
    sourceNote.textContent = "Online mode uses Play Limitless online tournament data.";
  }
}

function spriteList(sprites = [], deckName = "") {
  if (!sprites.length) return "";
  return `
    <div class="sprites" aria-label="${deckName} main Pokemon">
      ${sprites.map((src) => `<img src="${src}" alt="" loading="lazy">`).join("")}
    </div>
  `;
}

function chipList(items) {
  if (!items?.length) return '<span class="chip">No data</span>';
  return items
    .map((item) => `<span class="chip">${item.opponent} ${matchupStat(item)}</span>`)
    .join("");
}

function rowTemplate(deck, index) {
  const scoreClass = deck.antiMetaScore >= 52 ? "good" : deck.antiMetaScore < 48 ? "bad" : "";
  return `
    <tr data-slug="${deck.slug}" data-name="${deck.name}" data-detail-url="${deck.detailUrl}">
      <td class="metric">#${index + 1}</td>
      <td>
        <div class="deck-cell">
          ${spriteList(deck.sprites, deck.name)}
          <div class="deck-name">
            <span>${deck.name}</span>
            ${deck.isGrouped ? `<small>${deck.variants.length} variants grouped</small>` : ""}
            <a href="${deck.deckPageUrl}" target="_blank" rel="noreferrer">Open Limitless deck page</a>
          </div>
        </div>
      </td>
      <td class="metric ${scoreClass}">${percent(deck.antiMetaScore)}</td>
      <td>${percent(deck.share)}</td>
      <td>${percent(deck.winRate)}</td>
      <td><div class="chips">${chipList(deck.bestMatchups)}</div></td>
      <td><div class="chips">${chipList(deck.worstMatchups)}</div></td>
    </tr>
  `;
}

async function loadRankings() {
  refresh.disabled = true;
  refresh.textContent = "Loading...";
  empty.textContent = "Loading Limitless data...";
  empty.style.display = "block";
  rankingsBody.innerHTML = "";

  try {
    const response = await fetch(`/api/rankings?${params()}`);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Unable to load rankings");

    rankingsBody.innerHTML = data.decks.map(rowTemplate).join("");
    empty.style.display = data.decks.length ? "none" : "block";
    deckCount.textContent = data.decks.length;
    topScore.textContent = percent(data.decks[0]?.antiMetaScore ?? null);
    updated.textContent = new Date(data.generatedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

    rankingsBody.querySelectorAll("tr[data-slug]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        loadDetail(row.dataset.detailUrl, row.dataset.name);
      });
    });
  } catch (error) {
    empty.textContent = error.message;
    deckCount.textContent = "-";
    topScore.textContent = "-";
    updated.textContent = "-";
  } finally {
    refresh.disabled = false;
    refresh.textContent = "Refresh";
  }
}

function matchupsTemplate(matchups) {
  return matchups
    .slice(0, 12)
    .map(
      (m) => `
        <div class="matchup-row">
          <span class="matchup-main">
            ${spriteList(m.sprites, m.opponent)}
            <span>${m.opponent}</span>
          </span>
          <strong class="${m.winRate >= 52 ? "good" : m.winRate < 48 ? "bad" : ""}">${matchupStat(m)}</strong>
        </div>
      `
    )
    .join("");
}

function riskMatchupsTemplate(matchups) {
  return matchupsTemplate(matchups);
}

function listTemplate(items, fallback) {
  if (!items?.length) return `<p class="muted">${fallback}</p>`;
  return items.map((item) => `<div class="card-line">${item}</div>`).join("");
}

async function loadDetail(detailUrl, name) {
  detail.innerHTML = `<div class="detail-empty spinner">Loading ${name}...</div>`;

  try {
    const response = await fetch(detailUrl);
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Unable to load deck details");

    detail.innerHTML = `
      <h2>${name}</h2>
      <div class="detail-scroll">
        <p class="muted">Matchup spread and sample list pulled from Limitless.</p>
        ${
          data.groupName && data.variants.length
            ? `<div class="variant-list"><strong>${data.groupName} variants:</strong> ${data.variants.join(", ")}</div>`
            : ""
        }
        <div class="detail-actions">
          <a class="link-button" href="${data.deckPageUrl}" target="_blank" rel="noreferrer">Deck page</a>
          <a class="link-button" href="${data.matchupsUrl}" target="_blank" rel="noreferrer">Matchups</a>
          ${data.finishes[0]?.decklistUrl ? `<a class="link-button" href="${data.finishes[0].decklistUrl}" target="_blank" rel="noreferrer">Sample list</a>` : ""}
        </div>

        <div class="detail-section">
          <h3>Top Matchups</h3>
          ${matchupsTemplate(data.matchups)}
        </div>

        <div class="detail-section">
          <h3>Risk Matchups</h3>
          ${riskMatchupsTemplate(data.riskMatchups)}
        </div>

        <div class="detail-section">
          <h3>Best Finishes</h3>
          ${
            data.finishes.length
              ? data.finishes
                  .map(
                    (finish) => `
                      <div class="finish-row">
                        <span>${finish.label}</span>
                        ${finish.decklistUrl ? `<a class="external" href="${finish.decklistUrl}" target="_blank" rel="noreferrer">Decklist</a>` : ""}
                      </div>
                    `
                  )
                  .join("")
              : "<p>No finish rows found.</p>"
          }
        </div>

        <div class="detail-section">
          <h3>Sample Decklist</h3>
          ${listTemplate(data.sampleDecklist, "Open the linked sample list on Limitless if this parser cannot isolate card lines.")}
        </div>
      </div>
    `;
  } catch (error) {
    detail.innerHTML = `<div class="detail-empty">${error.message}</div>`;
  }
}

refresh.addEventListener("click", loadRankings);
controls.source.addEventListener("change", async () => {
  await syncSourceUi();
  loadRankings();
});
controls.formatSet.addEventListener("change", async () => {
  eventsLoaded = false;
  await syncSourceUi();
  loadRankings();
});
controls.groupVariants.addEventListener("click", () => {
  groupVariants = !groupVariants;
  controls.groupVariants.textContent = groupVariants ? "On" : "Off";
  controls.groupVariants.setAttribute("aria-pressed", String(groupVariants));
  controls.groupVariants.classList.toggle("active", groupVariants);
  loadRankings();
});
await loadFormats();
await syncSourceUi();
loadRankings();
