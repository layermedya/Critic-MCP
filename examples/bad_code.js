// WARNING: This file INTENTIONALLY contains INSECURE and INEFFICIENT code.
// It is designed to test the `review_code` tool of Critic-MCP.
// DO NOT USE IT IN ANY REAL ENVIRONMENT.

const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());

// FINDING 1 — SQL Injection (CRITICAL):
// User input is concatenated directly into the query string.
app.get('/api/user', async (req, res) => {
  const email = req.query.email;
  // attack: GET /api/user?email=' OR '1'='1' --
  const rows = await db.query(
    "SELECT * FROM users WHERE email = '" + email + "'"
  );
  res.json(rows);
});

// FINDING 2 — Stored XSS (CRITICAL):
// The user comment is returned to the client as HTML without escaping.
// FINDING 3 — Swallowed exception: the catch block is empty, hiding the error.
app.post('/api/comments', async (req, res) => {
  try {
    await db.query('INSERT INTO comments (body) VALUES (?)', [req.body.body]);
    res.send(req.body.body);
  } catch (e) {
    res.json({});
  }
});

// FINDING 4 — N+1 Queries (HIGH):
// A separate query runs for every single user.
app.get('/api/posts', async (req, res) => {
  const posts = await db.query('SELECT * FROM posts LIMIT 50');
  const result = [];
  for (const post of posts) {
    const author = await db.query(
      'SELECT name FROM users WHERE id = ?',
      [post.author_id]
    );
    result.push({ ...post, author: author[0]?.name });
  }
  res.json(result);
});

// FINDING 5 — Missing authorization (CRITICAL):
// Admin deletion is exposed with no authentication at all.
app.delete('/api/users/:id', async (req, res) => {
  await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

app.listen(3000);
