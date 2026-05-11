const LIMITLESS = "https://play.limitlesstcg.com";
const OFFICIAL_LIMITLESS = "https://limitlesstcg.com";
const cache = new Map();

function cacheKey(url) {
  return url.toString();
}

async function fetchText(url, ttlMs = 10 * 60 * 1000) {
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.text;

  const response = await fetch(url, {
    headers: {
      "user-agent": "Pokemon TCG Anti Meta (+https://limitlesstcg.com)",
      accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Limitless returned ${response.status} for ${url}`);
  }

  const text = await response.text();
  cache.set(key, { time: Date.now(), text });
  return text;
}

function decodeHtml(text = "") {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripTags(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePercent(value) {
  const match = String(value).match(/-?\d+(?:\.\d+)?\s*%/);
  return match ? Number(match[0].replace("%", "")) : null;
}

function parseNumber(value) {
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeUrl(href) {
  if (!href) return null;
  return href.startsWith("http") ? href : `${LIMITLESS}${href}`;
}

function normalizeOfficialUrl(href) {
  if (!href) return null;
  return href.startsWith("http") ? href : `${OFFICIAL_LIMITLESS}${href}`;
}

function getRows(html) {
  return html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
}

function getCells(row) {
  return [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
}

function getSpriteUrls(row) {
  return [...row.matchAll(/<img\b[^>]*class=["'][^"']*pokemon[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .map((src) => (src.startsWith("http") ? src : `${LIMITLESS}${src}`));
}

function getOfficialSpriteUrls(row) {
  return [...row.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((src) => /pokemon|deck|sprites|img/i.test(src))
    .map((src) => (src.startsWith("http") ? src : `${OFFICIAL_LIMITLESS}${src}`));
}

function getDeckAnchor(row, options = {}) {
  const anchors = [...row.matchAll(/<a\b[^>]*href=["']([^"']*\/decks\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const anchor of anchors) {
    const text = stripTags(anchor[2]);
    const href = decodeHtml(anchor[1]);
    if (text && (options.allowMatchups || !href.includes("/matchups"))) {
      const slug = href.match(/\/decks\/([^/?#]+)/)?.[1];
      return { name: text, slug, url: normalizeUrl(href) };
    }
  }
  return null;
}

function getOfficialDeckAnchor(row) {
  const anchors = [...row.matchAll(/<a\b[^>]*href=["']([^"']*\/decks\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const anchor of anchors) {
    const text = stripTags(anchor[2]);
    const href = decodeHtml(anchor[1]);
    if (text && /\/decks\/\d+/i.test(href)) {
      return { name: text, slug: href.match(/\/decks\/([^/?#]+)/)?.[1], url: normalizeOfficialUrl(href) };
    }
  }
  return null;
}

function cleanLimitlessParams(searchParams) {
  const params = new URLSearchParams(searchParams);
  for (const key of ["game", "candidates", "opponents", "minMatches", "groupVariants", "groupName", "variants", "source", "eventTypes"]) {
    params.delete(key);
  }
  return params;
}

function deckPath(slug, searchParams) {
  return `/decks/${slug}?${cleanLimitlessParams(searchParams).toString()}`;
}

function matchupsPath(slug, searchParams) {
  return `/decks/${slug}/matchups/?${cleanLimitlessParams(searchParams).toString()}`;
}

function limitlessDeckListParams(searchParams) {
  const params = new URLSearchParams(searchParams);
  for (const key of ["candidates", "opponents", "minMatches", "groupVariants", "source", "eventTypes"]) {
    params.delete(key);
  }
  if (!params.has("game")) params.set("game", "PTCG");
  return params;
}

function officialDeckListParams(searchParams) {
  const params = new URLSearchParams();
  params.set("variants", "true");

  const eventTypes = (searchParams.get("eventTypes") || "")
    .split(",")
    .map((type) => type.trim())
    .filter(Boolean);

  if (eventTypes.length) {
    for (const type of eventTypes) params.append("type", type);
  }

  return params;
}

function effectiveDeckParams(requestParams, metaDecks) {
  const firstDeckUrl = metaDecks[0]?.url ? new URL(metaDecks[0].url) : null;
  const params = firstDeckUrl ? new URLSearchParams(firstDeckUrl.search) : new URLSearchParams();

  for (const [key, value] of requestParams.entries()) {
    if (!["game", "candidates", "opponents", "minMatches", "groupVariants", "source", "eventTypes"].includes(key)) {
      params.set(key, value);
    }
  }

  return params;
}

function combinePercent(values, weights) {
  let weighted = 0;
  let total = 0;
  values.forEach((value, index) => {
    if (value === null || Number.isNaN(value)) return;
    const weight = weights[index] || 0;
    if (!weight) return;
    weighted += value * weight;
    total += weight;
  });
  return total ? weighted / total : null;
}

function normalizeCardName(line) {
  return line
    .replace(/^\d+\s+/, "")
    .replace(/\s+\([^)]+\)$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function groupKeyFromCard(cardName) {
  return cardName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function cardTokens(text) {
  const ignored = new Set(["ex", "v", "vstar", "vmax", "gx", "box", "the", "team", "mask"]);
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !ignored.has(token));
}

function deckIdentityKey(name) {
  return cardTokens(name)
    .map((token) => token.replace(/s$/, ""))
    .sort()
    .join("-");
}

function choosePrimaryPokemon(deckName, pokemonLines) {
  const deckTokens = new Set(cardTokens(deckName));
  let best = null;

  pokemonLines.forEach((line, index) => {
    const count = parseNumber(line) || 0;
    const name = normalizeCardName(line);
    const tokens = cardTokens(name);
    const overlap = tokens.filter((token) => deckTokens.has(token)).length;
    const hasRuleBoxName = /\b(ex|vstar|vmax|v-union|v)\b/i.test(name);
    const score = overlap * 100 + (hasRuleBoxName ? 10 : 0) + count - index / 100;

    if (!best || score > best.score) {
      best = { name, score };
    }
  });

  return best?.name || null;
}

function parsePokemonDecklist(html) {
  const decklistHtml = html.match(/<div class=["']decklist["'][\s\S]*?(?:<div class=["']buttons["']|<\/main>)/i)?.[0] || html;
  const pokemonSection = decklistHtml.match(/<div class=["']heading["']>Pokémon[^<]*<\/div>([\s\S]*?)<\/div>/i)?.[1] || "";

  return [...pokemonSection.matchAll(/<p>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((line) => /^\d+\s+.{2,}/.test(line));
}

function parseDecklist(html) {
  const decklistHtml = html.match(/<div class=["']decklist["'][\s\S]*?(?:<div class=["']buttons["']|<\/main>)/i)?.[0] || html;
  const cardLines = [...decklistHtml.matchAll(/<p>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((line) => /^\d+\s+.{2,}/.test(line));

  return [...new Set(cardLines)].slice(0, 90);
}

function parseBestFinishes(html) {
  const finishes = [];
  for (const row of getRows(html)) {
    if (!/\/tournament\//i.test(row) || !/\/player\//i.test(row)) continue;
    const cells = getCells(row).map(stripTags).filter(Boolean);
    const playerHref = [...row.matchAll(/href=["']([^"']*\/tournament\/[^"']*\/player\/[^"']*)["']/gi)]
      .map((m) => decodeHtml(m[1]))
      .find(Boolean);

    finishes.push({
      label: cells.join(" | "),
      playerUrl: normalizeUrl(playerHref?.replace(/\/decklist\/?$/, "")),
      decklistUrl: playerHref
        ? normalizeUrl(playerHref.endsWith("/decklist") ? playerHref : `${playerHref.replace(/\/$/, "")}/decklist`)
        : null
    });
  }
  return finishes.slice(0, 8);
}

async function parseMetaDecks(params) {
  const url = new URL("/decks", LIMITLESS);
  url.search = limitlessDeckListParams(params).toString();
  const html = await fetchText(url);
  const decks = [];

  for (const row of getRows(html)) {
    const anchor = getDeckAnchor(row);
    if (!anchor) continue;
    const cells = getCells(row).map(stripTags).filter(Boolean);
    const percents = cells.map(parsePercent).filter((v) => v !== null);
    const numbers = cells.map(parseNumber).filter((v) => v !== null);

    decks.push({
      name: anchor.name,
      slug: anchor.slug,
      url: anchor.url,
      limitlessDeckUrl: anchor.url,
      sprites: getSpriteUrls(row),
      share: parsePercent(cells[3]) ?? percents[0] ?? null,
      winRate: parsePercent(cells[5]) ?? percents.at(-1) ?? null,
      count: parseNumber(cells[2]) ?? numbers[1] ?? null,
      raw: cells
    });
  }

  const unique = new Map();
  for (const deck of decks) {
    if (deck.slug && !unique.has(deck.slug)) unique.set(deck.slug, deck);
  }
  return [...unique.values()];
}

async function parseOfficialMetaDecks(params) {
  const url = new URL("/decks", OFFICIAL_LIMITLESS);
  url.search = officialDeckListParams(params).toString();
  const html = await fetchText(url);
  const decks = [];

  for (const row of getRows(html)) {
    const anchor = getOfficialDeckAnchor(row);
    if (!anchor) continue;
    const cells = getCells(row).map(stripTags).filter(Boolean);
    const percents = cells.map(parsePercent).filter((v) => v !== null);
    const numbers = cells.map(parseNumber).filter((v) => v !== null);

    decks.push({
      name: anchor.name,
      slug: `official-${anchor.slug}`,
      officialSlug: anchor.slug,
      url: anchor.url,
      officialDeckUrl: anchor.url,
      sprites: getOfficialSpriteUrls(row),
      share: percents.at(-1) ?? null,
      points: numbers.at(-1) ?? null,
      key: deckIdentityKey(anchor.name),
      raw: cells
    });
  }

  return decks;
}

function findOnlineDeck(officialDeck, onlineDecks) {
  const key = officialDeck.key || deckIdentityKey(officialDeck.name);
  const exact = onlineDecks.find((deck) => deckIdentityKey(deck.name) === key);
  if (exact) return exact;

  const officialTokens = new Set(cardTokens(officialDeck.name));
  let best = null;

  for (const deck of onlineDecks) {
    const onlineTokens = cardTokens(deck.name);
    const overlap = onlineTokens.filter((token) => officialTokens.has(token)).length;
    const score = overlap / Math.max(officialTokens.size, onlineTokens.length, 1);
    if (overlap && (!best || score > best.score)) best = { deck, score };
  }

  return best?.score >= 0.5 ? best.deck : null;
}

function officialMetaAsOnlineDecks(officialDecks, onlineDecks) {
  const used = new Set();
  const mapped = [];

  for (const officialDeck of officialDecks) {
    const onlineDeck = findOnlineDeck(officialDeck, onlineDecks);
    if (!onlineDeck || used.has(onlineDeck.slug)) continue;
    used.add(onlineDeck.slug);
    mapped.push({
      ...onlineDeck,
      name: onlineDeck.name,
      sourceName: officialDeck.name,
      share: officialDeck.share,
      sprites: officialDeck.sprites.length ? officialDeck.sprites : onlineDeck.sprites,
      sourceDeckUrl: officialDeck.officialDeckUrl
    });
  }

  return mapped;
}

function blendedMetaDecks(onlineDecks, officialDecks) {
  const officialMapped = officialMetaAsOnlineDecks(officialDecks, onlineDecks);
  const bySlug = new Map();

  for (const deck of onlineDecks) {
    bySlug.set(deck.slug, { ...deck, shareTotal: deck.share || 0, shareSources: deck.share ? 1 : 0 });
  }

  for (const deck of officialMapped) {
    const existing = bySlug.get(deck.slug) || { ...deck, shareTotal: 0, shareSources: 0 };
    existing.shareTotal += deck.share || 0;
    existing.shareSources += deck.share ? 1 : 0;
    existing.sprites = deck.sprites?.length ? deck.sprites : existing.sprites;
    bySlug.set(deck.slug, existing);
  }

  return [...bySlug.values()]
    .map((deck) => ({ ...deck, share: deck.shareSources ? deck.shareTotal / deck.shareSources : deck.share }))
    .sort((a, b) => (b.share || 0) - (a.share || 0));
}

async function parseMatchups(slug, params) {
  const url = new URL(matchupsPath(slug, params), LIMITLESS);
  const html = await fetchText(url);
  const matchups = [];

  for (const row of getRows(html)) {
    const anchor = getDeckAnchor(row, { allowMatchups: true });
    if (!anchor || anchor.slug === slug) continue;
    const cells = getCells(row).map(stripTags).filter(Boolean);
    const percents = cells.map(parsePercent).filter((v) => v !== null);
    const numbers = cells.map(parseNumber).filter((v) => v !== null);

    matchups.push({
      opponent: anchor.name,
      opponentSlug: anchor.slug,
      opponentUrl: anchor.url,
      sprites: getSpriteUrls(row),
      matches: numbers[0] ?? null,
      winRate: percents.at(-1) ?? null,
      raw: cells
    });
  }

  return matchups;
}

function weightedScore(deck, matchups, metaOpponents, minMatches) {
  let weighted = 0;
  let weightTotal = 0;
  let countedMatchups = 0;
  const bySlug = new Map(matchups.map((m) => [m.opponentSlug, m]));

  for (const opponent of metaOpponents) {
    if (opponent.slug === deck.slug) continue;
    const matchup = bySlug.get(opponent.slug);
    if (!matchup || matchup.winRate === null) continue;
    if (matchup.matches !== null && matchup.matches < minMatches) continue;
    const weight = opponent.share ?? 0;
    if (!weight) continue;
    weighted += matchup.winRate * weight;
    weightTotal += weight;
    countedMatchups += 1;
  }

  return {
    score: weightTotal ? weighted / weightTotal : null,
    coverage: weightTotal,
    countedMatchups
  };
}

async function deckPrimaryCard(deck, params) {
  try {
    const deckHtml = await fetchText(new URL(deckPath(deck.slug, params), LIMITLESS));
    const finishes = parseBestFinishes(deckHtml);
    if (!finishes[0]?.decklistUrl) return null;

    const decklistHtml = await fetchText(finishes[0].decklistUrl);
    const pokemon = parsePokemonDecklist(decklistHtml);
    const primary = choosePrimaryPokemon(deck.name, pokemon);
    return primary ? { name: primary, key: groupKeyFromCard(primary) } : null;
  } catch {
    return null;
  }
}

async function groupedRankings(ranked, deckParams) {
  const groups = new Map();
  const keyedDecks = await Promise.all(
    ranked.map(async (deck) => {
      const primaryCard = await deckPrimaryCard(deck, deckParams);
      return {
        ...deck,
        primaryCard: primaryCard?.name || null,
        groupKey: primaryCard?.key || `deck-${deck.slug}`,
        groupName: primaryCard?.name || deck.name
      };
    })
  );

  for (const deck of keyedDecks) {
    const group = groups.get(deck.groupKey) || {
      name: deck.groupName,
      slug: deck.slug,
      url: deck.url,
      limitlessDeckUrl: deck.limitlessDeckUrl,
      share: 0,
      count: 0,
      variants: [],
      isGrouped: true
    };

    group.share += deck.share || 0;
    group.count += deck.count || 0;
    group.variants.push(deck);
    groups.set(deck.groupKey, group);
  }

  return [...groups.values()].map((group) => {
    group.variants.sort((a, b) => (b.antiMetaScore ?? -1) - (a.antiMetaScore ?? -1));
    const weights = group.variants.map((deck) => deck.share || 0);
    const representative = group.variants[0];
    const combinedMatchups = group.variants.flatMap((deck) =>
      [...deck.bestMatchups, ...deck.worstMatchups].map((matchup) => ({
        ...matchup,
        sourceDeck: deck.name
      }))
    );
    const uniqueMatchups = new Map();

    for (const matchup of combinedMatchups) {
      const existing = uniqueMatchups.get(matchup.opponentSlug);
      if (!existing || matchup.matches > existing.matches) {
        uniqueMatchups.set(matchup.opponentSlug, matchup);
      }
    }

    const cleanMatchups = [...uniqueMatchups.values()];

    return {
      ...group,
      slug: representative.slug,
      url: representative.url,
      limitlessDeckUrl: representative.limitlessDeckUrl,
      winRate: combinePercent(group.variants.map((deck) => deck.winRate), weights),
      antiMetaScore: combinePercent(group.variants.map((deck) => deck.antiMetaScore), weights),
      coverage: group.variants.reduce((total, deck) => total + (deck.coverage || 0), 0),
      countedMatchups: group.variants.reduce((total, deck) => total + (deck.countedMatchups || 0), 0),
      matchupsUrl: representative.matchupsUrl,
      detailUrl: `${representative.detailUrl}&groupName=${encodeURIComponent(group.name)}&variants=${encodeURIComponent(group.variants.map((deck) => deck.name).join("|"))}`,
      deckPageUrl: representative.deckPageUrl,
      sprites: [...new Set(group.variants.flatMap((deck) => deck.sprites || []))].slice(0, 4),
      bestMatchups: cleanMatchups.sort((a, b) => b.winRate - a.winRate).slice(0, 4),
      worstMatchups: cleanMatchups.sort((a, b) => a.winRate - b.winRate).slice(0, 4)
    };
  });
}

export async function getRankings(requestUrl) {
  const params = new URL(requestUrl, "http://localhost").searchParams;
  const source = params.get("source") || "online";
  const candidates = Math.min(Number(params.get("candidates") || 20), 50);
  const opponents = Math.min(Number(params.get("opponents") || 15), 40);
  const minMatches = Math.max(Number(params.get("minMatches") || 10), 0);
  const groupVariants = params.get("groupVariants") === "1";
  const metaDecks = await parseMetaDecks(params);
  const officialMetaDecks = source !== "online" ? await parseOfficialMetaDecks(params) : [];
  const sourceMetaDecks =
    source === "official"
      ? officialMetaAsOnlineDecks(officialMetaDecks, metaDecks)
      : source === "all"
        ? blendedMetaDecks(metaDecks, officialMetaDecks)
        : metaDecks;
  const deckParams = effectiveDeckParams(params, metaDecks);
  const detailParams = new URLSearchParams(deckParams);
  detailParams.set("minMatches", String(minMatches));
  const candidateDecks = (source === "online" ? metaDecks : sourceMetaDecks).slice(0, candidates);
  const metaOpponents = sourceMetaDecks.slice(0, opponents);
  const sourceShares = new Map(sourceMetaDecks.map((deck) => [deck.slug, deck.share]));

  const ranked = await Promise.all(
    candidateDecks.map(async (deck) => {
      const matchups = await parseMatchups(deck.slug, deckParams);
      const score = weightedScore(deck, matchups, metaOpponents, minMatches);
      const cleanMatchups = matchups
        .filter((m) => m.winRate !== null && (m.matches === null || m.matches >= minMatches))
        .sort((a, b) => b.winRate - a.winRate);

      return {
        ...deck,
        share: sourceShares.get(deck.slug) ?? deck.share,
        antiMetaScore: score.score,
        coverage: score.coverage,
        countedMatchups: score.countedMatchups,
        matchupsUrl: `${LIMITLESS}${matchupsPath(deck.slug, deckParams)}`,
        detailUrl: `/api/decks/${deck.slug}?${detailParams.toString()}`,
        deckPageUrl: `${LIMITLESS}${deckPath(deck.slug, deckParams)}`,
        bestMatchups: cleanMatchups.slice(0, 4),
        worstMatchups: cleanMatchups.slice(-4).reverse()
      };
    })
  );

  const decks = groupVariants ? await groupedRankings(ranked, deckParams) : ranked;
  decks.sort((a, b) => (b.antiMetaScore ?? -1) - (a.antiMetaScore ?? -1));

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: `${LIMITLESS}/decks?${limitlessDeckListParams(params).toString()}`,
    officialSourceUrl: source !== "online" ? `${OFFICIAL_LIMITLESS}/decks?${officialDeckListParams(params).toString()}` : null,
    settings: { source, candidates, opponents, minMatches, groupVariants, eventTypes: params.get("eventTypes") || "" },
    metaDecks,
    officialMetaDecks,
    decks
  };
}

export async function getDeckDetails(slug, requestUrl) {
  const params = new URL(requestUrl, "http://localhost").searchParams;
  const minMatches = Math.max(Number(params.get("minMatches") || 10), 0);
  const groupName = params.get("groupName");
  const variants = (params.get("variants") || "").split("|").filter(Boolean);
  const [deckHtml, matchups] = await Promise.all([
    fetchText(new URL(deckPath(slug, params), LIMITLESS)),
    parseMatchups(slug, params)
  ]);
  const finishes = parseBestFinishes(deckHtml);
  let sampleDecklist = [];

  if (finishes[0]?.decklistUrl) {
    try {
      sampleDecklist = parseDecklist(await fetchText(finishes[0].decklistUrl));
    } catch {
      sampleDecklist = [];
    }
  }

  const cleanMatchups = matchups.filter((m) => m.winRate !== null && (m.matches === null || m.matches >= minMatches));

  return {
    slug,
    groupName,
    variants,
    deckPageUrl: `${LIMITLESS}${deckPath(slug, params)}`,
    matchupsUrl: `${LIMITLESS}${matchupsPath(slug, params)}`,
    finishes,
    sampleDecklist,
    matchups: [...cleanMatchups].sort((a, b) => b.winRate - a.winRate),
    riskMatchups: [...cleanMatchups].sort((a, b) => a.winRate - b.winRate)
  };
}
