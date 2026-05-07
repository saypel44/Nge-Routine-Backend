app.post('/api/user-data', async (req, res) => {

  const username = req.user.username;

  await db.query(
    `
    INSERT INTO user_data (username, data)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
    data = VALUES(data)
    `,
    [
      username,
      JSON.stringify(req.body)
    ]
  );
   
  res.json({
    success: true
  });
});