import express from 'express';
import * as fs from 'fs';
import apiRouter from './routes/api';

const app = express();
const PORT = process.env.PORT ?? 3001;
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR ?? '/app/downloads';

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(express.json());
app.use('/api', apiRouter);

app.listen(Number(PORT), () => {
  console.log(`Backend listening on :${PORT}`);
});
