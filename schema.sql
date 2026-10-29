-- Lista de assinantes do Cartilhas (notificação por email de texto novo).
-- Rodar depois de `npx wrangler d1 create cartilhas-subscribers`:
--   npx wrangler d1 execute cartilhas-subscribers --remote --file=./schema.sql
CREATE TABLE subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | unsubscribed
  confirm_token TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);
