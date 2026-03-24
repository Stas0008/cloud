const express = require('express');
const mongoose = require('mongoose');
const client = require('prom-client');
const app = express();
app.use(express.json());

// --- 1. НАЛАШТУВАННЯ МЕТРИК PROMETHEUS ---
// Збір стандартних метрик Node.js (CPU, RAM, Event Loop)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// Кастомна метрика: лічильник HTTP-запитів
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Загальна кількість HTTP-запитів до API',
  labelNames: ['method', 'route', 'status']
});

// --- 2. НАЛАШТУВАННЯ СТРАТЕГІЇ ЛОГУВАННЯ ---
// Middleware для логування кожного запиту у форматі JSON
app.use((req, res, next) => {
    res.on('finish', () => {
        const logEntry = {
            level: res.statusCode >= 400 ? 'error' : 'info',
            method: req.method,
            route: req.url,
            status: res.statusCode,
            time: new Date().toISOString()
        };
        // Вивід логу в stdout
        console.log(JSON.stringify(logEntry));
        
        // Збільшення лічильника метрик
        httpRequestCounter.labels(req.method, req.url, res.statusCode).inc();
    });
    next();
});

// --- 3. ПІДКЛЮЧЕННЯ ДО БД ТА БІЗНЕС-ЛОГІКА ---
mongoose.connect('mongodb://mongodb-service:27017/stackoverflow_clone', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log(JSON.stringify({ level: 'info', message: 'Підключено до MongoDB' })))
  .catch(err => console.error(JSON.stringify({ level: 'fatal', message: 'Помилка БД', error: err.message })));

const QuestionSchema = new mongoose.Schema({
    id: String, authorId: String, title: String, body: String, votes: { type: Number, default: 0 }
});
const Question = mongoose.model('Question', QuestionSchema);

app.post('/api/questions', async (req, res) => {
    try {
        const newQuestion = new Question(req.body);
        await newQuestion.save();
        res.status(201).json(newQuestion);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/questions', async (req, res) => {
    const questions = await Question.find();
    res.json(questions);
});

// --- 4. ЕНДПОІНТ ДЛЯ ЗБОРУ МЕТРИК ---
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
});

app.listen(3000, () => {
    console.log(JSON.stringify({ level: 'info', message: 'Сервер працює на порту 3000' }));
});