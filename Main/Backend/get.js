app.get('/api/user-data', async (req, res) => {

  const username = req.user.username;

  const [rows] = await db.query(
    'SELECT * FROM user_data WHERE username = ?',
    [username]
  );

  if (!rows.length) {

    return res.json({
      logs: [],
      alarms: {},
      habitEnabled: {},
      selectedSounds: {},
      customSounds: {},
      checkInHistory: [],
      quickAlarms: []
    });
  }

  res.json(rows[0].data);
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({
    username: req.user.username,
    name: req.user.name
  });
});

