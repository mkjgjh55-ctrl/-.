require("dotenv").config();
const { REST, Routes } = require("discord.js");
const { execSync } = require("node:child_process");
// Commands are registered automatically by src/index.js on startup.
// This script is intentionally a simple environment check.
for (const key of ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"]) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}
console.log("Environment looks ready. Start with: npm start");
