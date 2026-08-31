'use strict';

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'warnings.json');

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

let cache = loadDB();

function key(guildId, userId) {
  return `${guildId}_${userId}`;
}

function addWarning(guildId, userId, reason) {
  const k = key(guildId, userId);
  if (!cache[k]) cache[k] = { warnings: [], muteCount: 0 };
  cache[k].warnings.push({ reason, date: new Date().toISOString() });
  saveDB(cache);
  return cache[k].warnings.length;
}

function getWarningCount(guildId, userId) {
  const k = key(guildId, userId);
  return cache[k] ? cache[k].warnings.length : 0;
}

function getWarnings(guildId, userId) {
  const k = key(guildId, userId);
  return cache[k] ? cache[k].warnings : [];
}

function clearWarnings(guildId, userId) {
  const k = key(guildId, userId);
  if (cache[k]) {
    cache[k].warnings = [];
    saveDB(cache);
  }
}

function incrementMuteCount(guildId, userId) {
  const k = key(guildId, userId);
  if (!cache[k]) cache[k] = { warnings: [], muteCount: 0 };
  cache[k].muteCount += 1;
  saveDB(cache);
  return cache[k].muteCount;
}

module.exports = {
  addWarning,
  getWarningCount,
  getWarnings,
  clearWarnings,
  incrementMuteCount,
};
