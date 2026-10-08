const express = require("express");
const { getSyncState, runRemoteSync } = require("../adminSync");

const router = express.Router();

function requireAdminKey(req, res, next) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({ error: "Admin API is not configured" });
  }

  const suppliedKey = req.get("x-api-key");
  if (!suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  next();
}

router.get("/sync/status", requireAdminKey, (req, res) => {
  res.json(getSyncState());
});

router.post("/sync", requireAdminKey, async (req, res) => {
  try {
    const result = await runRemoteSync();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
