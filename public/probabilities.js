const deckInput = document.querySelector("#deckInput");
const parseDeck = document.querySelector("#parseDeck");
const deckStatus = document.querySelector("#deckStatus");
const totalCards = document.querySelector("#totalCards");
const basicCount = document.querySelector("#basicCount");
const keepOdds = document.querySelector("#keepOdds");
const expectedMulligans = document.querySelector("#expectedMulligans");
const cardRows = document.querySelector("#cardRows");
const cardEmpty = document.querySelector("#cardEmpty");
const prizeResults = document.querySelector("#prizeResults");
const selectAllCards = document.querySelector("#selectAllCards");

let cards = [];
let allSelected = false;
const combCache = new Map();

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function percent(value) {
  return value === null || Number.isNaN(value) ? "-" : `${(value * 100).toFixed(4)}%`;
}

function shortPercent(value) {
  return value === null || Number.isNaN(value) ? "-" : `${(value * 100).toFixed(3)}%`;
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  const key = `${n}:${k}`;
  if (combCache.has(key)) return combCache.get(key);
  const smallK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= smallK; i += 1) {
    result = (result * (n - smallK + i)) / i;
  }
  combCache.set(key, result);
  return result;
}

function parseDecklist(text) {
  let section = "";
  const parsed = [];
  const byKey = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(.+?)\s*:\s*\d*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }

    const match = line.match(/^(\d+)\s+(.+?)(?:\s+([A-Z0-9]{2,8})\s+([A-Z0-9-]+))?$/);
    if (!match) continue;

    const count = Number(match[1]);
    const name = match[2].trim();
    const setCode = match[3] || "";
    const number = match[4] || "";
    const key = `${name.toLowerCase()}|${setCode}|${number}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.count += count;
    } else {
      const card = {
        id: `card-${parsed.length}`,
        count,
        name,
        setCode,
        number,
        section,
        selected: false,
        isBasic: false,
        isPokemon: section.includes("pok"),
        lookupStatus: "pending"
      };
      parsed.push(card);
      byKey.set(key, card);
    }
  }

  return parsed;
}

async function mapWithConcurrency(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await task(item);
    }
  });
  await Promise.all(workers);
}

async function hydrateCardMetadata() {
  const lookupCards = cards.filter((card) => card.name);
  let done = 0;

  await mapWithConcurrency(lookupCards, 6, async (card) => {
    try {
      const params = new URLSearchParams({ name: card.name });
      if (card.setCode) params.set("set", card.setCode);
      if (card.number) params.set("number", card.number);
      const response = await fetch(`/api/card-metadata?${params}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Lookup failed");

      card.isPokemon = data.isPokemon || card.isPokemon;
      card.isBasic = Boolean(data.isBasic);
      card.lookupStatus = data.name ? "ready" : "unknown";
    } catch {
      card.lookupStatus = "unknown";
    } finally {
      done += 1;
      deckStatus.textContent = `Checking card metadata... ${done}/${lookupCards.length}`;
    }
  });
}

function setupStats() {
  const total = cards.reduce((sum, card) => sum + card.count, 0);
  const basics = cards.reduce((sum, card) => sum + (card.isBasic ? card.count : 0), 0);
  const validOpen = total === 60 && basics ? 1 - choose(60 - basics, 7) / choose(60, 7) : null;
  const expected = validOpen ? (1 - validOpen) / validOpen : null;
  return { total, basics, validOpen, expected };
}

function keptHandStates(targetCopies, targetBasicCopies, basics) {
  const otherTarget = targetCopies - targetBasicCopies;
  const otherBasics = basics - targetBasicCopies;
  const otherCards = 60 - basics - otherTarget;
  const denominator = choose(60, 7) - choose(60 - basics, 7);
  const states = [];

  if (denominator <= 0) return states;

  for (let targetBasicsInHand = 0; targetBasicsInHand <= Math.min(targetBasicCopies, 7); targetBasicsInHand += 1) {
    for (let targetOthersInHand = 0; targetOthersInHand <= Math.min(otherTarget, 7 - targetBasicsInHand); targetOthersInHand += 1) {
      for (let otherBasicsInHand = 0; otherBasicsInHand <= Math.min(otherBasics, 7 - targetBasicsInHand - targetOthersInHand); otherBasicsInHand += 1) {
        const used = targetBasicsInHand + targetOthersInHand + otherBasicsInHand;
        const otherCardsInHand = 7 - used;
        if (otherCardsInHand < 0 || otherCardsInHand > otherCards) continue;
        if (targetBasicsInHand + otherBasicsInHand < 1) continue;

        const ways =
          choose(targetBasicCopies, targetBasicsInHand) *
          choose(otherTarget, targetOthersInHand) *
          choose(otherBasics, otherBasicsInHand) *
          choose(otherCards, otherCardsInHand);

        states.push({
          probability: ways / denominator,
          targetInHand: targetBasicsInHand + targetOthersInHand,
          targetRemaining: targetCopies - targetBasicsInHand - targetOthersInHand
        });
      }
    }
  }

  return states;
}

function prizeDistribution(card, basics) {
  const targetBasicCopies = card.isBasic ? card.count : 0;
  const states = keptHandStates(card.count, targetBasicCopies, basics);
  const distribution = Array.from({ length: card.count + 1 }, () => 0);

  for (const state of states) {
    for (let prized = 0; prized <= Math.min(card.count, 6); prized += 1) {
      if (prized > state.targetRemaining) continue;
      const prizeOdds = (choose(state.targetRemaining, prized) * choose(53 - state.targetRemaining, 6 - prized)) / choose(53, 6);
      distribution[prized] += state.probability * prizeOdds;
    }
  }

  return distribution;
}

function openingOrFirstDrawOdds(card, basics) {
  const targetBasicCopies = card.isBasic ? card.count : 0;
  const states = keptHandStates(card.count, targetBasicCopies, basics);
  return states.reduce((sum, state) => {
    const odds = state.targetInHand > 0 ? 1 : state.targetRemaining / 53;
    return sum + state.probability * odds;
  }, 0);
}

function renderSetup() {
  const stats = setupStats();
  totalCards.textContent = stats.total || "-";
  basicCount.textContent = stats.basics || "-";
  keepOdds.textContent = percent(stats.validOpen);
  expectedMulligans.textContent = stats.expected === null ? "-" : stats.expected.toFixed(2);
  return stats;
}

function renderCards() {
  const stats = renderSetup();
  cardRows.innerHTML = cards
    .map((card) => {
      const openingOdds = stats.total === 60 && stats.basics ? openingOrFirstDrawOdds(card, stats.basics) : null;
      const lookupLabel = card.lookupStatus === "unknown" ? "Lookup miss" : card.isPokemon ? "Pokemon" : card.section || "Card";
      return `
        <tr>
          <td><input class="card-select" type="checkbox" data-id="${card.id}" ${card.selected ? "checked" : ""}></td>
          <td>
            <strong>${escapeHtml(card.name)}</strong>
            <small>${escapeHtml([card.setCode, card.number].filter(Boolean).join(" "))} ${escapeHtml(lookupLabel)}</small>
          </td>
          <td class="metric">${card.count}</td>
          <td><input class="basic-select" type="checkbox" data-id="${card.id}" ${card.isBasic ? "checked" : ""}></td>
          <td class="metric">${percent(openingOdds)}</td>
        </tr>
      `;
    })
    .join("");

  cardEmpty.style.display = cards.length ? "none" : "block";
  renderPrizeResults(stats);
}

function renderPrizeResults(stats = setupStats()) {
  const selected = cards.filter((card) => card.selected);
  if (stats.total !== 60) {
    prizeResults.innerHTML = `<p class="muted">The calculator expects a 60-card deck. This list currently has ${stats.total || 0} cards.</p>`;
    return;
  }
  if (!stats.basics) {
    prizeResults.innerHTML = '<p class="muted">Mark at least one Basic Pokemon before calculating setup odds.</p>';
    return;
  }
  if (!selected.length) {
    prizeResults.innerHTML = '<p class="muted">Select one or more cards to see prize odds.</p>';
    return;
  }

  prizeResults.innerHTML = selected
    .map((card) => {
      const distribution = prizeDistribution(card, stats.basics);
      const rows = distribution
        .map((odds, count) => `
          <div class="prob-row">
            <span>${count} of ${card.count}</span>
            <strong>${shortPercent(odds)}</strong>
          </div>
        `)
        .join("");
      return `
        <div class="prob-card">
          <h3>${escapeHtml(card.name)}</h3>
          ${rows}
        </div>
      `;
    })
    .join("");
}

parseDeck.addEventListener("click", async () => {
  parseDeck.disabled = true;
  cardRows.innerHTML = "";
  cardEmpty.style.display = "block";
  cardEmpty.textContent = "Parsing decklist...";
  prizeResults.innerHTML = '<p class="muted">Select one or more cards to see prize odds.</p>';

  try {
    cards = parseDecklist(deckInput.value);
    allSelected = false;
    selectAllCards.textContent = "Select All";
    if (!cards.length) throw new Error("No PTCGL card lines found.");
    renderCards();
    deckStatus.textContent = `Parsed ${cards.length} unique cards.`;
    await hydrateCardMetadata();
    deckStatus.textContent = `Ready. ${setupStats().basics} Basic Pokemon detected.`;
    renderCards();
  } catch (error) {
    cards = [];
    cardRows.innerHTML = "";
    cardEmpty.textContent = error.message;
    deckStatus.textContent = error.message;
    renderSetup();
  } finally {
    parseDeck.disabled = false;
  }
});

cardRows.addEventListener("change", (event) => {
  const id = event.target.dataset.id;
  const card = cards.find((item) => item.id === id);
  if (!card) return;

  if (event.target.classList.contains("card-select")) card.selected = event.target.checked;
  if (event.target.classList.contains("basic-select")) card.isBasic = event.target.checked;
  renderCards();
});

selectAllCards.addEventListener("click", () => {
  allSelected = !allSelected;
  cards.forEach((card) => {
    card.selected = allSelected;
  });
  selectAllCards.textContent = allSelected ? "Clear" : "Select All";
  renderCards();
});
