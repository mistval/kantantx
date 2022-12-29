import express from 'express';
import { createValidator } from 'express-joi-validation';
import { createUserBody } from './types/api_schemas/users';

const app = express();
const port = process.env['PORT'] ?? 3000;
const validator = createValidator();

app.post('/api/v1/users', validator.body(createUserBody), (req, res) => {
  // Create user
});

app.patch('/api/v1/users/:username', (req, res) => {
  // Patch user
});

app.get('/api/v1/documents', (req, res) => {

});

app.put('/api/v1/documents/:documentName/strings', (req, res) => {

});

app.get('/api/v1/documents/:documentName/strings', (req, res) => {

});

app.put('/api/v1/strings/:stringId/translations/:languageCode', (req, res) => {

});

app.get('/api/v1/strings/:stringId/history', (req, res) => {

});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
